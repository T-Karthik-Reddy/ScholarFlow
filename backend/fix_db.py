import sys
import xml.etree.ElementTree as ET
import httpx
from sqlalchemy.orm import Session
from database import SessionLocal
import models

def fix():
    db = SessionLocal()
    papers = db.query(models.Paper).all()
    for paper in papers:
        print(f"Fixing paper {paper.arxiv_id}...")
        api_url = f"https://export.arxiv.org/api/query?id_list={paper.arxiv_id}"
        meta_resp = httpx.get(api_url, follow_redirects=True)
        if meta_resp.status_code == 200:
            root = ET.fromstring(meta_resp.content)
            ns = {'atom': 'http://www.w3.org/2005/Atom'}
            entry = root.find('atom:entry', ns)
            if entry is not None:
                api_title = entry.find('atom:title', ns)
                if api_title is not None and api_title.text:
                    paper.title = api_title.text.replace('\n', ' ').strip()
                
                api_published = entry.find('atom:published', ns)
                if api_published is not None and api_published.text:
                    paper.year = int(api_published.text[:4])
                
                api_authors = entry.findall('atom:author/atom:name', ns)
                if api_authors:
                    paper.authors = ", ".join([a.text for a in api_authors])
    
    db.commit()
    db.close()
    print("Done!")

fix()
