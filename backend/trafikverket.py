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
            for devi in sit.get('Deviation', []):
                icon_id = devi.get('IconId')
                
                # Determine title: Header -> Message -> Icon Mapping -> MessageType -> Default
                title = devi.get('Header') or devi.get('Message')
                if not title and icon_id:
                    title = icon_text_map.get(icon_id)
                if not title:
                    title = devi.get('MessageType', 'Trafikhändelse')

                # Parse times
                start_time = devi.get('StartTime')
                end_time = devi.get('EndTime')

                # Extract Severity
                severity_code = devi.get('SeverityCode')
                severity_text = devi.get('SeverityText')

                # Parse Geometry (WGS84 typically "POINT (16.596 59.629)" or "LINESTRING (...)")
                latitude = None
                longitude = None
                geo = devi.get('Geometry', {})
                # Try to get WGS84 from Point first, then Line
                wgs84 = None
                if 'Point' in geo:
                    wgs84 = geo['Point'].get('WGS84')
                elif 'Line' in geo:
                    wgs84 = geo['Line'].get('WGS84')

                if wgs84:
                    # Match first coordinate pair inside parentheses "(lon lat"
                    # Works for both POINT (lon lat) and LINESTRING (lon lat, ...)
                    match = re.search(r"\(([\d\.]+)\s+([\d\.]+)", wgs84)
                    if match:
                        longitude = float(match.group(1))
                        latitude = float(match.group(2))

                event = {
                    "external_id": devi.get('Id'),
                    "title": title,
                    "description": devi.get('Description'),
                    "location": devi.get('LocationDescriptor'),
                    "icon_id": icon_id,
                    "event_type": "Situation",
                    "timestamp": devi.get('CreationTime'),
                    "message_type": devi.get('MessageCode') or devi.get('MessageType'),
                    "severity_code": severity_code,
                    "severity_text": severity_text,
                    "road_number": devi.get('RoadNumber'),
                    "start_time": start_time,
                    "end_time": end_time,
                    "temporary_limit": devi.get('TemporaryLimit'),
                    "traffic_restriction_type": devi.get('TrafficRestrictionType'),
                    "latitude": latitude,
                    "longitude": longitude
                }
                parsed_events.append(event)
        return parsed_events
    except Exception as e:
        logger.error(f"Error parsing situation: {e}")
        return []
