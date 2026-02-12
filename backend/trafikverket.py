import httpx
import logging
import asyncio
import xml.etree.ElementTree as ET
from sse_starlette.sse import EventSourceResponse
import re

logger = logging.getLogger(__name__)

class TrafikverketStream:
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Updated URL per user suggestion
        self.base_url = "https://api.trafikinfo.trafikverket.se/v2/data.json"
        self.running = False
        self.connected = False
        self.last_error = None
        self.queue = asyncio.Queue()

        

    async def get_sse_url(self, county_ids: list = None, object_type: str = "Situation"):
        # Determine schema version, namespace, and filter field
        schema_version = "1.5"
        namespace = ""
        filter_field = "Deviation.CountyNo"
        
        if object_type == "RoadCondition":
            schema_version = "1.3"
            namespace = "Road.TrafficInfo"
            filter_field = "CountyNo"

        filter_block = ""
        if county_ids:
            # Filter out '0' (Alla län) just in case it's passed
            valid_ids = [cid for cid in county_ids if str(cid) != "0"]
            
            if valid_ids:
                # Build <OR><EQ name="Field" value="X" />...</OR>
                conditions = "".join([f'<EQ name="{filter_field}" value="{cid}" />' for cid in valid_ids])
                filter_block = f"<FILTER><OR>{conditions}</OR></FILTER>"
        
        namespace_attr = f" namespace='{namespace}'" if namespace else ""

        query = f"""
        <REQUEST>
            <LOGIN authenticationkey='{self.api_key}' />
            <QUERY objecttype='{object_type}' schemaversion='{schema_version}' sseurl='true'{namespace_attr}>
                {filter_block}
            </QUERY>
        </REQUEST>
        """
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(self.base_url, content=query, headers={"Content-Type": "text/xml"})
                response.raise_for_status()
                data = response.json()
                # The response contains a link to the SSE stream
                sse_url = data['RESPONSE']['RESULT'][0]['INFO']['SSEURL']
                self.connected = True
                self.last_error = None
                return sse_url
            except Exception as e:
                self.connected = False
                self.last_error = str(e)
                logger.error(f"Failed to get SSE URL: {e}")
                return None

    async def start_streaming(self, county_ids: list = None, object_type: str = "Situation"):
        self.running = True
        while self.running:
            sse_url = await self.get_sse_url(county_ids=county_ids, object_type=object_type)
            if not sse_url:
                await asyncio.sleep(10)
                continue

            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", sse_url) as response:
                        self.connected = True
                        async for line in response.aiter_lines():
                            if not self.running:
                                break
                            if line.startswith("data:"):
                                data = line[5:].strip()
                                if data:
                                    await self.queue.put(data)
            except Exception as e:
                self.connected = False
                self.last_error = str(e)
                logger.error(f"Stream error: {e}")
                await asyncio.sleep(5)

    def stop_streaming(self):
        self.running = False
        self.connected = False

    async def get_events(self):
        while True:
            data = await self.queue.get()
            yield data


