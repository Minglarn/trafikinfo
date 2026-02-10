import React, { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icon in React Leaflet
// Vite/Webpack sometimes strips these assets or paths are wrong
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to invalidate map size on mount/updates
function MapRevalidator() {
    const map = useMap();

    useEffect(() => {
        // Invalidate size immediately and after a short delay for animations
        map.invalidateSize();

        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 400); // Wait for potential animations (framer motion default is ~300ms)

        return () => clearTimeout(timer);
    }, [map]);

    return null;
}

export default function EventMap({ lat, lng, popupContent, interactive = true }) {
    // Ensure we have valid coordinates
    if (!lat || !lng) return null;

    return (
        <div className="h-full w-full bg-slate-100 dark:bg-slate-800 relative z-0">
            <MapContainer
                center={[lat, lng]}
                zoom={interactive ? 13 : 11}
                scrollWheelZoom={interactive}
                dragging={interactive}
                zoomControl={interactive}
                doubleClickZoom={interactive}
                attributionControl={interactive}
                style={{ height: '100%', width: '100%' }}
            >
                <MapRevalidator />
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution={interactive ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' : ''}
                />
                <Marker position={[lat, lng]}>
                    {interactive && (
                        <Popup>
                            {popupContent}
                        </Popup>
                    )}
                </Marker>
            </MapContainer>
        </div>
    )
}
