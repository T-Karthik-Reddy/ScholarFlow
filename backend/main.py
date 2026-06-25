import os
import re
import httpx
import fitz  # PyMuPDF
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
import google.generativeai as genai
from dotenv import load_dotenv

import models
from database import engine, get_db

load_dotenv()
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ScholarFlow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CollectionCreate(BaseModel):
    name: str
    description: str = ""

class IngestRequest(BaseModel):
    arxiv_url: str
    collection_id: int

class ChatRequest(BaseModel):
    message: str

def extract_arxiv_id(url: str) -> str:
    match = re.search(r'(?:abs|pdf)/(\d+\.\d+)(?:v\d+)?', url)
    if not match:
        match = re.search(r'(\d+\.\d+)', url)
    if match:
        return match.group(1)
    raise ValueError("Invalid arXiv URL")

@app.post("/api/ingest")
async def ingest_paper(req: IngestRequest, db: Session = Depends(get_db)):
    try:
        arxiv_id = extract_arxiv_id(req.arxiv_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Check if exists
    paper = db.query(models.Paper).filter(models.Paper.arxiv_id == arxiv_id).first()
    if paper:
        # Just return the metadata, maybe the frontend needs to download it again if it doesn't have it, but we can't send bytes if it's already ingested.
        # Actually, let's just return the metadata, frontend should handle the file.
        # Wait, if the frontend doesn't have the file, we might need to send it.
        pass

    import xml.etree.ElementTree as ET
    
    # Download from arxiv export
    pdf_url = f"https://export.arxiv.org/pdf/{arxiv_id}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(pdf_url, follow_redirects=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to download from arXiv")
        pdf_bytes = resp.content

    # Extract text from PDF for search/chat
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full_text = ""
    for page_num in range(len(doc)):
        full_text += doc[page_num].get_text()

    # Fetch precise metadata from arXiv API
    title = f"arXiv:{arxiv_id}" # Fallback
    authors = "Unknown"
    year = None

    api_url = f"https://export.arxiv.org/api/query?id_list={arxiv_id}"
    try:
        async with httpx.AsyncClient() as client:
            meta_resp = await client.get(api_url, follow_redirects=True)
            if meta_resp.status_code == 200:
                root = ET.fromstring(meta_resp.content)
                ns = {'atom': 'http://www.w3.org/2005/Atom'}
                entry = root.find('atom:entry', ns)
                if entry is not None:
                    api_title = entry.find('atom:title', ns)
                    if api_title is not None and api_title.text:
                        title = api_title.text.replace('\n', ' ').strip()
                    
                    api_published = entry.find('atom:published', ns)
                    if api_published is not None and api_published.text:
                        year = int(api_published.text[:4])
                    
                    api_authors = entry.findall('atom:author/atom:name', ns)
                    if api_authors:
                        authors = ", ".join([a.text for a in api_authors])
    except Exception as e:
        print("Failed to fetch arXiv metadata:", e)
        
    if not paper:
        paper = models.Paper(
            arxiv_id=arxiv_id,
            collection_id=req.collection_id,
            title=title,
            authors=authors,
            year=year,
            full_text=full_text
        )
        db.add(paper)
        db.commit()
        db.refresh(paper)
    else:
        # Update text just in case
        paper.full_text = full_text
        db.commit()

    import base64
    pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
    
    return {
        "id": paper.id,
        "arxiv_id": paper.arxiv_id,
        "title": paper.title,
        "pdf_b64": pdf_b64
    }

@app.post("/api/collections")
def create_collection(req: CollectionCreate, db: Session = Depends(get_db)):
    collection = models.Collection(name=req.name, description=req.description)
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return {"id": collection.id, "name": collection.name, "description": collection.description, "created_at": collection.created_at}

@app.get("/api/collections")
def get_collections(db: Session = Depends(get_db)):
    collections = db.query(models.Collection).order_by(models.Collection.created_at.desc()).all()
    result = []
    for c in collections:
        result.append({
            "id": c.id,
            "name": c.name,
            "description": c.description,
            "created_at": c.created_at,
            "papers": [{"id": p.id, "arxiv_id": p.arxiv_id, "title": p.title, "authors": p.authors, "year": p.year} for p in c.papers]
        })
    return result

class MovePaperRequest(BaseModel):
    target_collection_id: int

class MoveAllRequest(BaseModel):
    target_collection_id: int

@app.patch("/api/papers/{paper_id}/move")
def move_paper(paper_id: int, req: MovePaperRequest, db: Session = Depends(get_db)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    paper.collection_id = req.target_collection_id
    db.commit()
    return {"message": "Paper moved successfully"}

@app.delete("/api/collections/{collection_id}")
def delete_collection(collection_id: int, db: Session = Depends(get_db)):
    collection = db.query(models.Collection).filter(models.Collection.id == collection_id).first()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    db.delete(collection)
    db.commit()
    return {"message": "Collection deleted successfully"}

@app.post("/api/collections/{collection_id}/move_all")
def move_all_papers(collection_id: int, req: MoveAllRequest, db: Session = Depends(get_db)):
    papers = db.query(models.Paper).filter(models.Paper.collection_id == collection_id).all()
    for paper in papers:
        paper.collection_id = req.target_collection_id
    db.commit()
    return {"message": f"Moved {len(papers)} papers successfully"}

@app.get("/api/papers")
def get_papers(db: Session = Depends(get_db)):
    papers = db.query(models.Paper).order_by(models.Paper.created_at.desc()).all()
    return [{"id": p.id, "arxiv_id": p.arxiv_id, "collection_id": p.collection_id, "title": p.title, "authors": p.authors, "year": p.year, "tags": p.tags} for p in papers]

@app.delete("/api/papers/{paper_id}")
def delete_paper(paper_id: int, db: Session = Depends(get_db)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    db.delete(paper)
    db.commit()
    return {"message": "Paper deleted successfully"}

@app.get("/api/papers/{paper_id}/chats")
def get_chats(paper_id: int, db: Session = Depends(get_db)):
    chats = db.query(models.ChatMessage).filter(models.ChatMessage.paper_id == paper_id).order_by(models.ChatMessage.timestamp.asc()).all()
    return [{"id": c.id, "role": c.role, "content": c.content, "timestamp": c.timestamp} for c in chats]

@app.post("/api/papers/{paper_id}/chat")
def chat_with_paper(paper_id: int, req: ChatRequest, db: Session = Depends(get_db)):
    paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
        
    # Store user message
    user_msg = models.ChatMessage(paper_id=paper_id, role="user", content=req.message)
    db.add(user_msg)
    db.commit()

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key not configured")

    model = genai.GenerativeModel('gemini-3.1-flash-lite')
    
    # Simple context stuffing with strong system instructions
    system_instruction = (
        "You are an expert AI research assistant. "
        "CRITICAL INSTRUCTIONS: Always use simple, plain English. "
        "Give direct, on-to-the-point explanations without unnecessary fluff. "
        "Format your response nicely in Markdown."
    )
    prompt = f"{system_instruction}\n\nHere is the full text of the paper '{paper.title}':\n\n{paper.full_text[:100000]}\n\nUser's message: {req.message}"
    
    try:
        response = model.generate_content(prompt)
        assistant_text = response.text
    except Exception as e:
        assistant_text = f"Error generating response: {str(e)}"
        
    assistant_msg = models.ChatMessage(paper_id=paper_id, role="assistant", content=assistant_text)
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)
    
    return {"id": assistant_msg.id, "role": assistant_msg.role, "content": assistant_msg.content, "timestamp": assistant_msg.timestamp}

