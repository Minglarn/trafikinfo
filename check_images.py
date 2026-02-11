
import httpx
import asyncio

async def check():
    ids = ["39636180", "39626455"]
    
    async with httpx.AsyncClient() as client:
        for cam_id in ids:
            url_v2 = f"https://api.trafikinfo.trafikverket.se/v2/Images/data/road.infrastructure.camera/TrafficFlowCamera_{cam_id}.jpg"
            url_v2_full = url_v2 + "?type=fullsize"
            
            r1 = await client.get(url_v2)
            r2 = await client.get(url_v2_full)
            
            print(f"ID: {cam_id}")
            print(f"  V2 Std: {len(r1.content)} bytes")
            print(f"  V2 Full: {len(r2.content)} bytes")

if __name__ == "__main__":
    asyncio.run(check())
