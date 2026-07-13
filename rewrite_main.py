import re

with open("backend/main.py", "r") as f:
    content = f.read()

# Add auth imports
import_insert = """
import auth
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
"""
content = re.sub(r'import models', import_insert + 'import models', content)

# Add User Schemas
schemas_insert = """
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
"""
content = re.sub(r'(class CollectionCreate\(BaseModel\):)', schemas_insert + '\\n' + r'\1', content)

# Remove ensure_default_collection (default collections should be created per user now)
content = re.sub(r'def ensure_default_collection\(\).*?ensure_default_collection\(\)\n\n', '', content, flags=re.DOTALL)

# Add auth routes
auth_routes = """
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

"""
content = re.sub(r'(# ---------------------------------------------------------------------------\n# Settings / health)', auth_routes + r'\1', content)

# Change status to import status if needed
content = re.sub(r'from fastapi import Depends, FastAPI, Header, HTTPException', 'from fastapi import Depends, FastAPI, Header, HTTPException, status', content)

# Inject dependency
endpoints_to_protect = [
    ("async def ingest_paper(req: IngestRequest, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("async def get_paper_pdf(paper_id: int, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def create_collection(req: CollectionCreate, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def get_collections(db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def move_paper(paper_id: int, req: MovePaperRequest, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def delete_collection(collection_id: int, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def move_all_papers(collection_id: int, req: MoveAllRequest, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def get_papers(db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def delete_paper(paper_id: int, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
    ("def get_chats(paper_id: int, db: Session = Depends(get_db)", "user: models.User = Depends(auth.get_current_user)"),
]

for orig, ext in endpoints_to_protect:
    content = content.replace(orig + "):", orig + f", {ext}):")

# Multi-line endpoint
content = content.replace(
    "    db: Session = Depends(get_db),\\n    x_gemini_key: str | None = Header(default=None),\\n):",
    "    db: Session = Depends(get_db),\\n    x_gemini_key: str | None = Header(default=None),\\n    user: models.User = Depends(auth.get_current_user),\\n):"
)
content = content.replace(
    "    db: Session = Depends(get_db),\\n    x_gemini_key: str | None = Header(default=None),\\n):",
    "    db: Session = Depends(get_db),\\n    x_gemini_key: str | None = Header(default=None),\\n    user: models.User = Depends(auth.get_current_user),\\n):"
)
# Just in case, regular replace for the exact formatting of chat_with_paper and implement_paper
content = content.replace(
    "    x_gemini_key: str | None = Header(default=None),\\n):",
    "    x_gemini_key: str | None = Header(default=None),\\n    user: models.User = Depends(auth.get_current_user),\\n):"
)

# Update the db queries inside the protected endpoints
content = content.replace(
    "collection = db.query(models.Collection).filter(models.Collection.id == req.collection_id).first()",
    "collection = db.query(models.Collection).filter(models.Collection.id == req.collection_id, models.Collection.user_id == user.id).first()"
)
content = content.replace(
    "paper = db.query(models.Paper).filter(models.Paper.arxiv_id == arxiv_id).first()",
    "paper = db.query(models.Paper).filter(models.Paper.arxiv_id == arxiv_id, models.Paper.user_id == user.id).first()"
)
content = content.replace(
    "collection_id=req.collection_id,",
    "collection_id=req.collection_id, user_id=user.id,"
)
content = content.replace(
    "paper = db.query(models.Paper).filter(models.Paper.id == paper_id).first()",
    "paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()"
)
content = content.replace(
    "collection = models.Collection(name=name, description=req.description.strip())",
    "collection = models.Collection(name=name, description=req.description.strip(), user_id=user.id)"
)
content = content.replace(
    "collections = db.query(models.Collection).order_by(models.Collection.created_at.desc()).all()",
    "collections = db.query(models.Collection).filter(models.Collection.user_id == user.id).order_by(models.Collection.created_at.desc()).all()"
)
content = content.replace(
    "target = db.query(models.Collection).filter(models.Collection.id == req.target_collection_id).first()",
    "target = db.query(models.Collection).filter(models.Collection.id == req.target_collection_id, models.Collection.user_id == user.id).first()"
)
content = content.replace(
    "collection = db.query(models.Collection).filter(models.Collection.id == collection_id).first()",
    "collection = db.query(models.Collection).filter(models.Collection.id == collection_id, models.Collection.user_id == user.id).first()"
)
content = content.replace(
    "papers = db.query(models.Paper).filter(models.Paper.collection_id == collection_id).all()",
    "papers = db.query(models.Paper).filter(models.Paper.collection_id == collection_id, models.Paper.user_id == user.id).all()"
)
content = content.replace(
    "papers = db.query(models.Paper).order_by(models.Paper.created_at.desc()).all()",
    "papers = db.query(models.Paper).filter(models.Paper.user_id == user.id).order_by(models.Paper.created_at.desc()).all()"
)
content = content.replace(
    "def get_chats(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):\\n    chats = (",
    "def get_chats(paper_id: int, db: Session = Depends(get_db), user: models.User = Depends(auth.get_current_user)):\\n    paper = db.query(models.Paper).filter(models.Paper.id == paper_id, models.Paper.user_id == user.id).first()\\n    if not paper:\\n        raise HTTPException(status_code=404, detail='Paper not found')\\n    chats = ("
)

with open("backend/main.py", "w") as f:
    f.write(content)
