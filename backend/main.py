import base64
import json
import os
import re
import xml.etree.ElementTree as ET

import fitz  # PyMuPDF
import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel
from sqlalchemy.orm import Session


import auth
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
import models
from database import engine, get_db, SessionLocal

load_dotenv()
SERVER_GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# The first model that works for a given key is remembered for the process
# lifetime so we don't probe the fallbacks on every request.
MODEL_CANDIDATES = [
    m for m in [
        os.environ.get("GEMINI_MODEL", ""),
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
    ] if m
]
_working_model = None

models.Base.metadata.create_all(bind=engine)


app = FastAPI(title="ScholarFlow API")

# CORS_ORIGINS is a comma-separated allowlist (e.g. your Vercel URL). If
# unset, all origins are allowed, which is fine since this API requires a
# per-request Gemini key and holds no server-side secrets per user.
_cors_env = os.environ.get("CORS_ORIGINS", "").strip()
allow_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

def resolve_api_key(x_gemini_key: str | None) -> str:
    key = (x_gemini_key or "").strip() or SERVER_GEMINI_API_KEY
    if not key:
        raise HTTPException(
            status_code=401,
            detail="No Gemini API key configured. Add your key in Settings (get a free one at https://aistudio.google.com/apikey).",
        )
    return key


def generate_text(api_key: str, prompt: str, config: genai_types.GenerateContentConfig | None = None, requested_model: str | None = None) -> str:
    """Generate content, falling back through MODEL_CANDIDATES on 404s."""
    global _working_model
    client = genai.Client(api_key=api_key)
    
    candidates = []
    if requested_model:
        candidates.append(requested_model)
    elif _working_model:
        candidates.append(_working_model)
        
    for m in MODEL_CANDIDATES:
        if m not in candidates:
            candidates.append(m)
            
    last_error = None
    for model_name in candidates:
        try:
            response = client.models.generate_content(
                model=model_name, contents=prompt, config=config,
            )
            if not requested_model:
                _working_model = model_name
            if not response.text:
                raise HTTPException(status_code=502, detail="Gemini returned an empty response. Try again.")
            return response.text
        except genai_errors.APIError as e:
            last_error = e
            if e.code == 404:
                continue  # model unavailable for this key; try the next one
            if e.code in (401, 403) or (e.code == 400 and "api key" in (e.message or "").lower()):
                raise HTTPException(status_code=401, detail="Gemini rejected the API key. Check it in Settings.")
            if e.code == 429:
                raise HTTPException(status_code=429, detail="Gemini rate limit reached for this key. Wait a minute and retry.")
            raise HTTPException(status_code=502, detail=f"Gemini error: {e.message or str(e)}")
    raise HTTPException(status_code=502, detail=f"No available Gemini model for this key. Last error: {last_error}")


