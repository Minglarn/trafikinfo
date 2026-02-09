# Trafikinfo Flux 🚦

Trafikinfo Flux är en Docker-baserad plattform för att övervaka realtidsdata från det svenska Trafikverkets API. Systemet strömmar händelser (Situationer), lagrar dem i en lokal databas för historik och kan automatiskt pusha utvalda händelser till en MQTT-broker.

## ✨ Funktioner

- **SSE Streaming**: Direktuppkoppling mot Trafikverket för händelser i realtid.
- **Geofiltre**: Inbyggt stöd för att filtrera på specifika län (t.ex. Stockholm och Södermanland).
- **MQTT Bridge**: Skickar vidare trafikdata till ditt smarta hem eller andra system.
- **Web GUI**: Modernt gränssnitt byggt med React och Tailwind CSS.
- **Historik**: Full spårbarhet av alla mottagna händelser via en sökbar databas.
- **Dockerized**: Enkel installation och körning med Docker Compose.

## 🚀 Kom igång

### Förutsättningar
- Docker och Docker Compose
- En API-nyckel från [Trafikverket Datautbytesportal](https://dataportalen.trafikverket.se/)

### Installation

1. Klona repot:
   ```bash
   git clone <din-repo-url>
   cd trafikinfo
   ```

2. Skapa en `.env`-fil baserat på `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Starta systemet:
   ```bash
   docker-compose up --build
   ```

4. Öppna GUI:et på [http://localhost:8080](http://localhost:8080).

## 🛠 Teknikstack

- **Backend**: Python (FastAPI, SQLAlchemy, SSE-Starlette)
- **Frontend**: React (Vite, Tailwind CSS, Framer Motion)
- **Databas**: SQLite
- **Kommunikation**: MQTT (Paho-MQTT), SSE (HTTP)

## 📜 Licens
MIT
