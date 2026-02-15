import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Camera, Search, X, MapPin, Maximize2, Filter, Loader2, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Styles for MarkerCluster
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Camera Icon
const cameraIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

// Add custom styles for Leaflet popups to match theme
const styleFixes = `
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: white !important;
    color: #1e293b !important;
    border-radius: 12px !important;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
  }
  .dark .leaflet-popup-content-wrapper, .dark .leaflet-popup-tip {
    background: #0f172a !important;
    color: #f1f5f9 !important;
    border: 1px solid #1e293b !important;
  }
  .leaflet-popup-content {
    margin: 0 !important;
    width: 256px !important;
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

const RoadCameraMap = () => {
    const [cameras, setCameras] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roadFilter, setRoadFilter] = useState('');
    const [selectedCamera, setSelectedCamera] = useState(null);
    const [showFullSize, setShowFullSize] = useState(false);
    const [error, setError] = useState(null);
    const [favorites, setFavorites] = useState([]);

    // Get monitored counties from localStorage (Family Model)
    const [allowedCounties, setAllowedCounties] = useState([]);

    useEffect(() => {
        const loadState = () => {
            const counties = localStorage.getItem('localCounties');
            setAllowedCounties(counties ? counties.split(',') : []);

            const savedFavs = localStorage.getItem('camera_favorites');
            setFavorites(savedFavs ? savedFavs.split(',').filter(id => id.length > 0) : []);
        };
        loadState();
        window.addEventListener('storage', loadState);
        window.addEventListener('camera-favorites-changed', loadState);
        return () => {
            window.removeEventListener('storage', loadState);
            window.removeEventListener('camera-favorites-changed', loadState);
        };
    }, []);

    const toggleFavorite = (id) => {
        let newFavs;
        if (favorites.includes(id)) {
            newFavs = favorites.filter(fid => fid !== id);
        } else {
            newFavs = [...favorites, id];
        }
        localStorage.setItem('camera_favorites', newFavs.join(','));
        setFavorites(newFavs);
        window.dispatchEvent(new CustomEvent('camera-favorites-changed'));
    };

    const fetchCameras = useCallback(async () => {
        try {
            setLoading(true);
            // Fetch ALL matching cameras in allowed counties (limit=0)
            let url = `/api/cameras?limit=0`;
            if (allowedCounties.length > 0) {
                url += `&county_no=${allowedCounties.join(',')}`;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch cameras');
            const data = await response.json();
            // From main.py: return { "total_count": ..., "limit": ..., "offset": ..., "cameras": result }
            // Wait, I should check the return structure of get_cameras_api
            setCameras(data.cameras || []);
            setLoading(false);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    }, [allowedCounties]);

    useEffect(() => {
        fetchCameras();
    }, [fetchCameras]);

    const filteredCameras = cameras.filter(cam => {
        if (!roadFilter) return true;
        return cam.road_number && cam.road_number.toLowerCase().includes(roadFilter.toLowerCase());
    });

    const handleMarkerClick = (cam) => {
        setSelectedCamera(cam);
    };

    return (
        <div className="relative h-[calc(100vh-120px)] w-full overflow-hidden flex flex-col">
            <style>{styleFixes}</style>

            {/* Sidebar / Filter Overlay - Adjusted for mobile */}
            <div className="absolute top-4 left-4 z-[1000] w-[calc(100%-32px)] md:w-72 pointer-events-none">
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 pointer-events-auto">
                    <div className="flex items-center gap-2 mb-4">
                        <Camera className="w-5 h-5 text-blue-500" />
                        <h2 className="font-bold text-slate-800 dark:text-slate-100">Vägkameror</h2>
                        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Sök väg (t.ex. E4)..."
                            value={roadFilter}
                            onChange={(e) => setRoadFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 transition-all"
                        />
                        {roadFilter && (
                            <button
                                onClick={() => setRoadFilter('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                            >
                                <X className="w-4 h-4 text-slate-400" />
                            </button>
                        )}
                    </div>

                    <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                        <span>Visar {filteredCameras.length} av {cameras.length} kameror</span>
                        <div className="flex items-center gap-1">
                            <Filter className="w-3 h-3" />
                            <span>{allowedCounties.length > 0 ? `${allowedCounties.length} län` : 'Alla län'}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 h-full relative z-0">
                <MapContainer
                    center={[62.0, 15.0]} // Center of Sweden
                    zoom={5}
                    className="h-full w-full"
                    zoomControl={false} // Customizing zoom control position
                >
                    <MapRevalidator />
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />

                    <MarkerClusterGroup
                        chunkedLoading
                        maxClusterRadius={80}
                        spiderfyOnMaxZoom={true}
                        showCoverageOnHover={false}
                    >
                        {filteredCameras.map(cam => (
                            <Marker
                                key={cam.id}
                                position={[cam.latitude, cam.longitude]}
                                eventHandlers={{
                                    click: () => handleMarkerClick(cam)
                                }}
                            >
                                <Popup className="camera-popup">
                                    <div className="w-64 -mx-1 -my-1">
                                        <div className="relative aspect-video bg-slate-200 dark:bg-slate-800 rounded-t-lg overflow-hidden group">
                                            <img
                                                src={cam.proxy_url}
                                                alt={cam.name}
                                                className="w-full h-full object-cover cursor-pointer"
                                                onClick={() => {
                                                    if (window.innerWidth < 768) return;
                                                    setSelectedCamera(cam);
                                                    setShowFullSize(true);
                                                }}
                                            />
                                            <div className="absolute top-2 right-2 flex gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleFavorite(cam.id);
                                                    }}
                                                    className={`p-1.5 backdrop-blur-md rounded-lg transition-all ${favorites.includes(cam.id)
                                                        ? 'bg-yellow-500 text-white'
                                                        : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                                                        }`}
                                                >
                                                    <Star className={`w-4 h-4 ${favorites.includes(cam.id) ? 'fill-current' : ''}`} />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.innerWidth < 768) return;
                                                        setSelectedCamera(cam);
                                                        setShowFullSize(true);
                                                    }}
                                                    className="p-1.5 bg-black/50 backdrop-blur-md rounded-lg text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Maximize2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="p-3">
                                            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                {cam.road_number && (
                                                    <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">
                                                        {cam.road_number}
                                                    </span>
                                                )}
                                                {cam.name}
                                            </h3>
                                            <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                                <MapPin className="w-3 h-3" />
                                                {cam.location}
                                            </p>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        ))}
                    </MarkerClusterGroup>
                </MapContainer>
            </div>

            {/* Snapshot Detail View removed per user request */}

            {/* Fullsize Modal */}
            <AnimatePresence>
                {showFullSize && selectedCamera && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[2000] bg-black/95 flex flex-col"
                    >
                        <div className="flex items-center justify-between p-4 bg-black/20 backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <h3 className="text-white font-bold">{selectedCamera.name}</h3>
                                {selectedCamera.road_number && (
                                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded font-bold">
                                        {selectedCamera.road_number}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => setShowFullSize(false)}
                                className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 relative flex items-center justify-center p-4">
                            <img
                                src={`${selectedCamera.proxy_url}?fullsize=true`}
                                alt={selectedCamera.name}
                                className="max-w-full max-h-full object-contain shadow-2xl"
                            />
                            <div className="absolute top-3 left-3">
                                <button
                                    onClick={() => toggleFavorite(selectedCamera.id)}
                                    className={`p-2 backdrop-blur-md rounded-full transition-all shadow-lg ${favorites.includes(selectedCamera.id)
                                        ? 'bg-yellow-500 text-white'
                                        : 'bg-black/30 hover:bg-black/50 text-white'
                                        }`}
                                >
                                    <Star className={`w-5 h-5 ${favorites.includes(selectedCamera.id) ? 'fill-current' : ''}`} />
                                </button>
                            </div>
                        </div>
                        {selectedCamera.photo_time && (
                            <div className="p-4 text-center text-white/50 text-xs">
                                Bild tagen: {new Date(selectedCamera.photo_time).toLocaleString('sv-SE')}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RoadCameraMap;
