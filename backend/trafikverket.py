import httpx
import logging
import asyncio
import xml.etree.ElementTree as ET
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

class TrafikverketStream:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.trafikverket.se/v2/query.json"
        self.running = False
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
                return sse_url
            except Exception as e:
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
                        async for line in response.aiter_lines():
                            if not self.running:
                                break
                            if line.startswith("data:"):
                                data = line[5:].strip()
                                if data:
                                    await self.queue.put(data)
            except Exception as e:
                logger.error(f"Stream error: {e}")
                await asyncio.sleep(5)

    def stop_streaming(self):
        self.running = False

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
        for sit in situations:
            for devi in sit.get('Deviation', []):
                event = {
                    "external_id": devi.get('Id'),
                    "title": devi.get('Header'),
                    "description": devi.get('Description'),
                    "location": devi.get('LocationDescriptor'),
                    "event_type": "Situation",
                    "timestamp": devi.get('CreationTime')
                }
                parsed_events.append(event)
        return parsed_events
    except Exception as e:
        logger.error(f"Error parsing situation: {e}")
        return []
