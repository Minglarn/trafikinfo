import React, { useState, useEffect, useMemo } from 'react'
import { Search, Star, ExternalLink, X, Camera, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'

const CameraGrid = () => {
    const [favoriteCameras, setFavoriteCameras] = useState([])
    const [allCameras, setAllCameras] = useState([])
    const [otherCount, setOtherCount] = useState(0)
    const [allLoaded, setAllLoaded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCamera, setSelectedCamera] = useState(null)
    const [refreshing, setRefreshing] = useState(false)

    const fetchCameras = async (showLoading = true, forceAll = false) => {
        if (showLoading) setLoading(true)
        try {
            const isAllMode = allLoaded || forceAll || searchTerm.length > 0;
            const response = await axios.get('/api/cameras', {
                params: { only_favorites: !isAllMode }
            })

            if (isAllMode) {
                const data = Array.isArray(response.data) ? response.data : (response.data.favorites || []);
                setAllCameras(data)
                setFavoriteCameras(data.filter(c => c.is_favorite))
                setAllLoaded(true)
            } else {
                setFavoriteCameras(response.data.favorites || [])
                setOtherCount(response.data.other_count || 0)
                // Auto-load all if no favorites exist
                if (response.data.favorites?.length === 0 && response.data.other_count > 0) {
                    fetchCameras(false, true)
                }
            }
        } catch (error) {
            console.error('Failed to fetch cameras:', error)
        } finally {
            if (showLoading) setLoading(false)
            setRefreshing(false)
        }
    }

    useEffect(() => {
        fetchCameras()
        const interval = setInterval(() => fetchCameras(false), 30000) // Refresh every 30s
        return () => clearInterval(interval)
    }, [])

    const toggleFavorite = async (id) => {
        try {
            const response = await axios.post(`/api/cameras/${id}/toggle-favorite`)
            const isFav = response.data.is_favorite;

            // Update lists locally
            setFavoriteCameras(prev => {
                if (isFav) {
                    const cam = allCameras.find(c => c.id === id);
                    return cam ? [...prev, { ...cam, is_favorite: true }] : prev;
                } else {
                    return prev.filter(c => c.id !== id);
                }
            });

            setAllCameras(prev => prev.map(cam =>
                cam.id === id ? { ...cam, is_favorite: isFav } : cam
            ));
        } catch (error) {
            console.error('Failed to toggle favorite:', error)
        }
    }

    const { filteredFavorites, filteredOthers } = useMemo(() => {
        const lowerSearch = searchTerm.toLowerCase()
        const filterFn = cam =>
            cam.name?.toLowerCase().includes(lowerSearch) ||
            cam.location?.toLowerCase().includes(lowerSearch)

        const sortedFavs = favoriteCameras.filter(filterFn).sort((a, b) => a.name.localeCompare(b.name))

        let others = []
        if (allLoaded || searchTerm.length > 0) {
            others = allCameras.filter(cam => !cam.is_favorite && filterFn(cam)).sort((a, b) => a.name.localeCompare(b.name))
        }

        return {
            filteredFavorites: sortedFavs,
            filteredOthers: others
        }
    }, [favoriteCameras, allCameras, allLoaded, searchTerm])

    const CameraCard = ({ camera }) => (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-950 cursor-pointer" onClick={() => setSelectedCamera(camera)}>
                <img
                    src={camera.url}
                    alt={camera.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x300?text=Bild+saknas';
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
                    className={`absolute top-2 right-2 p-2 rounded-full backdrop-blur-md transition-all ${camera.is_favorite
                        ? 'bg-yellow-400 text-white shadow-lg scale-110'
                        : 'bg-black/20 text-white hover:bg-black/40'
                        }`}
                >
                    <Star className={`w-4 h-4 ${camera.is_favorite ? 'fill-current' : ''}`} />
                </button>
                {camera.type && (
                    <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/50 backdrop-blur-md rounded text-[10px] text-white font-medium uppercase tracking-wider">
                        {camera.type}
                    </div>
                )}
            </div>
            <div className="p-4 flex-1">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 leading-tight mb-1 truncate" title={camera.name}>
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
    )

    if (loading && favoriteCameras.length === 0 && allCameras.length === 0) {
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
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Camera className="w-6 h-6 text-blue-500" />
                        Vägkameror
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Snapshots från Trafikverkets kameror i valda län. Uppdateras var 5:e minut.
                    </p>
                </div>

                <div className="relative group min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                    <input
                        type="text"
                        placeholder="Sök bland kameror..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                    />
                </div>
            </header>

            {filteredFavorites.length === 0 && filteredOthers.length === 0 && (!allLoaded || searchTerm.length > 0) ? (
                <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
                    <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Inga kameror hittades</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Prova att söka på något annat eller kontrollera dina valda län i inställningar.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Favorites Section */}
                    {filteredFavorites.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">Favoriter</h2>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {filteredFavorites.map((camera) => (
                                        <CameraCard key={camera.id} camera={camera} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {/* All / Other Cameras Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Camera className="w-5 h-5 text-slate-400" />
                            <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">
                                {favoriteCameras.length > 0 ? 'Övriga kameror' : 'Alla kameror'}
                            </h2>
                            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                        </div>

                        {!allLoaded && searchTerm.length === 0 ? (
                            <div className="flex flex-col items-center py-10 bg-white/50 dark:bg-slate-900/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                <p className="text-slate-500 mb-4 text-sm">Det finns ytterligare {otherCount} kameror i dina valda län.</p>
                                <button
                                    onClick={() => fetchCameras(true, true)}
                                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all shadow-lg shadow-blue-500/20 font-medium"
                                >
                                    Visa alla kameror
                                </button>
                            </div>
                        ) : (
                            filteredOthers.length === 0 && searchTerm ? (
                                <p className="text-center py-10 text-slate-500 text-sm italic">Inga matchningar bland övriga kameror.</p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    <AnimatePresence mode="popLayout">
                                        {filteredOthers.map((camera) => (
                                            <CameraCard key={camera.id} camera={camera} />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* Full size image modal */}
            <AnimatePresence>
                {selectedCamera && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-slate-950/90 backdrop-blur-sm"
                        onClick={() => setSelectedCamera(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="relative max-w-5xl w-full bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    onClick={() => setSelectedCamera(null)}
                                    className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="flex flex-col">
                                <div className="bg-slate-950 aspect-video relative">
                                    <img
                                        src={selectedCamera.fullsize_url || selectedCamera.url}
                                        alt={selectedCamera.name}
                                        className="w-full h-full object-contain"
                                    />
                                </div>
                                <div className="p-6 bg-white dark:bg-slate-900">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
                                                {selectedCamera.name}
                                            </h2>
                                            <p className="text-slate-500 dark:text-slate-400">
                                                {selectedCamera.description || selectedCamera.location}
                                            </p>
                                            <div className="mt-3 flex items-center gap-4 text-sm text-slate-400">
                                                <span className="flex items-center gap-1">
                                                    <Camera className="w-4 h-4" />
                                                    {selectedCamera.type}
                                                </span>
                                                {selectedCamera.photo_time && (
                                                    <span>
                                                        Taget: {format(new Date(selectedCamera.photo_time), 'PPpp', { locale: sv })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => toggleFavorite(selectedCamera.id)}
                                            className={`p-3 rounded-xl transition-all ${selectedCamera.is_favorite
                                                ? 'bg-yellow-400 text-white shadow-lg'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            <Star className={`w-6 h-6 ${selectedCamera.is_favorite ? 'fill-current' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

export default CameraGrid
