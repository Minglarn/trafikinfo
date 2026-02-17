import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, Search, X, MapPin, Filter, Loader2, AlertTriangle, Activity, Info, Camera } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import EventModal from './EventModal';

// Styles for MarkerCluster
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Fix for default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Icon Logic for different event types
const createCustomIcon = (iconUrl) => {
    return new L.Icon({
        iconUrl: iconUrl || 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
    });
};

const styleFixes = `
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: white !important;
    color: #1e293b !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
    padding: 0 !important;
  }
  .dark .leaflet-popup-content-wrapper, .dark .leaflet-popup-tip {
    background: #0f172a !important;
    color: #f1f5f9 !important;
    border: 1px solid #1e293b !important;
  }
  .leaflet-popup-content {
    margin: 0 !important;
    width: 280px !important;
  }
  .leaflet-container {
    background: #f8fafc !important;
  }
  .dark .leaflet-container {
    background: #020617 !important;
  }
`;

function MapRevalidator() {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        const timer = setTimeout(() => map.invalidateSize(), 400);
        return () => clearTimeout(timer);
    }, [map]);
    return null;
}

const EventMapDashboard = () => {
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [error, setError] = useState(null);
    const [monitoredCounties, setMonitoredCounties] = useState(() => {
        const saved = localStorage.getItem('localCounties');
        return saved ? saved.split(',').map(id => parseInt(id)) : [];
    });

    const fetchAllEvents = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch ALL active events (limit=0 or a large number)
            const countyParam = monitoredCounties.length > 0 ? `&counties=${monitoredCounties.join(',')}` : '';
            const response = await axios.get(`/api/events?limit=500&offset=0${countyParam}&type=realtid`);
            setEvents(response.data || []);
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch events for map:', err);
            setError('Kunde inte hämta händelser');
            setLoading(false);
        }
    }, [monitoredCounties]);

    useEffect(() => {
        fetchAllEvents();

        // Listen for real-time updates from SSE via App.jsx custom events
        const handleNewEvent = (e) => {
            const data = e.detail;
            setEvents(prev => {
                const existing = prev.find(ev => ev.id === data.id || ev.external_id === data.external_id);
                if (existing) {
                    return prev.map(ev => (ev.id === data.id || ev.external_id === data.external_id) ? { ...ev, ...data } : ev);
                }
                // Only add if it belongs to monitored counties or is national
                if (data.county_no === 0 || monitoredCounties.includes(data.county_no)) {
                    return [data, ...prev];
                }
                return prev;
            });
        };

        window.addEventListener('flux-traffic-event', handleNewEvent);
        return () => window.removeEventListener('flux-traffic-event', handleNewEvent);
    }, [fetchAllEvents, monitoredCounties]);

    const filteredEvents = useMemo(() => {
        return events.filter(ev => {
            if (!searchQuery) return true;
            const query = searchQuery.toLowerCase();
            return (
                ev.title?.toLowerCase().includes(query) ||
                ev.location?.toLowerCase().includes(query) ||
                ev.description?.toLowerCase().includes(query) ||
                ev.message_type?.toLowerCase().includes(query)
            );
        });
    }, [events, searchQuery]);

    const handleMarkerClick = (event) => {
        setSelectedEvent(event);
    };

    return (
        <div className="relative h-[calc(100vh-120px)] md:h-[calc(100vh-48px)] w-full overflow-hidden flex flex-col -m-4 sm:-m-6 lg:-m-8">
            <style>{styleFixes}</style>

            {/* Header Overlay */}
            <div className="absolute top-4 left-4 z-[1000] w-[calc(100%-32px)] md:w-80 pointer-events-none">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 pointer-events-auto">
                    <div className="flex items-center gap-2 mb-4">
                        <MapIcon className="w-5 h-5 text-blue-500" />
                        <h2 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider text-sm">Händelsekarta</h2>
                        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Sök händelse, plats..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        )}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500 font-bold uppercase tracking-tight">
                        <span>{filteredEvents.length} händelser visas</span>
                        <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Filter className="w-3 h-3" />
                            <span>{monitoredCounties.length > 0 ? `${monitoredCounties.length} län` : 'Hela landet'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map Area */}
            <div className="flex-1 h-full relative z-0">
                <MapContainer
                    center={[59.3293, 18.0686]} // Stockholm default
                    zoom={7}
                    className="h-full w-full"
                    zoomControl={false}
                >
                    <MapRevalidator />
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    />

                    <MarkerClusterGroup
                        chunkedLoading
                        maxClusterRadius={50}
                        spiderfyOnMaxZoom={true}
                        showCoverageOnHover={false}
                    >
                        {filteredEvents.map(ev => {
                            if (!ev.latitude || !ev.longitude) return null;
                            return (
                                <Marker
                                    key={ev.id || ev.external_id}
                                    position={[ev.latitude, ev.longitude]}
                                    icon={createCustomIcon(ev.icon_url)}
                                >
                                    <Popup>
                                        <div className="p-0 overflow-hidden rounded-xl">
                                            {/* Preview Image if available */}
                                            {ev.camera_snapshot && (
                                                <div className="relative aspect-video bg-slate-200 dark:bg-slate-800">
                                                    <img
                                                        src={`/api/snapshots/${ev.camera_snapshot}`}
                                                        alt={ev.title}
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <div className="absolute top-2 right-2 bg-blue-600 text-white p-1 rounded-lg">
                                                        <Camera className="w-3.5 h-3.5" />
                                                    </div>
                                                </div>
                                            )}
                                            <div className="p-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {ev.icon_url && <img src={ev.icon_url} className="w-4 h-4 object-contain" alt="" />}
                                                    <h3 className="font-bold text-xs truncate leading-tight dark:text-white">{ev.title}</h3>
                                                </div>
                                                <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">{ev.description}</p>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase">
                                                        <MapPin className="w-2.5 h-2.5" />
                                                        <span className="truncate max-w-[120px]">{ev.location}</span>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMarkerClick(ev);
                                                        }}
                                                        className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded-lg font-bold transition-colors shadow-lg shadow-blue-500/20"
                                                    >
                                                        Visa detaljer
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>

            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventModal
                    event={selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                />
            )}

            {/* Error Message */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[2000] bg-red-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold"
                    >
                        <AlertTriangle className="w-5 h-5" />
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="ml-2 hover:bg-white/20 p-1 rounded-full"><X className="w-4 h-4" /></button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default EventMapDashboard;
