import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, Star, ExternalLink, X, Camera, RefreshCw, Lock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'

const CameraGrid = () => {
    const { isLoggedIn } = useAuth()
    const [favorites, setFavorites] = useState([])
    const [others, setOthers] = useState([])
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [selectedCamera, setSelectedCamera] = useState(null)
    const [showOthers, setShowOthers] = useState(false)
    const [counts, setCounts] = useState({ total: 0, favorites: 0, others: 0 })
    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(false)
    const PAGE_SIZE = 24

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500)
        return () => clearTimeout(timer)
    }, [searchTerm])

    // Initial fetch for favorites and counts
    const fetchInitial = async () => {
        setLoading(true)
        try {
            const res = await axios.get('/api/cameras', { params: { only_favorites: true } })
            setFavorites(res.data.favorites || [])
            setCounts({
                total: res.data.total_count,
                favorites: res.data.favorites_count,
                others: res.data.other_count
            })

            // If search is active, trigger first batch of others
            if (debouncedSearch) {
                fetchOthers(0, true)
            }
        } catch (error) {
            console.error('Initial fetch failed:', error)
        } finally {
            setLoading(false)
        }
    }

    // Fetch batch of "others"
    const fetchOthers = async (currentOffset, reset = false) => {
        if (loadingMore) return
        setLoadingMore(true)
        try {
            const res = await axios.get('/api/cameras', {
                params: {
                    limit: PAGE_SIZE,
                    offset: currentOffset,
                    search: debouncedSearch,
                    is_favorite: false
                }
            })

            const newCams = res.data.cameras || []
            setOthers(prev => reset ? newCams : [...prev, ...newCams])
            setHasMore(res.data.has_more)
            setOffset(currentOffset + PAGE_SIZE)
        } catch (error) {
            console.error('Fetch others failed:', error)
        } finally {
            setLoadingMore(false)
        }
    }

    useEffect(() => {
        fetchInitial()
    }, [debouncedSearch])

    useEffect(() => {
        if (showOthers && others.length === 0 && !debouncedSearch) {
            fetchOthers(0, true)
        }
    }, [showOthers])

    const toggleFavorite = async (id) => {
        if (!isLoggedIn) return
        try {
            await axios.post(`/api/cameras/${id}/toggle-favorite`)
            fetchInitial()
            if (showOthers || debouncedSearch) {
                fetchOthers(0, true)
            }
        } catch (error) {
            console.error('Toggle favorite failed:', error)
        }
    }

    // Infinite scroll observer
    const observer = React.useRef()
    const lastElementRef = useCallback(node => {
        if (loadingMore) return
        if (observer.current) observer.current.disconnect()
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                fetchOthers(offset)
            }
        })
        if (node) observer.current.observe(node)
    }, [loadingMore, hasMore, offset])

    const CameraCard = React.memo(({ camera }) => (
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
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                        e.target.src = 'https://via.placeholder.com/400x300?text=Bild+saknas';
                    }}
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="w-8 h-8 text-white" />
                </div>
                {isLoggedIn && (
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
                )}
                {!isLoggedIn && camera.is_favorite && (
                    <div className="absolute top-2 right-2 p-2 rounded-full bg-yellow-400 text-white shadow-lg scale-110 backdrop-blur-md">
                        <Star className="w-4 h-4 fill-current" />
                    </div>
                )}
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
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <Camera className="w-6 h-6 text-blue-500" />
                        Vägkameror
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm">
                        Snapshots från Trafikverkets kameror i valda län. Uppdateras var 5:e minut.
                    </p>
                </div>

                <div className="flex items-center gap-4">
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
                </div>
            </header>

            {!debouncedSearch && favorites.length === 0 && counts.total === 0 && !loading ? (
                <div className="bg-white dark:bg-slate-900/50 rounded-2xl p-12 text-center border border-dashed border-slate-200 dark:border-slate-800">
                    <Camera className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-slate-800 dark:text-200">Inga kameror hittades</h3>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">Prova att kontrollera dina valda län i inställningar.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {/* Favorites Section */}
                    {favorites.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <Star className="w-5 h-5 text-yellow-400 fill-current" />
                                <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">Favoriter ({favorites.length})</h2>
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
                    )}

                    {/* All / Other Cameras Section */}
                    {counts.others > 0 || (debouncedSearch && others.length > 0) ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 flex-1">
                                    <Camera className="w-5 h-5 text-slate-400" />
                                    <h2 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">
                                        {debouncedSearch ? `Sökresultat (${counts.others})` : `Övriga kameror (${counts.others})`}
                                    </h2>
                                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800/50" />
                                </div>

                                {!debouncedSearch && counts.others > 0 && (
                                    <button
                                        onClick={() => setShowOthers(!showOthers)}
                                        className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${showOthers
                                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                            : 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/20'
                                            }`}
                                    >
                                        {showOthers ? 'Dölj övriga' : 'Visa övriga'}
                                    </button>
                                )}
                            </div>

                            {(showOthers || debouncedSearch) ? (
                                <div className="space-y-6">
                                    {others.length === 0 && !loadingMore ? (
                                        <p className="text-center py-10 text-slate-500 text-sm italic">Inga matchningar bland övriga kameror.</p>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                <AnimatePresence mode="popLayout">
                                                    {others.map((camera, index) => (
                                                        <div key={camera.id} ref={index === others.length - 1 ? lastElementRef : null}>
                                                            <CameraCard camera={camera} />
                                                        </div>
                                                    ))}
                                                </AnimatePresence>
                                            </div>
                                            {loadingMore && (
                                                <div className="flex justify-center py-4">
                                                    <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                counts.others > 0 && (
                                    <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-900/20">
                                        <p className="text-slate-500 text-sm">
                                            {counts.others} kameror är dolda. Klicka på "Visa övriga" eller börja söka för att ladda in dem.
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    ) : debouncedSearch && !loadingMore && others.length === 0 && (
                        <div className="py-20 text-center">
                            <Search className="w-12 h-12 text-slate-200 dark:text-slate-800 mx-auto mb-4" />
                            <p className="text-slate-500">Inga kameror matchade din sökning.</p>
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
                                        {isLoggedIn && (
                                            <button
                                                onClick={() => toggleFavorite(selectedCamera.id)}
                                                className={`p-3 rounded-xl transition-all ${selectedCamera.is_favorite
                                                    ? 'bg-yellow-400 text-white shadow-lg'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'
                                                    }`}
                                            >
                                                <Star className={`w-6 h-6 ${selectedCamera.is_favorite ? 'fill-current' : ''}`} />
                                            </button>
                                        )}
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