def generate_text_stream(api_key: str, prompt: str, config: genai_types.GenerateContentConfig | None = None, requested_model: str | None = None):
    global _working_model
    client = genai.Client(api_key=api_key)
    
    candidates = []
    if requested_model:
        candidates.append(requested_model)
    elif _working_model:
        candidates.append(_working_model)
        
    for m in MODEL_CANDIDATES:
        if m not in candidates:
            candidates.append(m)
            
    last_error = None
    for model_name in candidates:
        try:
            response = client.models.generate_content_stream(
                model=model_name, contents=prompt, config=config,
            )
            if not requested_model:
                _working_model = model_name
            for chunk in response:
                yield chunk
            return
        except genai_errors.APIError as e:
            last_error = e
            if e.code == 404:
                continue
            if e.code in (401, 403) or (e.code == 400 and "api key" in (e.message or "").lower()):
                raise HTTPException(status_code=401, detail="Gemini rejected the API key. Check it in Settings.")
            if e.code == 429:
                raise HTTPException(status_code=429, detail="Gemini rate limit reached for this key. Wait a minute and retry.")
            raise HTTPException(status_code=502, detail=f"Gemini error: {e.message or str(e)}")
    raise HTTPException(status_code=502, detail=f"No available Gemini model for this key. Last error: {last_error}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class CollectionCreate(BaseModel):
    name: str
    description: str = ""

class IngestRequest(BaseModel):
    arxiv_url: str
    collection_id: int

class ChatRequest(BaseModel):
    message: str

class ValidateKeyRequest(BaseModel):
    api_key: str

class MovePaperRequest(BaseModel):
    target_collection_id: int

class MoveAllRequest(BaseModel):
    target_collection_id: int

class ImplementRequest(BaseModel):
    hints: str = ""


# ---------------------------------------------------------------------------
# arXiv helpers
# ---------------------------------------------------------------------------

# Matches new-style IDs (2301.12345) and old-style IDs (hep-th/9901001),
# with an optional version suffix.
ARXIV_ID_RE = r'(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?'

def extract_arxiv_id(url: str) -> str:
    match = re.search(r'(?:abs|pdf|html)/' + ARXIV_ID_RE, url)
    if not match:
        match = re.fullmatch(ARXIV_ID_RE, url.strip())
    if match:
        return match.group(1)
    raise ValueError("Could not find an arXiv ID in that URL. Expected something like https://arxiv.org/abs/1706.03762")


def paper_filename(arxiv_id: str) -> str:
    return f"arxiv_{arxiv_id.replace('/', '_')}.pdf"


async def download_pdf(arxiv_id: str) -> bytes:
    rate_limited = False
    async with httpx.AsyncClient(timeout=60.0) as client:
        for host in ("export.arxiv.org", "arxiv.org"):
            try:
                resp = await client.get(f"https://{host}/pdf/{arxiv_id}", follow_redirects=True)
            except httpx.HTTPError:
                continue
            if resp.status_code == 200 and resp.content.startswith(b"%PDF"):
                return resp.content
            if resp.status_code == 429:
                rate_limited = True
    if rate_limited:
        raise HTTPException(status_code=429, detail="arXiv is rate-limiting downloads right now. Wait a minute and try again.")
    raise HTTPException(status_code=502, detail=f"Failed to download PDF for {arxiv_id} from arXiv.")


async def fetch_arxiv_metadata(arxiv_id: str) -> dict:
    meta = {"title": f"arXiv:{arxiv_id}", "authors": "Unknown", "year": None}
    api_url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(api_url, follow_redirects=True)
        if resp.status_code != 200:
            return meta
        root = ET.fromstring(resp.content)
        ns = {'atom': 'http://www.w3.org/2005/Atom'}
        entry = root.find('atom:entry', ns)
        if entry is None:
            return meta
        title = entry.find('atom:title', ns)
        if title is not None and title.text:
            meta["title"] = " ".join(title.text.split())
        published = entry.find('atom:published', ns)
        if published is not None and published.text:
            meta["year"] = int(published.text[:4])
        authors = [a.text for a in entry.findall('atom:author/atom:name', ns) if a.text]
        if authors:
            meta["authors"] = ", ".join(authors)
    except Exception as e:
        print("Failed to fetch arXiv metadata:", e)
    return meta


def paper_to_dict(p: models.Paper) -> dict:
    return {
        "id": p.id,
        "arxiv_id": p.arxiv_id,
        "collection_id": p.collection_id,
        "title": p.title,
        "authors": p.authors,
        "year": p.year,
        "tags": p.tags,
        "filename": paper_filename(p.arxiv_id),
    }



# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/register")
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == user_in.username).first()
    if user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = auth.get_password_hash(user_in.password)
    db_user = models.User(username=user_in.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Create default collection for the new user
    db.add(models.Collection(
        name="My Library",
        description="Default collection for imported papers",
        user_id=db_user.id
    ))
    db.commit()
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": db_user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# ---------------------------------------------------------------------------
# Settings / health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok", "server_key_configured": bool(SERVER_GEMINI_API_KEY)}


@app.get("/api/settings/models")
def get_models():
    # Return a curated list of popular models
    return [
        {"id": "gemini-3.5-pro", "name": "Gemini 3.5 Pro"},
        {"id": "gemini-3.5-flash", "name": "Gemini 3.5 Flash"},
        {"id": "gemini-3.1-pro", "name": "Gemini 3.1 Pro"},
        {"id": "gemini-3.1-flash-lite", "name": "Gemini 3.1 Flash Lite"},
        {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
        {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"},
        {"id": "gemini-2.5-flash-lite", "name": "Gemini 2.5 Flash Lite"},
    ]


@app.patch("/api/user")
def update_user(req: UserCreate, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    if req.username and req.username != user.username:
        existing = db.query(models.User).filter(models.User.username == req.username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
        user.username = req.username
    if req.password:
        user.hashed_password = auth.get_password_hash(req.password)
    db.commit()
    return {"message": "Profile updated"}


@app.post("/api/settings/validate_key")
def validate_key(req: ValidateKeyRequest):
    key = req.api_key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="API key is empty.")
    generate_text(key, "Reply with the single word: ok")
    return {"valid": True}


# ---------------------------------------------------------------------------
# Ingest / papers / collections
# ---------------------------------------------------------------------------

@app.post("/api/ingest")
async def ingest_paper(req: IngestRequest, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    try:
        arxiv_id = extract_arxiv_id(req.arxiv_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    collection = db.query(models.Collection).filter(models.Collection.id == req.collection_id, models.Collection.user_id == user.id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    pdf_bytes = await download_pdf(arxiv_id)

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        full_text = "".join(page.get_text() for page in doc)
    except Exception:
        raise HTTPException(status_code=502, detail="Downloaded file could not be parsed as a PDF.")

    paper = db.query(models.Paper).filter(models.Paper.arxiv_id == arxiv_id, models.Paper.user_id == user.id).first()
    already_existed = paper is not None

    if paper:
        # Re-importing an existing paper refreshes its text and moves it to
        # the requested collection.
        paper.full_text = full_text
        paper.collection_id = req.collection_id
    else:
        meta = await fetch_arxiv_metadata(arxiv_id)
        paper = models.Paper(
            arxiv_id=arxiv_id,
            collection_id=req.collection_id, user_id=user.id,
            title=meta["title"],
            authors=meta["authors"],
            year=meta["year"],
            full_text=full_text,
        )
        db.add(paper)
    db.commit()
    db.refresh(paper)

    return {
        **paper_to_dict(paper),
        "already_existed": already_existed,
        "pdf_b64": base64.b64encode(pdf_bytes).decode('utf-8'),
    }


@app.get("/api/papers/{paper_id}/pdf")
async def get_paper_pdf(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    pdf_bytes = await download_pdf(paper.arxiv_id)
    return {
        "filename": paper_filename(paper.arxiv_id),
        "pdf_b64": base64.b64encode(pdf_bytes).decode('utf-8'),
    }


@app.post("/api/collections")
def create_collection(req: CollectionCreate, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")
    collection = models.Collection(name=name, description=req.description.strip(), user_id=user.id)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return {"id": collection.id, "name": collection.name, "description": collection.description, "created_at": collection.created_at}


@app.get("/api/collections")
def get_collections(db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    collections = db.query(models.Collection).filter(models.Collection.user_id == user.id).order_by(models.Collection.created_at.desc()).all()
    return [{
        "id": c.id,
        "name": c.name,
        "description": c.description,
        "created_at": c.created_at,
        "papers": [paper_to_dict(p) for p in c.papers],
    } for c in collections]


@app.patch("/api/papers/{paper_id}/move")
def move_paper(paper_id: int, req: MovePaperRequest, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    target = db.query(models.Collection).filter(models.Collection.id == req.target_collection_id, models.Collection.user_id == user.id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target collection not found")
    paper.collection_id = req.target_collection_id
    db.commit()
    return {"message": "Paper moved successfully"}


@app.delete("/api/collections/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    collection = db.query(models.Collection).filter(models.Collection.id == collection_id, models.Collection.user_id == user.id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    db.delete(collection)
    db.commit()
    return {"message": "Collection deleted successfully"}


@app.post("/api/collections/{collection_id}/move_all")
def move_all_papers(collection_id: int, req: MoveAllRequest, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    target = db.query(models.Collection).filter(models.Collection.id == req.target_collection_id, models.Collection.user_id == user.id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target collection not found")
    papers = db.query(models.Paper).filter(models.Paper.collection_id == collection_id, models.Paper.user_id == user.id).all()
    for paper in papers:
        paper.collection_id = req.target_collection_id
    db.commit()
    return {"message": f"Moved {len(papers)} papers successfully"}


@app.get("/api/papers")
def get_papers(db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    papers = db.query(models.Paper).filter(models.Paper.user_id == user.id).order_by(models.Paper.created_at.desc()).all()
    return [paper_to_dict(p) for p in papers]


@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    db.delete(paper)
    db.commit()
    return {"message": "Paper deleted successfully"}


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------

@app.get("/api/papers/{paper_id}/chats")
def get_chats(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    chats = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.paper_id == paper_id)
        .order_by(models.ChatMessage.timestamp.asc(), models.ChatMessage.id.asc())
        .all()
    )
    return [{"id": c.id, "role": c.role, "content": c.content, "timestamp": c.timestamp} for c in chats]


@app.post("/api/papers/{paper_id}/chat")
def chat_with_paper(
    paper_id: int,
    req: ChatRequest,
    db: Session = Depends(get_db),
    x_gemini_key: str | None = Header(default=None),
    x_gemini_chat_model: str | None = Header(default=None),
    user: models.User = Depends(auth.get_current_user)
):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    api_key = resolve_api_key(x_gemini_key)

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.paper_id == paper_id)
        .order_by(models.ChatMessage.timestamp.desc(), models.ChatMessage.id.desc())
        .limit(10)
        .all()
    )
    history_text = "\n".join(
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}" for m in reversed(history)
    )

    system_instruction = (
        "You are an expert AI research assistant helping a reader understand a paper. "
        "Always use simple, plain English. Give direct, to-the-point explanations. "
        "IMPORTANT MATH FORMATTING: When writing mathematical formulas, physics equations, or chemical notations, ALWAYS use block math formatting (`$$` on a new line) for any formula longer than a few characters or containing fractions, integrals, or complex symbols. Only use inline math (`$`) for simple single-letter variables (e.g. $x$, $Q$). "
        "If the user asks to 'implement this paper' or asks for implementation options, "
        "you MUST respond with a JSON object in exactly this format, generating 3 distinct options based on the specific architectures or algorithms in the paper (no markdown code blocks): "
        '{"type": "implementation_plan_choice", "text": "There are multiple ways to approach this. Which flow would you like to implement?", "options": ["**<Short Title>**: <1-sentence description>", "**<Short Title>**: <1-sentence description>", "**<Short Title>**: <1-sentence description>"]} '
        "When the user selects an option, you MUST write an incredibly rigorous, deeply detailed software architecture plan. It must include exact math-to-code translations, exact tensor dimensions, class/function signatures, and a strict step-by-step implementation guide. Return it in this exact JSON format: "
        '{"type": "ready_to_implement", "text": "Here is the rigorous technical architecture based on your choice:", "plan": "The highly detailed Markdown plan goes here..."} '
        "Otherwise, for normal questions, just return plain Markdown text. Do NOT wrap normal text in JSON."
    )
    prompt = (
        f"{system_instruction}\n\n"
        f"Here is the full text of the paper '{paper.title}':\n\n{(paper.full_text or '')[:100000]}\n\n"
        + (f"Recent conversation:\n{history_text}\n\n" if history_text else "")
        + f"User's message: {req.message}"
    )

    # Generate first; only persist the exchange once we have a real answer so
    # failures don't leave orphaned or error messages in the history.
    assistant_text = generate_text(api_key, prompt, requested_model=x_gemini_chat_model).strip()
    
    # Strip markdown formatting if Gemini wrapped the JSON response
    if assistant_text.startswith("```json") and assistant_text.endswith("```"):
        assistant_text = assistant_text[7:-3].strip()
    elif assistant_text.startswith("```") and assistant_text.endswith("```") and "{" in assistant_text[:5]:
        assistant_text = assistant_text[3:-3].strip()

    user_msg = models.ChatMessage(paper_id=paper_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()
    assistant_msg = models.ChatMessage(paper_id=paper_id, role="assistant", content=assistant_text)
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return {"id": assistant_msg.id, "role": assistant_msg.role, "content": assistant_msg.content, "timestamp": assistant_msg.timestamp}


@app.post("/api/papers/{paper_id}/chat_stream")
def chat_with_paper_stream(
    paper_id: int,
    req: ChatRequest,
    db: Session = Depends(get_db),
    x_gemini_key: str | None = Header(default=None),
    x_gemini_chat_model: str | None = Header(default=None),
    user: models.User = Depends(auth.get_current_user)
):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    api_key = resolve_api_key(x_gemini_key)

    history = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.paper_id == paper_id)
        .order_by(models.ChatMessage.timestamp.desc(), models.ChatMessage.id.desc())
        .limit(10)
        .all()
    )
    history_text = "\n".join(
        f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}" for m in reversed(history)
    )

    system_instruction = (
        "You are an expert AI research assistant helping a reader understand a paper. "
        "Always use simple, plain English. Give direct, to-the-point explanations. "
        "IMPORTANT MATH FORMATTING: When writing mathematical formulas, physics equations, or chemical notations, ALWAYS use block math formatting (`$$` on a new line) for any formula longer than a few characters or containing fractions, integrals, or complex symbols. Only use inline math (`$`) for simple single-letter variables (e.g. $x$, $Q$). "
        "If the user asks to 'implement this paper' or asks for implementation options, "
        "you MUST respond with a JSON object in exactly this format, generating 3 distinct options based on the specific architectures or algorithms in the paper (no markdown code blocks): "
        '{"type": "implementation_plan_choice", "text": "There are multiple ways to approach this. Which flow would you like to implement?", "options": ["**<Short Title>**: <1-sentence description>", "**<Short Title>**: <1-sentence description>", "**<Short Title>**: <1-sentence description>"]} '
        "When the user selects an option, you MUST write an incredibly rigorous, deeply detailed software architecture plan. It must include exact math-to-code translations, exact tensor dimensions, class/function signatures, and a strict step-by-step implementation guide. Return it in this exact JSON format: "
        '{"type": "ready_to_implement", "text": "Here is the rigorous technical architecture based on your choice:", "plan": "The highly detailed Markdown plan goes here..."} '
        "Otherwise, for normal questions, just return plain Markdown text. Do NOT wrap normal text in JSON."
    )
    prompt = (
        f"{system_instruction}\n\n"
        f"Here is the full text of the paper '{paper.title}':\n\n{(paper.full_text or '')[:100000]}\n\n"
        + (f"Recent conversation:\n{history_text}\n\n" if history_text else "")
        + f"User's message: {req.message}"
    )

    # Save user message immediately
    user_msg = models.ChatMessage(paper_id=paper_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()
    
    config = enhance_config(None, x_gemini_temperature, x_gemini_thinking_budget)

    def event_generator():
        try:
            stream = generate_text_stream(api_key, prompt, config=config, requested_model=x_gemini_chat_model)
            full_response = ""
            for chunk in stream:
                if chunk.text:
                    full_response += chunk.text
                    data = json.dumps({"text": chunk.text})
                    yield f"data: {data}\n\n"
            
            if full_response.startswith("```json") and full_response.endswith("```"):
                full_response = full_response[7:-3].strip()
            elif full_response.startswith("```") and full_response.endswith("```") and "{" in full_response[:5]:
                full_response = full_response[3:-3].strip()
                
            with SessionLocal() as safe_db:
                assistant_msg = models.ChatMessage(paper_id=paper_id, role="assistant", content=full_response)
                safe_db.add(assistant_msg)
                safe_db.commit()
                safe_db.refresh(assistant_msg)
                end_data = json.dumps({"done": True, "id": assistant_msg.id, "timestamp": assistant_msg.timestamp.isoformat()})
                yield f"data: {end_data}\n\n"
        except Exception as e:
            err_data = json.dumps({"error": str(e)})
            yield f"data: {err_data}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.delete("/api/papers/{paper_id}/chats")
def clear_chats(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    db.query(models.ChatMessage).filter(models.ChatMessage.paper_id == paper_id).delete()
    db.commit()
    return {"message": "Chat history cleared"}


# ---------------------------------------------------------------------------
# Implement: generate a runnable project from the paper
# ---------------------------------------------------------------------------

IMPLEMENT_PROMPT = """You are an expert research engineer. Your task is to implement the method described in a research paper as a small, clean, runnable code project.

Requirements:
- Recreate the core method/algorithm/architecture described in the paper as faithfully as is practical at small scale.
- Prefer Python unless the paper is clearly about another ecosystem.
- Keep dependencies minimal and standard (e.g. numpy, torch). Use small synthetic or toy data so everything runs on a laptop without downloads.
- Include: a README.md (what the paper proposes, how the code maps to the paper's sections/equations, how to run it), a dependency file (requirements.txt or equivalent), the source files, and a minimal entry point (e.g. train.py / main.py / demo).
- Code must be complete and syntactically valid — no placeholders like "..." or "TODO: implement".

Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):
{
  "project_name": "short-kebab-case-name",
  "summary": "2-3 sentence description of what was implemented and any simplifications made",
  "run_instructions": "short shell instructions to run the project",
  "files": [
    {"path": "README.md", "content": "..."},
    {"path": "requirements.txt", "content": "..."},
    {"path": "src/model.py", "content": "..."}
  ]
}

File paths must be relative (no leading /, no ..).
"""


def _parse_manifest(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r'^```[a-zA-Z]*\n', '', text)
        text = re.sub(r'\n```$', '', text.strip())
    try:
        manifest = json.loads(text)
    except json.JSONDecodeError:
        # Fall back to the largest {...} block in the response
        start, end = text.find('{'), text.rfind('}')
        if start == -1 or end <= start:
            raise HTTPException(status_code=502, detail="Gemini did not return a valid project manifest. Try again.")
        try:
            manifest = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            raise HTTPException(status_code=502, detail="Gemini returned malformed JSON for the project. Try again.")

    files = manifest.get("files")
    if not isinstance(files, list) or not files:
        raise HTTPException(status_code=502, detail="Gemini returned a manifest with no files. Try again.")

    safe_files = []
    for f in files:
        path = str(f.get("path", "")).strip().replace("\\", "/")
        content = f.get("content")
        if not path or content is None:
            continue
        # Reject path traversal / absolute paths
        if path.startswith("/") or ".." in path.split("/"):
            continue
        safe_files.append({"path": path, "content": str(content)})
    if not safe_files:
        raise HTTPException(status_code=502, detail="Gemini returned no usable files. Try again.")

    return {
        "project_name": re.sub(r'[^a-zA-Z0-9._-]', '-', str(manifest.get("project_name", "paper-implementation")))[:64] or "paper-implementation",
        "summary": str(manifest.get("summary", "")),
        "run_instructions": str(manifest.get("run_instructions", "")),
        "files": safe_files,
    }


EVALUATOR_PROMPT = """You are a completely ruthless, highly critical Staff Software Engineer evaluating an AI-generated implementation of a complex research paper. 
Your ONLY goal is to find bugs, logic errors, incomplete implementations, or deviations from the original plan.

CRITICAL RULES FOR EVALUATION:
1. You MUST find at least one flaw in the first turn, no matter how small. It is literally impossible for a first-draft LLM code to be perfect. Force the coder to iterate.
2. Check EVERY SINGLE LINE of code for placeholders like `...`, `TODO`, `pass`, or `NotImplemented`. If you find ANY, reject it immediately.
3. Check if the mathematical formulas from the paper are perfectly translated into tensor operations. Are the dimensions correct?
4. Are the neural network layers strictly following the paper's architecture?

If the project is 100% PERFECT, production-ready, and has NO placeholders, reply with exactly the word: "PASS" (and nothing else).
If there are ANY issues, reply with a brutal, detailed list of feedback for the coder to fix. DO NOT BE POLITE. Just list the bugs."""

@app.post("/api/papers/{paper_id}/implement")
def implement_paper(
    paper_id: int,
    req: ImplementRequest,
    db: Session = Depends(get_db),
    x_gemini_key: str | None = Header(default=None),
    x_gemini_loop_model: str | None = Header(default=None),
    x_gemini_temperature: str | None = Header(default=None),
    x_gemini_thinking_budget: str | None = Header(default=None),
    user: models.User = Depends(auth.get_current_user)
):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    if not paper.full_text:
        raise HTTPException(status_code=400, detail="This paper has no extracted text. Re-import it first.")

    api_key = resolve_api_key(x_gemini_key)

    prompt = (
        f"{IMPLEMENT_PROMPT}\n\n"
        + (f"Detailed Implementation Plan to follow:\n{req.hints}\n\n" if req.hints.strip() else "")
        + f"Paper title: {paper.title}\n\nFull paper text:\n\n{paper.full_text[:80000]}"
    )

    config = genai_types.GenerateContentConfig(response_mime_type="application/json")
    eval_config = genai_types.GenerateContentConfig()
    
    config = enhance_config(config, x_gemini_temperature, x_gemini_thinking_budget)
    eval_config = enhance_config(eval_config, x_gemini_temperature, x_gemini_thinking_budget)

    max_turns = 3
    current_turn = 1
    raw = ""

    while current_turn <= max_turns:
        print(f"[{paper.title}] Implementation Loop Turn {current_turn}/{max_turns}...")
        raw = generate_text(api_key, prompt, config=config, requested_model=x_gemini_loop_model)
        
        eval_prompt = (
            f"{EVALUATOR_PROMPT}\n\n"
            f"Original Plan to Verify:\n{req.hints}\n\n"
            f"Generated Project Manifest (JSON):\n{raw}"
        )
        
        eval_result = generate_text(api_key, eval_prompt, config=eval_config, requested_model=x_gemini_loop_model).strip()
        print(f"[{paper.title}] Evaluator Result: {eval_result[:100]}...")
        
        if eval_result.strip().upper() == "PASS" or current_turn == max_turns:
            break
            
        prompt += f"\n\n--- TURN {current_turn} EVALUATOR FEEDBACK ---\nYour previous code was rejected. Fix these issues:\n{eval_result}\n\nProvide the completely fixed JSON manifest."
        current_turn += 1

    manifest = _parse_manifest(raw)
    manifest["paper_id"] = paper.id
    manifest["paper_title"] = paper.title

    import os
    project_dir = os.path.join(os.getcwd(), "generated_projects", manifest["project_name"])
    os.makedirs(project_dir, exist_ok=True)
    for f in manifest.get("files", []):
        file_path = os.path.join(project_dir, f["path"])
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, "w", encoding="utf-8") as f_out:
            f_out.write(f["content"])
            
    manifest["local_path"] = project_dir

    return manifest
