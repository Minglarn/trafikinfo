import React, { useState, useEffect, useMemo } from 'react'
import { Search, Star, ExternalLink, X, Camera, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'

const CameraGrid = () => {
    const [cameras, setCameras] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCamera, setSelectedCamera] = useState(null)
    const [refreshing, setRefreshing] = useState(false)

    const fetchCameras = async (showLoading = true) => {
        if (showLoading) setLoading(true)
        try {
            const response = await axios.get('/api/cameras')
            setCameras(response.data)
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
            setCameras(cameras.map(cam =>
                cam.id === id ? { ...cam, is_favorite: response.data.is_favorite } : cam
            ))
        } catch (error) {
            console.error('Failed to toggle favorite:', error)
        }
    }

    const { favoriteCameras, otherCameras } = useMemo(() => {
        const filtered = cameras.filter(cam =>
            cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cam.location?.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.name.localeCompare(b.name))

        return {
            favoriteCameras: filtered.filter(cam => cam.is_favorite),
            otherCameras: filtered.filter(cam => !cam.is_favorite)
        }
    }, [cameras, searchTerm])

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

    if (loading && cameras.length === 0) {
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

            {favoriteCameras.length === 0 && otherCameras.length === 0 ? (
                <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
                    <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">Inga kameror hittades</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Prova att söka på något annat eller kontrollera dina valda län i inställningar.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Favorites Section */}
                    {favoriteCameras.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">Favoriter</h2>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {favoriteCameras.map((camera) => (
                                        <CameraCard key={camera.id} camera={camera} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}

                    {/* All / Other Cameras Section */}
                    {otherCameras.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Camera className="w-5 h-5 text-slate-400" />
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">
                                    {favoriteCameras.length > 0 ? 'Övriga kameror' : 'Alla kameror'}
                                </h2>
                                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {otherCameras.map((camera) => (
                                        <CameraCard key={camera.id} camera={camera} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )}
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
