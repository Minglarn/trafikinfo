import sys
import os
import asyncio
from datetime import datetime
import json

# Ladda in backend-moduler
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from database import SessionLocal, PushSubscription
from main import send_push_notification, clean_county_text

async def main():
    db = SessionLocal()
    try:
        # 1. Lista alla prenumerationer så att användaren kan välja sin egen
        subs = db.query(PushSubscription).all()
        if not subs:
            print("Inga push-prenumerationer hittades i databasen.")
            return

        print("--- Tillgängliga Push-klienter ---")
        for sub in subs:
            print(f"ID: {sub.id} | Skapad: {sub.created_at} | Endpoint: ...{sub.endpoint[-40:]}")
        
        try:
            target_id = int(input("\nAnge ID för den klient du vill skicka testnotisen till: "))
        except ValueError:
            print("Ogiltigt ID.")
            return
            
        target_sub = db.query(PushSubscription).filter(PushSubscription.id == target_id).first()
        if not target_sub:
            print("Hittade ingen klient med det ID:t.")
            return

        print(f"\nSkapar testnotis för klient ID {target_id}...")

        # 2. Fejka ett Trafikverket-event
        fake_data = {
            'message_type': 'Hinder',
            'title': 'Personbil i höger körfält.',
            'location': 'E4 vid Sjön Aspen i Stockholms län (AB)',
            'severity_code': 4, # 4 = Röd
            'county_no': 1,
            'weather': {
                'air_temperature': 14.5,
                'wind_speed': 3.2,
                'wind_direction': 'NV'
            },
            'event_url': '/?event_id=TEST_12345',
            'icon_url': '/api/icons/obstacle.png', # Ersätt med äkta om du vill
            'snapshot_url': None, # Skicka utan bild eller lägg in en äkta länk här om du vill testa bilden
            'external_camera_url': 'https://www.trafikverket.se/contentassets/fake_camera.jpg'
        }

        # 3. Formatera precis som i notify_subscribers för type="event"
        SEVERITY_ICONS = {1: "🟢", 2: "🟡", 3: "🟠", 4: "🔴", 5: "🔴"}
        severity = fake_data.get('severity_code')
        severity_icon = SEVERITY_ICONS.get(severity, "⚠️")
        
        title_core = fake_data.get('message_type') or 'Trafikhändelse'
        clean_title_core = clean_county_text(title_core)
        title = f"{severity_icon} {clean_title_core}"
        
        lines = []
        original_title = fake_data.get('title')
        if original_title:
            lines.append(clean_county_text(original_title))

        if target_sub.include_location:
            location = fake_data.get('location', '')
            if location:
                clean_location = clean_county_text(location)
                lines.append(f"📍 {clean_location}")
        
        if target_sub.include_weather:
            weather = fake_data.get('weather') or {}
            temp = weather.get('air_temperature')
            wind = weather.get('wind_speed')
            wind_dir = weather.get('wind_direction', '')
            weather_parts = []
            if temp is not None: weather_parts.append(f"🌡️ {temp}°C")
            if wind is not None: weather_parts.append(f"🌬️ {wind} m/s {wind_dir}".strip())
            if weather_parts:
                lines.append("  ".join(weather_parts))
        
        message = "\n".join([l for l in lines if l])
        url = fake_data.get('event_url', '/')
        icon = fake_data.get('icon_url')
        
        if target_sub.include_image:
            image = fake_data.get('snapshot_url') or fake_data.get('external_camera_url')
        else:
            image = None

        print("\nSkickar payload:")
        print(f"Titel: {title}")
        print(f"Meddelande: \n{message}")
        print(f"Bild: {image}")

        # Skicka iväg!
        await send_push_notification(target_sub, title, message, url, db, icon=icon, image=image, ttl=3600)
        
        print("\nKlart! Kolla telefonen.")

    except Exception as e:
        print(f"Ett fel uppstod: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
