import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# DATABASE_URL lets deployments point at a persistent disk (e.g. Render's
# /var/data) or a real database. Locally it defaults to a dotfile in the
# user's home directory so metadata survives across `uvicorn --reload`.
DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    home_dir = os.path.expanduser("~")
    db_dir = os.path.join(home_dir, ".scholarflow")
    os.makedirs(db_dir, exist_ok=True)
    DATABASE_URL = f"sqlite:///{os.path.join(db_dir, 'db.sqlite')}"

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
