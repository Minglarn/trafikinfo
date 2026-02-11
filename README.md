# 🚦 Trafikinfo Flux

[![Version](https://img.shields.io/badge/version-26.2.11-blue.svg)](https://github.com/Minglarn/trafikinfo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[![Python](https://img.shields.io/badge/python-3.11+-yellow.svg)](https://www.python.org/)
![Status](https://img.shields.io/badge/status-active-success.svg)
![Docker](https://img.shields.io/badge/docker-ready-blue.svg)

![App Screenshot](screenshot.png)

Trafikinfo Flux är en Docker-baserad plattform för att övervaka realtidsdata från det svenska Trafikverkets API. Systemet strömmar händelser (Situationer), lagrar dem i en lokal databas för historik och kan automatiskt pusha utvalda händelser till en MQTT-broker.

## Funktioner

- **SSE Streaming**: Direktuppkoppling mot Trafikverket för händelser i realtid.
- **Kartvisualisering**: Interaktiva kartor för att se exakt var händelser sker.
- **Mobilanpassad**: Fullt responsiv design med smidig **Bottom Navigation** för mobilen.
- **Statistik & Analys**: Dashboard som visar trender och fördelning per kalenderdag.
- **MQTT Bridge**: Skickar vidare trafikdata till ditt smarta hem eller andra system.
- **Ljudaviseringar**: Möjlighet att få ljudsignaler vid nya händelser.
- **Web GUI**: Modernt, responsivt gränssnitt med mörkt läge.
- **Historik**: Sökbar databas över alla historiska händelser och versionsändringar.

## Kom igång med Docker Compose

Det snabbaste sättet att starta Trafikinfo Flux är att använda Docker Compose. All konfiguration sker sedan direkt i webbgränssnittet.

### 1. Förberedelser
Du behöver en API-nyckel från [Trafikverket Datautbytesportal](https://dataportalen.trafikverket.se/).

### 2. Docker Compose (`docker-compose.yml`)
Skapa en `docker-compose.yml` med följande innehåll:

```yaml
services:
  trafikinfo:
    image: ghcr.io/minglarn/trafikinfo:latest
    container_name: trafikinfo-flux
    ports:
      - "7081:8000"
    volumes:
      - ./data:/app/data
    restart: always
    environment:
      - TZ=Europe/Stockholm
      - ADMIN_PASSWORD=ditt_lösenord_här
```

### 3. Starta
Kör följande kommando i samma mapp:
```bash
docker-compose up -d
```

### 4. Konfiguration & Säkerhet
1. Öppna [http://localhost:7081](http://localhost:7081) i din webbläsare.
2. För att ändra inställningar eller markera favoriter behöver du logga in som **Admin**. 
3. Klicka på lås-ikonen i sidomenyn och ange det lösenord du valde som `ADMIN_PASSWORD` (standard är `admin123`).
4. Klistra in din API-nyckel från Trafikverket under inställningar.
5. Välj vilka län du vill bevaka.
6. Tryck på **Spara inställningar**.

## 🏠 Home Assistant & MQTT

Trafikinfo Flux kan skicka realtidsaviseringar till Home Assistant via MQTT.

### MQTT Payload
Varje gång en ny händelse detekteras publiceras ett JSON-objekt på ämnet `trafikinfo/events` (standard). TrafikInfo FLUX känner av om den körs på en egen domän och applicerar den i länkarna. Annars används den lokala IP-adressen.   
Payloaden innehåller nu färdiga länkar för notiser:

```json
{
  "external_id": "GUIDc5f8b455-690d-41bf-9ee3-26ee2b778791",
  "title": "Räddningsinsats på Älvsborgsbron...",
  "description": null,
  "location": "E6.20 från Bräckemotet till Rödastensmotet...",
  "icon_id": "trafficMessage",
  "event_type": "Situation",
  "timestamp": "2026-02-11T19:06:17.480+01:00",
  "message_type": "Hinder på vägbanan, Vägen avstängd",
  "severity_code": 5,
  "severity_text": "Mycket stor påverkan",
  "road_number": "E6",
  "start_time": "2026-02-11T19:05:03.000+01:00",
  "end_time": "2026-02-11T19:45:00.000+01:00",
  "temporary_limit": null,
  "traffic_restriction_type": null,
  "latitude": 57.6932,
  "longitude": 11.9000,
  "icon_url": "http://192.168.1.50:7081/api/icons/trafficMessage",
  "camera_name": "Älvsborgsbron Norra söderut",
  "camera_snapshot": "GUIDc5f8...jpg",
  "snapshot_url": "http://192.168.1.50:7081/api/snapshots/GUIDc5f8...jpg",
  "event_url": "http://192.168.1.50:7081/?event_id=GUIDc5f8...",
  "external_camera_url": "https://api.trafikinfo.trafikverket.se/...",
  "extra_cameras": "[{\"id\": \"...\", \"name\": \"...\", \"snapshot\": \"...\", \"snapshot_url\": \"...\"}]"
}
```

### Exempel på Automation i Home Assistant

Använd följande YAML för att få snygga notiser med bild i din telefon när något händer:

```yaml
alias: "Trafikavisering: Olycka"
trigger:
  - platform: mqtt
    topic: "trafikinfo/events"
condition:
  - condition: template
    value_template: "{{ trigger.payload_json.severity_code >= 3 }}"
action:
  - service: notify.mobile_app_din_telefon
    data:
      title: "⚠️ {{ trigger.payload_json.title }}"
      message: "{{ trigger.payload_json.location }}"
      data:
        image: "{{ trigger.payload_json.snapshot_url }}"
        clickAction: "{{ trigger.payload_json.event_url }}"
        tag: "{{ trigger.payload_json.external_id }}"
```

> [!TIP]
> Appen rapporterar automatiskt sin adress (`base_url`) till servern när du öppnar PWA-gränssnittet. Detta gör att länkarna i MQTT-notiserna alltid pekar rätt.

## Teknikstack

Projektet är byggt med följande teknologier:

- **Programspråk**: Python (Backend) & JavaScript/HTML5 (Frontend)
- **Backend Framework**: FastAPI, SSE-Starlette
- **Frontend Framework**: React, Vite, Tailwind CSS, Framer Motion
- **Kartor**: Leaflet
- **Databas**: SQLite (SQLAlchemy)
- **Kommunikation**: MQTT (Paho-MQTT), SSE (HTTP)

## Licens
Detta projekt är licensierat under **MIT License**.
