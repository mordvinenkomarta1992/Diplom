from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class QueryHistory(Base):
    __tablename__ = "query_history"
    id = Column(Integer, primary_key=True, index=True)
    prompt = Column(String)
    response = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)