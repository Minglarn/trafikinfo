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

    async def get_sse_url(self, object_type: str = "Situation"):
        query = f"""
        <REQUEST>
            <LOGIN authenticationkey='{self.api_key}' />
            <QUERY objecttype='{object_type}' schemaversion='1.5' sseurl='true'>
                <FILTER>
                    <OR>
                        <EQ name="Deviation.CountyNo" value="1" />
                        <EQ name="Deviation.CountyNo" value="4" />
                    </OR>
                </FILTER>
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

    async def start_streaming(self):
        self.running = True
        while self.running:
            sse_url = await self.get_sse_url()
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
                "longitude": longitude
            }
            parsed_events.append(event)
        return parsed_events
    except Exception as e:
        logger.error(f"Error parsing situation: {e}")
        return []
