# Trafikinfo Flux

Trafikinfo Flux är en Docker-baserad plattform för att övervaka realtidsdata från det svenska Trafikverkets API. Systemet strömmar händelser (Situationer), lagrar dem i en lokal databas för historik och kan automatiskt pusha utvalda händelser till en MQTT-broker.

## Funktioner

- **SSE Streaming**: Direktuppkoppling mot Trafikverket för händelser i realtid.
- **Kartvisualisering**: Interaktiva kartor för att se exakt var händelser sker.
- **Statistik & Analys**: Dashboard som visar trender och fördelning av trafikstörningar.
- **MQTT Bridge**: Skickar vidare trafikdata till ditt smarta hem eller andra system.
- **Ljudaviseringar**: Möjlighet att få ljudsignaler vid nya händelser.
- **Web GUI**: Modernt, responsivt gränssnitt med mörkt läge.
- **Historik**: Sökbar databas över alla historiska händelser.

## Kom igång med Docker Compose

Det snabbaste sättet att starta Trafikinfo Flux är att använda Docker Compose.

### 1. Förberedelser
Du behöver en API-nyckel från [Trafikverket Datautbytesportal](https://dataportalen.trafikverket.se/).

### 2. Konfiguration (`docker-compose.yml`)
Skapa en fil med följande innehåll:

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
      - TRAFIKVERKET_API_KEY=DIN_NYCKEL_HÄR
      - MQTT_HOST=ditt.mqtt.host
      - MQTT_PORT=1883
      - MQTT_USER=användare
      - MQTT_PASSWORD=lösenord
      - DEBUG_MODE=false
      - TZ=Europe/Stockholm
```

### 3. Starta
Kör följande kommando i samma mapp:
```bash
docker-compose up -d
```

Öppna sedan [http://localhost:7081](http://localhost:7081) i din webbläsare.

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
