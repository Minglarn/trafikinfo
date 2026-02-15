from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Float, text as sa_text
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

    # Persistent Weather
    air_temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(String)
    road_temperature = Column(Float)
    grip = Column(Float)
    ice_depth = Column(Float)
    snow_depth = Column(Float)
    water_equivalent = Column(Float)

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

    # Persistent Weather
    air_temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(String)
    road_temperature = Column(Float)
    grip = Column(Float)
    ice_depth = Column(Float)
    snow_depth = Column(Float)
    water_equivalent = Column(Float)

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
    road_number = Column(String) # Road number (e.g. E4, 73)
    is_favorite = Column(Integer, default=0) # 0/1

class RoadCondition(Base):
    __tablename__ = "road_conditions"

    id = Column(String, primary_key=True, index=True) # Trafikverket ID
    condition_code = Column(Integer)
    condition_text = Column(String)
    measure = Column(String)
    warning = Column(String)
    road_number = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer)
    timestamp = Column(DateTime) # ModifiedTime or created_at
    updated_at = Column(DateTime, default=datetime.datetime.now)
    
    camera_url = Column(String)
    camera_name = Column(String)
    camera_snapshot = Column(String)
    cause = Column(String) 
    location_text = Column(String) # New field
    icon_id = Column(String)

    # Persistent Weather
    air_temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(String)
    
    # Surface Weather
    road_temperature = Column(Float)
    grip = Column(Float)
    ice_depth = Column(Float)
    snow_depth = Column(Float)
    water_equivalent = Column(Float)

class RoadConditionVersion(Base):
    __tablename__ = "road_condition_versions"

    id = Column(Integer, primary_key=True, index=True)
    road_condition_id = Column(String, index=True) # Link to RoadCondition.id
    version_timestamp = Column(DateTime, default=datetime.datetime.now)

    condition_code = Column(Integer)
    condition_text = Column(String)
    measure = Column(String)
    warning = Column(String)
    road_number = Column(String)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer)
    timestamp = Column(DateTime) # Original timestamp
    
    camera_url = Column(String)
    camera_name = Column(String)
    camera_snapshot = Column(String)
    cause = Column(String) 
    location_text = Column(String)
    icon_id = Column(String)

    # Persistent Weather
    air_temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(String)
    
    # Surface Weather
    road_temperature = Column(Float)
    grip = Column(Float)
    ice_depth = Column(Float)
    snow_depth = Column(Float)
    water_equivalent = Column(Float)

class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(String)

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    endpoint = Column(String, unique=True, index=True)
    p256dh = Column(String)
    auth = Column(String)
    created_at = Column(DateTime, default=datetime.datetime.now)
    # Filter settings per subscription
    counties = Column(String) # Comma separated list of county numbers
    min_severity = Column(Integer, default=3)
    topic_realtid = Column(Integer, default=1) # 1=Enabled, 0=Disabled
    topic_road_condition = Column(Integer, default=1)
    # Customization preferences (1=Enabled, 0=Disabled)
    include_severity = Column(Integer, default=1)
    include_image = Column(Integer, default=1)
    include_weather = Column(Integer, default=1)
    include_location = Column(Integer, default=1)

class ClientInterest(Base) :
    __tablename__ = "client_interests"
    client_id = Column(String, primary_key=True, index=True) # UUID
    counties = Column(String) # Comma-separated list
    last_active = Column(DateTime, default=datetime.datetime.utcnow)
    user_agent = Column(String) # Browser/device info
    is_admin = Column(Integer, default=0) # 0/1

class WeatherMeasurepoint(Base):
    __tablename__ = "weather_measurepoints"

    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    county_no = Column(Integer)
    
    air_temperature = Column(Float)
    wind_speed = Column(Float)
    wind_direction = Column(String) # e.g. "NW"
    road_temperature = Column(Float)
    grip = Column(Float)
    ice_depth = Column(Float)
    snow_depth = Column(Float)
    water_equivalent = Column(Float)
    last_updated = Column(DateTime)

def init_db():
    Base.metadata.create_all(bind=engine)
    migrate_db()
    
    # Ensure tables exists
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "cameras" not in inspector.get_table_names():
        Camera.__table__.create(bind=engine)
    if "road_conditions" not in inspector.get_table_names():
        RoadCondition.__table__.create(bind=engine)
    if "push_subscriptions" not in inspector.get_table_names():
        PushSubscription.__table__.create(bind=engine)
    if "client_interests" not in inspector.get_table_names():
        ClientInterest.__table__.create(bind=engine)
    else:
        # Migration for client_interests
        existing_cols = [c['name'] for c in inspector.get_columns("client_interests")]
        with engine.begin() as conn:
            if "user_agent" not in existing_cols:
                print("Migrating client_interests: Adding user_agent")
                conn.execute(sa_text("ALTER TABLE client_interests ADD COLUMN user_agent TEXT"))
            if "is_admin" not in existing_cols:
                print("Migrating client_interests: Adding is_admin")
                conn.execute(sa_text("ALTER TABLE client_interests ADD COLUMN is_admin INTEGER DEFAULT 0"))
    if "weather_measurepoints" not in inspector.get_table_names():
        WeatherMeasurepoint.__table__.create(bind=engine)

