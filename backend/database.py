from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./trafikinfo.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class TrafficEvent(Base):
    __tablename__ = "traffic_events"

    id = Column(Integer, primary_key=True, index=True)
    external_id = Column(String, index=True) # Trafikverket ID
    event_type = Column(String) # e.g., 'Situation'
    title = Column(String)
    description = Column(Text)
    location = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    pushed_to_mqtt = Column(Integer, default=0) # boolean 0/1

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)

def init_db():
    Base.metadata.create_all(bind=engine)
