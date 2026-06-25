import sys
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

def migrate():
    # Create tables if not exists
    models.Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    # Check if "Uncategorized" collection exists
    uncategorized = db.query(models.Collection).filter(models.Collection.name == "Uncategorized").first()
    if not uncategorized:
        uncategorized = models.Collection(name="Uncategorized", description="Default collection for imported papers")
        db.add(uncategorized)
        db.commit()
        db.refresh(uncategorized)
        
    papers = db.query(models.Paper).filter(models.Paper.collection_id == None).all()
    for paper in papers:
        paper.collection_id = uncategorized.id
    db.commit()
    db.close()
    print("Migration complete!")

migrate()