def parse_situation(json_data):
    # Simplified parser for Trafikverket Situation object
    try:
        # Note: data coming from SSE is often a list or a single object wrapped in RESPONSE/RESULT
        # This part depends on the exact JSON structure returned by the SSE
        import json
        payload = json.loads(json_data)
        
        # Structure is usually: {"RESPONSE": {"RESULT": [{"Situation": [...]}]}}
        situations = payload.get('RESPONSE', {}).get('RESULT', [{}])[0].get('Situation', [])
        
        parsed_events = []
        
        # Mapping from IconId to Swedish text
        icon_text_map = {
            "vehicleBreakdown": "Fordonshaveri",
            "accident": "Trafikolycka",
            "roadWork": "Vägarbete",
            "congestion": "Köbildning",
            "obstruction": "Hinder på väg",
            "roadConditions": "Väglag",
            "trafficMessage": "Trafikmeddelande"
        }

        for sit in situations:
            sit_id = sit.get('Id')
            deviations = sit.get('Deviation', [])
            if not deviations:
                continue

            # Merge deviations for this situation
            merged_desc = []
            merged_restrictions = []
            merged_message_types = []
            
            # Start with primary data from the first deviation
            first_devi = deviations[0]
            icon_id = first_devi.get('IconId')
            start_time = first_devi.get('StartTime')
            end_time = first_devi.get('EndTime')
            severity_code = first_devi.get('SeverityCode')
            severity_text = first_devi.get('SeverityText')
            road_number = first_devi.get('RoadNumber')
            location = first_devi.get('LocationDescriptor')
            
            # Geometry from first deviation that has it
            latitude = None
            longitude = None
            
            for devi in deviations:
                # Descriptions
                desc = devi.get('Description')
                if desc and desc not in merged_desc:
                    merged_desc.append(desc)
                
                # Restriction Types
                restr = devi.get('TrafficRestrictionType')
                if restr and restr not in merged_restrictions:
                    merged_restrictions.append(restr)
                
                # Message Types
                mtype = devi.get('MessageCode') or devi.get('MessageType')
                if mtype and mtype not in merged_message_types:
                    merged_message_types.append(mtype)

                # Geometry
                if latitude is None:
                    geo = devi.get('Geometry', {})
                    wgs84 = geo.get('Point', {}).get('WGS84') or geo.get('Line', {}).get('WGS84')
                    if wgs84:
                        match = re.search(r"\(([\d\.]+)\s+([\d\.]+)", wgs84)
                        if match:
                            longitude = float(match.group(1))
                            latitude = float(match.group(2))
                
                # Time window (earliest start, latest end)
                d_start = devi.get('StartTime')
                d_end = devi.get('EndTime')
                if d_start and (not start_time or d_start < start_time):
                    start_time = d_start
                if d_end and (not end_time or d_end > end_time):
                    end_time = d_end

            # Determine title: Header -> Message -> Icon Mapping -> Merged Message Types -> Default
            title = first_devi.get('Header') or first_devi.get('Message')
            if not title and icon_id:
                title = icon_text_map.get(icon_id)
            if not title:
                title = " / ".join(merged_message_types) if merged_message_types else "Trafikhändelse"

            event = {
                "external_id": sit_id, # Group by Situation ID
                "title": title,
                "description": " | ".join(merged_desc) if merged_desc else None,
                "location": location,
                "icon_id": icon_id,
                "event_type": "Situation",
                "timestamp": first_devi.get('CreationTime'),
                "message_type": ", ".join(merged_message_types) if merged_message_types else None,
                "severity_code": severity_code,
                "severity_text": severity_text,
                "road_number": road_number,
                "start_time": start_time,
                "end_time": end_time,
                "temporary_limit": first_devi.get('TemporaryLimit'),
                "traffic_restriction_type": ", ".join(merged_restrictions) if merged_restrictions else None,
                "latitude": latitude,
                "longitude": longitude,
                "county_no": first_devi.get('CountyNo', [0])[0] if isinstance(first_devi.get('CountyNo'), list) else first_devi.get('CountyNo', 0)
            }
            parsed_events.append(event)
        return parsed_events
    except Exception as e:
        return parsed_events
    except Exception as e:
        logger.error(f"Error parsing situation: {e}")
        return []

def parse_road_condition(json_data):
    try:
        import json
        payload = json.loads(json_data)
        
        # Structure: RESPONSE -> RESULT -> RoadCondition
        results = payload.get('RESPONSE', {}).get('RESULT', [{}])[0].get('RoadCondition', [])
        
        parsed_conditions = []
        
        for rc in results:
            # Basic fields
            rc_id = rc.get('Id')
            condition_code = rc.get('ConditionCode')
            condition_info = rc.get('ConditionInfo', [])
            condition_text = condition_info[0] if condition_info else None
            
            # Map ConditionCode to text if missing
            if not condition_text and condition_code:
                code_map = {
                    1: "Normalt",
                    2: "Besvärligt (risk för)",
                    3: "Mycket besvärligt",
                    4: "Is- och snövägbana"
                }
                condition_text = code_map.get(condition_code, "Okänt")

            # Measures (Åtgärd) & Warnings
            measures = rc.get('Measure', [])
            warnings = rc.get('Warning', [])
            
            start_time = rc.get('StartTime')
            end_time = rc.get('EndTime')
            timestamp = rc.get('ModifiedTime')
            
            # Geometry
            latitude = None
            longitude = None
            wgs84 = rc.get('Geometry', {}).get('WGS84')
            if wgs84:
                match = re.search(r"\(([\d\.]+)\s+([\d\.]+)", wgs84)
                if match:
                    longitude = float(match.group(1))
                    latitude = float(match.group(2))

            # County
            counties = rc.get('CountyNo', [])
            county_no = counties[0] if counties and isinstance(counties, list) else (counties if isinstance(counties, int) else 0)

            condition = {
                "id": rc_id,
                "condition_code": condition_code,
                "condition_text": condition_text,
                "measure": ", ".join(measures) if measures else None,
                "warning": ", ".join(warnings) if warnings else None,
                "road_number": rc.get('RoadNumber'),
                "start_time": start_time,
                "end_time": end_time,
                "latitude": latitude,
                "longitude": longitude,
                "county_no": county_no,
                "timestamp": timestamp
            }
            parsed_conditions.append(condition)
            
        return parsed_conditions

    except Exception as e:
        logger.error(f"Error parsing road condition: {e}")
        return []

