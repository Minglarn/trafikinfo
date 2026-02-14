from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import RoadCondition

engine = create_engine("sqlite:///./data/trafikinfo.db")
Session = sessionmaker(bind=engine)
db = Session()

print("ID | Road | County | Code | Text")
print("-" * 50)
rcs = db.query(RoadCondition).order_by(RoadCondition.updated_at.desc()).limit(20).all()
for rc in rcs:
    print(f"{rc.id} | {rc.road_number} | {rc.county_no} | {rc.condition_code} | {rc.condition_text}")
db.close()
