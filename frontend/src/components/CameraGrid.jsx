import React, { useState, useEffect, useCallback } from 'react'
import { Search, Star, ExternalLink, X, Camera, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'

const CameraGrid = () => {
    const [favorites, setFavorites] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedCamera, setSelectedCamera] = useState(null)
    const [counts, setCounts] = useState({ total: 0, favorites: 0 })

    // Local Storage Favorites
    const [localFavoriteIds, setLocalFavoriteIds] = useState([])

    useEffect(() => {
        const loadFavs = () => {
            const saved = localStorage.getItem('camera_favorites');
            setLocalFavoriteIds(saved ? saved.split(',').filter(id => id.length > 0) : []);
        };
        loadFavs();
        window.addEventListener('camera-favorites-changed', loadFavs);
        return () => window.removeEventListener('camera-favorites-changed', loadFavs);
    }, []);

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500)
        return () => clearTimeout(timer)
    }, [searchTerm])

    const fetchInitial = useCallback(async (silent = false) => {
        if (!silent) setLoading(true)
        try {
            // Fetch basic metadata/counts first
            const resMeta = await axios.get('/api/cameras', { params: { limit: 1 } });

            let favoriteData = [];
            if (localFavoriteIds.length > 0) {
                const resFavs = await axios.get('/api/cameras', {
                    params: { ids: localFavoriteIds.join(','), limit: 0 }
                });
                favoriteData = resFavs.data.cameras || [];
            }

            // If searching, we still want to show matches from favorites
            if (debouncedSearch) {
                const searchLower = debouncedSearch.toLowerCase();
                favoriteData = favoriteData.filter(cam =>
                    cam.name.toLowerCase().includes(searchLower) ||
                    (cam.road_number && cam.road_number.toLowerCase().includes(searchLower)) ||
                    (cam.location && cam.location.toLowerCase().includes(searchLower))
                );
            }

            setFavorites(favoriteData);
            setCounts({
                total: resMeta.data.total_count,
                favorites: localFavoriteIds.length,
            });
        } catch (error) {
            console.error('Initial fetch failed:', error)
        } finally {
            if (!silent) setLoading(false)
        }
    }, [localFavoriteIds, debouncedSearch]);

    useEffect(() => {
        fetchInitial()
    }, [fetchInitial])

    // Auto-refresh every 5 minutes (silent)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchInitial(true);
        }, 300000);
        return () => clearInterval(interval);
    }, [fetchInitial]);

    const toggleFavorite = (id) => {
        let newFavs;
        if (localFavoriteIds.includes(id)) {
            newFavs = localFavoriteIds.filter(fid => fid !== id);
        } else {
            newFavs = [...localFavoriteIds, id];
        }
        localStorage.setItem('camera_favorites', newFavs.join(','));
        setLocalFavoriteIds(newFavs);
        window.dispatchEvent(new CustomEvent('camera-favorites-changed'));
    };

    const handleCameraClick = (camera) => {
        // Disable full-screen modal on mobile
        if (window.innerWidth < 768) return;
        setSelectedCamera(camera);
    };

    const CameraCard = React.memo(({ camera }) => (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-950 cursor-pointer" onClick={() => handleCameraClick(camera)}>
                <img
                    src={camera.proxy_url}
                    alt={camera.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                        e.target.style.opacity = '0';
                    }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="w-8 h-8 text-white" />
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(camera.id);
                    }}
                    className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all ${localFavoriteIds.includes(camera.id)
                        ? 'bg-yellow-400 text-white shadow-lg scale-110'
                        : 'bg-black/20 text-white hover:bg-black/40'
                        }`}
                >
                    <Star className={`w-4 h-4 ${localFavoriteIds.includes(camera.id) ? 'fill-current' : ''}`} />
                </button>

                {camera.type && (
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {camera.type}
                    </div>
                )}
            </div>
            <div className="p-4 flex-1">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-tight mb-1 truncate" title={camera.name}>
                    <span className="bg-blue-600 text-white px-1 rounded text-[10px] font-bold mr-2">{camera.road_number}</span>
                    {camera.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 min-h-[32px]">
                    {camera.description || camera.location}
                </p>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
                    <span>{camera.id}</span>
                    {camera.photo_time && (
                        <span>
                            {format(new Date(camera.photo_time), 'HH:mm, d MMM', { locale: sv })}
                        </span>
                    )}
                </div>
            </div>
        </motion.div>
    ))

    if (loading && favorites.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                <RefreshCw className="w-8 h-8 animate-spin mb-4" />
                <p>Hämtar vägkameror...</p>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-12">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative group flex-1 max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Sök bland dina favoriter..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    />
                </div>
            </header>

            {!debouncedSearch && favorites.length === 0 && counts.total === 0 && !loading ? (
                <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
                    <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 dark:text-200">Hittade inga kameror</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Växla till kartan för att lägga till favoriter.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Favorites Section */}
                    {favorites.length > 0 ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Star className="w-4 h-4 text-yellow-500 fill-current" />
                                <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                    {debouncedSearch ? 'Sökresultat' : `Favoriter (${favorites.length})`}
                                </h2>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {favorites.map((camera) => (
                                        <CameraCard key={camera.id} camera={camera} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    ) : (
                        debouncedSearch && (
                            <div className="py-20 text-center">
                                <Search className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                                <p className="text-slate-500">Inga favoriter matchade din sökning.</p>
                            </div>
                        )
                    )}
                </div>
            )}

            {/* Full size modal - Disabled for mobile inside handleCameraClick */}
            <AnimatePresence>
                {selectedCamera && (
                    <div className="fixed inset-0 z-[2000] bg-black/95 flex flex-col" onClick={() => setSelectedCamera(null)}>
                        <div className="flex items-center justify-between p-4 bg-black/20 backdrop-blur-md">
                            <div className="flex items-center gap-3">
                                <h3 className="text-white font-bold">{selectedCamera.name}</h3>
                                {selectedCamera.road_number && (
                                    <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                                        {selectedCamera.road_number}
                                    </span>
                                )}
                            </div>
                            <button className="p-2 hover:bg-white/10 rounded-full text-white transition-colors" onClick={() => setSelectedCamera(null)}>
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex-1 relative flex items-center justify-center p-4">
                            <img
                                src={`${selectedCamera.proxy_url}?fullsize=true`}
                                alt={selectedCamera.name}
                                className="max-w-full max-h-full object-contain shadow-2xl"
                            />
                            <div className="absolute top-4 left-4">
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleFavorite(selectedCamera.id); }}
                                    className={`p-3 rounded-full transition-all shadow-2xl ${localFavoriteIds.includes(selectedCamera.id)
                                        ? 'bg-yellow-400 text-white scale-110'
                                        : 'bg-black/50 text-white hover:bg-black/70'
                                        }`}
                                >
                                    <Star className={`w-6 h-6 ${localFavoriteIds.includes(selectedCamera.id) ? 'fill-current' : ''}`} />
                                </button>
                            </div>
                        </div>
                        <div className="p-6 bg-black/40 backdrop-blur-md text-white/70 text-center">
                            <p className="text-sm max-w-2xl mx-auto">{selectedCamera.description || selectedCamera.location}</p>
                            {selectedCamera.photo_time && (
                                <div className="mt-2 text-[10px] opacity-50 uppercase tracking-widest">
                                    Bild tagen: {format(new Date(selectedCamera.photo_time), 'PPpp', { locale: sv })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default CameraGrid