import math

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in kilometers between two points using Haversine formula."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return float('inf')
    
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def find_nearby_cameras(lat, lon, cameras, target_road=None, max_dist_km=5.0, limit=5):
    if lat is None or lon is None or not cameras:
        return []
    
    nearby = []
    
    # Roadmap pattern to identify roads in names (e.g. E4, Rv73, Lv155)
    road_pattern = re.compile(r'\b(E\d+|RV\d+|LV\d+|VÄG\d+|LÄN\d+)\b', re.I)

    # Clean target road for matching (extract only alphanumeric, e.g. "E4" or "73")
    def clean_target(s):
        if not s: return None
        return str(s).replace(" ", "").upper()

    norm_target = clean_target(target_road)

    for cam in cameras:
        # 1. Check distance and URL validity
        cam_url = cam.get('url')
        if not cam_url:
            continue
            
        dist = calculate_distance(lat, lon, cam.get('latitude'), cam.get('longitude'))
        if dist > max_dist_km:
            continue

        # 2. Heuristic for road matching/prevention
        cam_name = cam.get('name', '').upper()
        
        if norm_target:
            # Find all road numbers mentioned in the camera name
            clean_cam_name = cam_name.replace(" ", "")
            roads_in_cam = road_pattern.findall(clean_cam_name)
            
            if roads_in_cam:
                # If camera mentions roads, but NOT our target road, skip it
                if norm_target not in [r.upper() for r in roads_in_cam]:
                    continue
        
        # 3. Add to candidates
        nearby.append({
            **cam,
            "match_dist": dist
        })
    
    # Sort by distance
    nearby.sort(key=lambda x: x["match_dist"])
    
    return nearby[:limit]

async def get_cameras(api_key: str):
    """Fetch all traffic cameras from Trafikverket API."""
    url = "https://api.trafikinfo.trafikverket.se/v2/data.json"
    query = f"""<REQUEST>
    <LOGIN authenticationkey='{api_key}' />
    <QUERY objecttype='Camera' namespace='road.infrastructure' schemaversion='1.1'>
        <FILTER>
            <EQ name="Deleted" value="false" />
            <EQ name="Active" value="true" />
        </FILTER>
        <INCLUDE>Id</INCLUDE>
        <INCLUDE>Name</INCLUDE>
        <INCLUDE>Description</INCLUDE>
        <INCLUDE>Type</INCLUDE>
        <INCLUDE>PhotoUrl</INCLUDE>
        <INCLUDE>PhotoUrlFullsize</INCLUDE>
        <INCLUDE>PhotoUrlSketch</INCLUDE>
        <INCLUDE>PhotoTime</INCLUDE>
        <INCLUDE>HasFullSizePhoto</INCLUDE>
        <INCLUDE>HasSketchImage</INCLUDE>
        <INCLUDE>Geometry.WGS84</INCLUDE>
        <INCLUDE>Direction</INCLUDE>
        <INCLUDE>CountyNo</INCLUDE>
        <INCLUDE>Location</INCLUDE>
    </QUERY>
</REQUEST>"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(url, content=query, headers={"Content-Type": "text/xml"})
            if response.status_code != 200:
                logger.error(f"Trafikverket API Error: {response.status_code} - {response.text}")
            response.raise_for_status()
            data = response.json()
            results = data.get('RESPONSE', {}).get('RESULT', [{}])[0].get('Camera', [])
            
            cameras = []
            for res in results:
                wgs84 = res.get('Geometry', {}).get('WGS84')
                if wgs84:
                    match = re.search(r"\(([\d\.]+)\s+([\d\.]+)", wgs84)
                    if match:
                        photo_url = res.get('PhotoUrl')
                        fullsize_url = res.get('PhotoUrlFullsize')

                        # If we have a photo_url and the API says there's a fullsize version,
                        # we ensure we have the ?type=fullsize parameter, even if PhotoUrlFullsize
                        # was provided but didn't have it (Trafikverket often returns the same
                        # base URL for both unless forced).
                        if res.get('HasFullSizePhoto', False) and photo_url:
                            # If fullsize_url is not set or doesn't contain 'type=fullsize'
                            if not fullsize_url or "type=fullsize" not in fullsize_url:
                                if "?" in photo_url:
                                    fullsize_url = f"{photo_url}&type=fullsize"
                                else:
                                    fullsize_url = f"{photo_url}?type=fullsize"
                        
                        # Ensure we have all necessary fields for the internal Camera model
                        if not photo_url:
                            continue
                        
                        # CountyNo can be a list, we just take the first one or 0 if empty
                        counties = res.get('CountyNo', [])
                        primary_county = counties[0] if counties and isinstance(counties, list) else (counties if isinstance(counties, int) else 0)

                        cameras.append({
                            "id": res.get('Id'),
                            "name": res.get('Name'),
                            "description": res.get('Description'),
                            "location": res.get('Location'),
                            "type": res.get('Type'),
                            "url": photo_url,
                            "fullsize_url": fullsize_url,
                            "photo_time": res.get('PhotoTime'),
                            "longitude": float(match.group(1)),
                            "latitude": float(match.group(2)),
                            "county_no": primary_county
                        })
            return cameras
        except Exception as e:
            logger.error(f"Failed to fetch cameras: {e}")
            return []
