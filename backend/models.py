from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Collection(Base):
    __tablename__ = "collections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    papers = relationship("Paper", back_populates="collection", cascade="all, delete-orphan")


class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    arxiv_id = Column(String, unique=True, index=True)
    collection_id = Column(Integer, ForeignKey("collections.id"), nullable=True)
    title = Column(String, index=True)
    authors = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    tags = Column(String, nullable=True)
    full_text = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    collection = relationship("Collection", back_populates="papers")
    chats = relationship("ChatMessage", back_populates="paper", cascade="all, delete-orphan")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    paper_id = Column(Integer, ForeignKey("papers.id"))
    role = Column(String) 
    content = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    paper = relationship("Paper", back_populates="chats")
