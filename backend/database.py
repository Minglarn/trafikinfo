from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float
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
    created_at = Column(DateTime, default=datetime.datetime.now)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now)
    
    # Enriched fields
    message_type = Column(String) # e.g. "Vägarbete"
    severity_code = Column(Integer) # 1-5
    severity_text = Column(String)
    road_number = Column(String) # e.g. "E4"
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    temporary_limit = Column(String)
    traffic_restriction_type = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer)
    
    camera_url = Column(String)
    camera_name = Column(String)
    camera_snapshot = Column(String)
    extra_cameras = Column(Text) # JSON list of extra cameras

    pushed_to_mqtt = Column(Integer, default=0) # boolean 0/1

class TrafficEventVersion(Base):
    __tablename__ = "traffic_event_versions"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, index=True) # TrafficEvent.id (internal ID)
    external_id = Column(String, index=True) # Trafikverket ID
    version_timestamp = Column(DateTime, default=datetime.datetime.now)
    
    title = Column(String)
    description = Column(Text)
    location = Column(String)
    icon_id = Column(String)
    message_type = Column(String)
    severity_code = Column(Integer)
    severity_text = Column(String)
    road_number = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    temporary_limit = Column(String)
    traffic_restriction_type = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer)
    camera_url = Column(String)
    camera_name = Column(String)
    camera_snapshot = Column(String)
    extra_cameras = Column(Text)

class Camera(Base):
    __tablename__ = "cameras"

    id = Column(String, primary_key=True, index=True) # Trafikverket Cam ID
    name = Column(String)
    description = Column(Text)
    location = Column(String)
    type = Column(String) # Väglagskamera / Trafikflödeskamera
    photo_url = Column(String)
    fullsize_url = Column(String)
    photo_time = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer) # Primary county
    is_favorite = Column(Integer, default=0) # 0/1

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)

def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_db()
    
    # Ensure cameras table exists (SQLAlchemy might skip if already exists)
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "cameras" not in inspector.get_table_names():
        Camera.__table__.create(bind=engine)

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
        "traffic_restriction_type": "VARCHAR",
        "latitude": "FLOAT",
        "longitude": "FLOAT",
        "camera_url": "VARCHAR",
        "camera_name": "VARCHAR",
        "camera_snapshot": "VARCHAR",
        "icon_id": "VARCHAR",
        "pushed_to_mqtt": "INTEGER",
        "external_id": "VARCHAR",
        "event_type": "VARCHAR",
        "extra_cameras": "TEXT",
        "county_no": "INTEGER",
        "updated_at": "DATETIME"
    }

    with engine.connect() as conn:
        for col_name, col_type in expected_columns.items():
            if col_name not in columns:
                print(f"Migrating database: Adding missing column '{col_name}'")
                try:
                    conn.execute(text(f"ALTER TABLE traffic_events ADD COLUMN {col_name} {col_type}"))
                    
                    # Backfill updated_at with created_at if just added
                    if col_name == "updated_at":
                        print("Backfilling updated_at with created_at...")
                        conn.execute(text("UPDATE traffic_events SET updated_at = created_at WHERE updated_at IS NULL"))
                        conn.commit()
                except Exception as e:
                    print(f"Error adding column {col_name}: {e}")
        
        # Also migrate versions table
        v_columns = [c['name'] for c in inspector.get_columns("traffic_event_versions")]
        for col_name, col_type in expected_columns.items():
             if col_name not in v_columns and col_name not in ["pushed_to_mqtt", "updated_at"]:
                print(f"Migrating versions: Adding missing column '{col_name}'")
                try:
                    conn.execute(text(f"ALTER TABLE traffic_event_versions ADD COLUMN {col_name} {col_type}"))
                except Exception as e:
                    print(f"Error adding column {col_name} to versions: {e}")