def migrate_db():
    try:
        from sqlalchemy import inspect
        inspector = inspect(engine)
        
        # Migration for push_subscriptions topics
        if "push_subscriptions" in inspector.get_table_names():
            existing_cols = [c['name'] for c in inspector.get_columns("push_subscriptions")]
            with engine.begin() as conn:
                if "topic_realtid" not in existing_cols:
                    print("Migrating push_subscriptions: Adding topic_realtid")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN topic_realtid INTEGER DEFAULT 1"))
                if "topic_road_condition" not in existing_cols:
                    print("Migrating push_subscriptions: Adding topic_road_condition")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN topic_road_condition INTEGER DEFAULT 1"))
                
                # Customization preferences
                if "include_severity" not in existing_cols:
                    print("Migrating push_subscriptions: Adding include_severity")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN include_severity INTEGER DEFAULT 1"))
                if "include_image" not in existing_cols:
                    print("Migrating push_subscriptions: Adding include_image")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN include_image INTEGER DEFAULT 1"))
                if "include_weather" not in existing_cols:
                    print("Migrating push_subscriptions: Adding include_weather")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN include_weather INTEGER DEFAULT 1"))
                if "include_location" not in existing_cols:
                    print("Migrating push_subscriptions: Adding include_location")
                    conn.execute(sa_text("ALTER TABLE push_subscriptions ADD COLUMN include_location INTEGER DEFAULT 1"))
        
        # Migration for traffic_events
        if "traffic_events" in inspector.get_table_names():
            existing_columns = [c['name'] for c in inspector.get_columns("traffic_events")]
            
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
                "updated_at": "DATETIME",
                "air_temperature": "FLOAT",
                "wind_speed": "FLOAT",
                "wind_direction": "VARCHAR",
                "road_temperature": "FLOAT",
                "grip": "FLOAT",
                "ice_depth": "FLOAT",
                "snow_depth": "FLOAT",
                "water_equivalent": "FLOAT"
            }
            
            with engine.begin() as conn:
                for col_name, col_type in expected_columns.items():
                    if col_name not in existing_columns:
                        print(f"Migrating database: Adding missing column '{col_name}'")
                        try:
                            conn.execute(sa_text(f"ALTER TABLE traffic_events ADD COLUMN {col_name} {col_type}"))
                            
                            # Backfill updated_at with created_at if just added
                            if col_name == "updated_at":
                                print("Backfilling updated_at with created_at...")
                                conn.execute(sa_text("UPDATE traffic_events SET updated_at = created_at WHERE updated_at IS NULL"))
                        except Exception as e:
                            print(f"Error adding column {col_name}: {e}")

                # Also migrate versions table
                if "traffic_event_versions" in inspector.get_table_names():
                    v_columns = [c['name'] for c in inspector.get_columns("traffic_event_versions")]
                    with engine.begin() as conn_v:
                        for col_name, col_type in expected_columns.items():
                            if col_name not in v_columns and col_name not in ["pushed_to_mqtt", "updated_at"]:
                                print(f"Migrating versions: Adding missing column '{col_name}'")
                                try:
                                    conn_v.execute(sa_text(f"ALTER TABLE traffic_event_versions ADD COLUMN {col_name} {col_type}"))
                                except Exception as e:
                                    print(f"Error adding column {col_name} to versions: {e}")

        # Migration for road_conditions
        if "road_conditions" in inspector.get_table_names():
            rc_columns = [c['name'] for c in inspector.get_columns("road_conditions")]
            rc_expected = {
                "cause": "VARCHAR",
                "measure": "VARCHAR",
                "warning": "VARCHAR",
                "icon_id": "VARCHAR",
                "camera_url": "VARCHAR",
                "camera_name": "VARCHAR",
                "camera_snapshot": "VARCHAR",
                "location_text": "VARCHAR",
                "air_temperature": "FLOAT",
                "wind_speed": "FLOAT",
                "wind_direction": "VARCHAR",
                "road_temperature": "FLOAT",
                "grip": "FLOAT",
                "ice_depth": "FLOAT",
                "snow_depth": "FLOAT",
                "water_equivalent": "FLOAT",
                "updated_at": "DATETIME"
            }
            
            with engine.begin() as conn_rc:
                for col_name, col_type in rc_expected.items():
                    if col_name not in rc_columns:
                        print(f"Migrating road_conditions: Adding missing column '{col_name}'")
                        try:
                            conn_rc.execute(sa_text(f"ALTER TABLE road_conditions ADD COLUMN {col_name} {col_type}"))
                        except Exception as e:
                            print(f"Error adding column {col_name} to road_conditions: {e}")

        # Migration for weather_measurepoints
        if "weather_measurepoints" in inspector.get_table_names():
            wm_columns = [c['name'] for c in inspector.get_columns("weather_measurepoints")]
            wm_expected = {
                "road_temperature": "FLOAT",
                "grip": "FLOAT",
                "ice_depth": "FLOAT",
                "snow_depth": "FLOAT",
                "water_equivalent": "FLOAT"
            }
            with engine.begin() as conn_wm:
                for col_name, col_type in wm_expected.items():
                    if col_name not in wm_columns:
                        print(f"Migrating weather_measurepoints: Adding missing column '{col_name}'")
                        try:
                            conn_wm.execute(sa_text(f"ALTER TABLE weather_measurepoints ADD COLUMN {col_name} {col_type}"))
                        except Exception as e:
                            print(f"Error adding column {col_name} to weather_measurepoints: {e}")

        # Migration for cameras
        if "cameras" in inspector.get_table_names():
            cam_columns = [c['name'] for c in inspector.get_columns("cameras")]
            cam_expected = {
                "road_number": "VARCHAR",
                "fullsize_url": "VARCHAR"
            }
            with engine.begin() as conn_cam:
                for col_name, col_type in cam_expected.items():
                    if col_name not in cam_columns:
                        print(f"Migrating cameras: Adding missing column '{col_name}'")
                        try:
                            conn_cam.execute(sa_text(f"ALTER TABLE cameras ADD COLUMN {col_name} {col_type}"))
                        except Exception as e:
                            print(f"Error adding column {col_name} to cameras: {e}")
    except Exception as e:
        print(f"Migration error: {e}")
