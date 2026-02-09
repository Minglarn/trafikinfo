from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime

SQLALCHEMY_DATABASE_URL = "sqlite:///./data/trafikinfo.db"

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
    icon_id = Column(String) # Trafikverket IconId
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    # Enriched fields
    message_type = Column(String) # e.g. "Vägarbete"
    severity_code = Column(Integer) # 1-5
    severity_text = Column(String)
    road_number = Column(String) # e.g. "E4"
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    temporary_limit = Column(String)
    traffic_restriction_type = Column(String)

    pushed_to_mqtt = Column(Integer, default=0) # boolean 0/1

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)

def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_db()

def migrate_db():
    from sqlalchemy import inspect, text
    inspector = inspect(engine)
    columns = [c['name'] for c in inspector.get_columns("traffic_events")]
    
    # Define expected columns and their types for migration
    expected_columns = {
        "message_type": "VARCHAR",
        "severity_code": "INTEGER",
        "severity_text": "VARCHAR",
        "road_number": "VARCHAR",
        "start_time": "DATETIME",
        "end_time": "DATETIME",
        "temporary_limit": "VARCHAR",
        "traffic_restriction_type": "VARCHAR"
    }

    with engine.connect() as conn:
        for col_name, col_type in expected_columns.items():
            if col_name not in columns:
                print(f"Migrating database: Adding missing column '{col_name}'")
                try:
                    conn.execute(text(f"ALTER TABLE traffic_events ADD COLUMN {col_name} {col_type}"))
                except Exception as e:
                    print(f"Error adding column {col_name}: {e}")
