import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { MapPin, Info, AlertTriangle, Clock, Filter, X, Camera, History as HistoryIcon, Activity, Calendar, AlertCircle, Thermometer, Wind, ChevronRight, ChevronLeft } from 'lucide-react'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import EventMap from './EventMap'
import EventModal from './EventModal'

const API_BASE = '/api'

const MESSAGE_TYPES = [
    'Viktig trafikinformation',
    'Olycka',
    'Vägarbete',
    'Hinder',
    'Restriktion',
    'Trafikmeddelande',
    'Färjor',
]

const SEVERITY_LEVELS = [
    'Ingen påverkan',
    'Liten påverkan',
    'Stor påverkan',
    'Mycket stor påverkan',
]

const SEVERITY_COLORS = {
    'Ingen påverkan': 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600',
    'Liten påverkan': 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-500/20',
    'Stor påverkan': 'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20',
    'Mycket stor påverkan': 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20',
}

const SEVERITY_ACCENT_COLORS = {
    'Ingen påverkan': 'border-l-slate-200 dark:border-l-slate-700',
    'Liten påverkan': 'border-l-yellow-400 dark:border-l-yellow-500',
    'Stor påverkan': 'border-l-orange-500 dark:border-l-orange-600',
    'Mycket stor påverkan': 'border-l-red-600 dark:border-l-red-500',
}

const SEVERITY_CARD_BORDERS = {
    'Ingen påverkan': 'border-slate-200 dark:border-slate-700',
    'Liten påverkan': 'border-yellow-300/60 dark:border-yellow-500/30',
    'Stor påverkan': 'border-orange-300/60 dark:border-orange-500/30',
    'Mycket stor påverkan': 'border-red-300/60 dark:border-red-500/30',
}

const SEVERITY_BG_TINTS = {
    'Ingen påverkan': '',
    'Liten påverkan': 'bg-yellow-500/[0.07] dark:bg-yellow-500/[0.10]',
    'Stor påverkan': 'bg-orange-500/[0.09] dark:bg-orange-500/[0.14]',
    'Mycket stor påverkan': 'bg-red-500/[0.12] dark:bg-red-500/[0.18]',
}

// Helper for safe date formatting
const safeFormat = (dateStr, fmt) => {
    if (!dateStr) return ''
    try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return format(date, fmt)
    } catch (e) {
        console.error('Date formatting error:', dateStr, e)
        return ''
    }
}

const CameraCarousel = ({ cameras, onExpand, isExpanded, variant = 'compact' }) => {
    const [index, setIndex] = useState(0);

    if (!cameras || cameras.length === 0) {
        return (
            <div className={`absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 z-0 ${variant === 'expanded' ? 'min-h-[300px]' : ''}`}>
                <Camera className="w-8 h-8 mb-1 opacity-20" />
                <span className="text-[10px] italic">Ingen bild</span>
            </div>
        );
    }

    const next = () => setIndex((prev) => (prev + 1) % cameras.length);
    const prev = () => setIndex((prev) => (prev - 1 + cameras.length) % cameras.length);

    const isExpandedVariant = variant === 'expanded';

    return (
        <div className={`relative w-full group/carousel overflow-hidden ${isExpandedVariant ? 'bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl' : 'h-full'}`}>
            {/* Image Container */}
            <div className={`relative w-full overflow-hidden ${isExpandedVariant ? 'aspect-video bg-slate-900 rounded-t-xl' : 'h-full'}`}>
                <AnimatePresence initial={false} mode="wait">
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className={`absolute inset-0 ${!isExpandedVariant ? 'cursor-zoom-in' : ''}`}
                        onClick={(e) => {
                            if (!isExpandedVariant) {
                                e.stopPropagation();
                                onExpand();
                            }
                        }}
                        drag="x"
                        dragConstraints={{ left: 0, right: 0 }}
                        onDragEnd={(e, { offset, velocity }) => {
                            const swipe = offset.x;
                            if (swipe < -30) next();
                            else if (swipe > 30) prev();
                        }}
                    >
                        <img
                            src={isExpandedVariant ? cameras[index].src : `/api/snapshots/${cameras[index].snapshot}`}
                            alt={cameras[index].name || 'Trafikkamera'}
                            className={`w-full h-full ${isExpandedVariant ? 'object-contain' : 'object-cover'}`}
                            onError={(e) => { e.target.style.opacity = '0'; }}
                        />
                    </motion.div>
                </AnimatePresence>

                {/* Navigation Overlays (Common for both) */}
                {cameras.length > 1 && (
                    <>
                        <button
                            onClick={(e) => { e.stopPropagation(); prev(); }}
                            className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all backdrop-blur-sm ${!isExpandedVariant ? 'md:opacity-0 group-hover/carousel:opacity-100 p-1.5 opacity-100' : 'opacity-100 p-2.5'}`}
                        >
                            <ChevronLeft className={isExpandedVariant ? "w-6 h-6" : "w-4 h-4"} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); next(); }}
                            className={`absolute right-2 top-1/2 -translate-y-1/2 z-30 rounded-full bg-black/40 hover:bg-black/60 text-white transition-all backdrop-blur-sm ${!isExpandedVariant ? 'md:opacity-0 group-hover/carousel:opacity-100 p-1.5 opacity-100' : 'opacity-100 p-2.5'}`}
                        >
                            <ChevronRight className={isExpandedVariant ? "w-6 h-6" : "w-4 h-4"} />
                        </button>
                    </>
                )}
            </div>

            {/* Expanded Mode Informational Content (Below Image) */}
            {isExpandedVariant && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] animate-pulse" />
                                <h3 className="text-slate-900 dark:text-white text-base font-bold truncate" title={cameras[index].name}>
                                    {cameras[index].name}
                                </h3>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">
                                    {cameras[index].type || 'Trafikkamera'}
                                </span>
                                <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
                                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-bold uppercase">
                                    Vy {index + 1} av {cameras.length}
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                            <a
                                href={cameras[index].link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-all font-bold shadow-lg shadow-blue-500/20 active:scale-95"
                                onClick={e => e.stopPropagation()}
                            >
                                <Activity className="w-3.5 h-3.5" />
                                Fullstorlek
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default function EventFeed({ initialEventId, onClearInitialEvent, mode = 'realtid' }) {
    const [events, setEvents] = useState([])
    const [selectedEvent, setSelectedEvent] = useState(null)
    const [loading, setLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)
    const [expandedMaps, setExpandedMaps] = useState(new Set())
    const [expandedCameras, setExpandedCameras] = useState(new Set())

    const [activeMessageTypes, setActiveMessageTypes] = useState([])
    const [activeSeverities, setActiveSeverities] = useState([])
    const [activeCounties, setActiveCounties] = useState(() => {
        const saved = localStorage.getItem(`feed_filter_counties_${mode}`)
        return saved ? saved.split(',').filter(x => x).map(id => parseInt(id)) : []
    })
    const [monitoredCounties, setMonitoredCounties] = useState(() => {
        const saved = localStorage.getItem('localCounties')
        return saved ? saved.split(',').map(id => parseInt(id)) : []
    })
    const [showFilters, setShowFilters] = useState(false)
    const [activeTabs, setActiveTabs] = useState({}) // { eventId: 'current' | 'history' }
    const [eventHistory, setEventHistory] = useState({}) // { externalId: [] }
    const [fetchingHistory, setFetchingHistory] = useState({}) // { externalId: boolean }

    // Constants for Counties
    const COUNTIES = [
        { id: 1, name: 'Stockholm' },
        { id: 3, name: 'Uppsala' },
        { id: 4, name: 'Södermanland' },
        { id: 5, name: 'Östergötland' },
        { id: 6, name: 'Jönköping' },
        { id: 7, name: 'Kronoberg' },
        { id: 8, name: 'Kalmar' },
        { id: 9, name: 'Gotland' },
        { id: 10, name: 'Blekinge' },
        { id: 12, name: 'Skåne' },
        { id: 13, name: 'Halland' },
        { id: 14, name: 'Västra Götaland' },
        { id: 17, name: 'Värmland' },
        { id: 18, name: 'Örebro' },
        { id: 19, name: 'Västmanland' },
        { id: 20, name: 'Dalarna' },
        { id: 21, name: 'Gävleborg' },
        { id: 22, name: 'Västernorrland' },
        { id: 23, name: 'Jämtland' },
        { id: 24, name: 'Västerbotten' },
        { id: 25, name: 'Norrbotten' },
    ]

    const fetchHistory = async (externalId, eventId) => {
        if (eventHistory[externalId]) {
            setActiveTabs(prev => ({ ...prev, [eventId]: 'history' }))
            return
        }

        setFetchingHistory(prev => ({ ...prev, [externalId]: true }))
        try {
            const response = await axios.get(`${API_BASE}/events/${externalId}/history`)
            setEventHistory(prev => ({ ...prev, [externalId]: response.data }))
            setActiveTabs(prev => ({ ...prev, [eventId]: 'history' }))
        } catch (err) {
            console.error('Failed to fetch history:', err)
        } finally {
            setFetchingHistory(prev => ({ ...prev, [externalId]: false }))
        }
    }

    const toggleHistory = (eventId, externalId) => {
        if (activeTabs[eventId] === 'history') {
            setActiveTabs(prev => ({ ...prev, [eventId]: 'current' }))
        } else {
            fetchHistory(externalId, eventId)
        }
    }

    // Pagination state
    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [isFetchingMore, setIsFetchingMore] = useState(false)
    const observerTarget = React.useRef(null)
    const LIMIT = 20

    const toggleMap = (id) => {
        setExpandedMaps(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                // Close camera if map is opened
                setExpandedCameras(cp => {
                    const cn = new Set(cp)
                    cn.delete(id)
                    return cn
                })
            }
            return next
        })
    }

    const toggleCamera = (id) => {
        setExpandedCameras(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                // Close map if camera is opened
                setExpandedMaps(mp => {
                    const mn = new Set(mp)
                    mn.delete(id)
                    return mn
                })
            }
            return next
        })
    }

    const toggleMessageType = (type) => {
        setActiveMessageTypes(prev =>
            prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
        )
    }

    const toggleSeverity = (level) => {
        setActiveSeverities(prev =>
            prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
        )
    }

    const toggleCounty = (id) => {
        // Normalize Stockholm: treat 2 as 1
        const normalizedId = id === 2 ? 1 : id;
        setActiveCounties(prev => {
            const next = prev.includes(normalizedId) ? prev.filter(c => c !== normalizedId) : [...prev, normalizedId]
            localStorage.setItem(`feed_filter_counties_${mode}`, next.join(','))
            return next
        })
    }

    const clearFilters = () => {
        setActiveMessageTypes([])
        setActiveSeverities([])
        setActiveCounties([])
        localStorage.removeItem(`feed_filter_counties_${mode}`)
    }

    const activeFilterCount = activeMessageTypes.length + activeSeverities.length + activeCounties.length

    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            if (activeMessageTypes.length > 0) {
                const eventTypes = event.message_type ? event.message_type.split(', ') : []
                if (!activeMessageTypes.some(t => eventTypes.includes(t))) {
                    return false
                }
            }
            if (activeSeverities.length > 0 && !activeSeverities.includes(event.severity_text)) {
                return false
            }

            // County logic: Use quick filter (pills) if active, otherwise baseline (Min bevakning)
            // EXCEPTION: Always show National/Global events (county_no === 0)
            if (event.county_no === 0) {
                return true;
            }

            const effectiveCounties = activeCounties.length > 0
                ? activeCounties
                : monitoredCounties;

            if (effectiveCounties.length > 0 && !effectiveCounties.includes(event.county_no)) {
                return false
            }
            return true
        })
    }, [events, activeMessageTypes, activeSeverities, activeCounties, monitoredCounties])

    const fetchEvents = async (reset = false) => {
        try {
            const currentOffset = reset ? 0 : offset
            if (!reset) setIsFetchingMore(true)

            // Pass counties filter to backend if set, otherwise use monitoredCounties as baseline (Family Model)
            const effectiveCountiesForApi = activeCounties.length > 0 ? activeCounties : monitoredCounties
            const countyParam = effectiveCountiesForApi.length > 0 ? `&counties=${effectiveCountiesForApi.join(',')}` : ''
            const response = await axios.get(`${API_BASE}/events?limit=${LIMIT}&offset=${currentOffset}${countyParam}&type=${mode}`)
            const newEvents = response.data

            if (reset) {
                setEvents(newEvents)
                setOffset(LIMIT)
            } else {
                setEvents(prev => {
                    // Filter out duplicates based on ID
                    const existingIds = new Set(prev.map(e => e.id))
                    const uniqueNewEvents = newEvents.filter(e => !existingIds.has(e.id))
                    return [...prev, ...uniqueNewEvents]
                })
                setOffset(prev => prev + LIMIT)
            }

            setHasMore(newEvents.length === LIMIT)
            setLoading(false)
            setIsFetchingMore(false)
        } catch (error) {
            console.error('Failed to fetch events:', error)
            setLoading(false)
            setIsFetchingMore(false)
        }
    }



    useEffect(() => {
        const updateMonitored = () => {
            const saved = localStorage.getItem('localCounties')
            setMonitoredCounties(saved ? saved.split(',').map(id => parseInt(id)) : [])
        }
        window.addEventListener('storage', updateMonitored)
        window.addEventListener('focus', updateMonitored)
        return () => {
            window.removeEventListener('storage', updateMonitored)
            window.removeEventListener('focus', updateMonitored)
        }
    }, [])

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('EventFeed returned to foreground, triggering refresh...')
                setRefreshKey(prev => prev + 1)
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
    }, [])

    useEffect(() => {
        // eslint-disable-next-line
        fetchEvents(true) // Initial load and re-fetch on filter changes

        const handleTrafficEvent = (event) => {
            const newEvent = event.detail

            // STRICT SEPARATION: Ignore RoadConditions in the main feed
            if (newEvent.event_type === 'RoadCondition') return;

            setEvents(prev => {
                // Check if new event is already expired
                if (newEvent.end_time && new Date(newEvent.end_time) < new Date()) {
                    return prev;
                }

                // Check if event matches current mode
                const now = new Date();
                const start = new Date(newEvent.start_time);
                const end = newEvent.end_time ? new Date(newEvent.end_time) : null;
                const durationDays = end ? (end - start) / (1000 * 60 * 60 * 24) : 0;

                // Align with backend: Planned if (Future start > 1 min) OR (Long-term >= 5 days)
                const isPlanned = start > (new Date(now.getTime() + 60000)) || durationDays >= 5;

                if (mode === 'planned' && !isPlanned) return prev;
                if (mode === 'realtid' && isPlanned) return prev;

                const index = prev.findIndex(e => e.external_id === newEvent.external_id)
                let newEvents = [...prev]

                if (index !== -1) {
                    // Remove existing event so we can move it to top
                    newEvents.splice(index, 1)
                } else {
                    setOffset(o => o + 1)
                }

                // Add new/updated event to top
                return [newEvent, ...newEvents]
            })

            // Play sound if enabled
            if (localStorage.getItem('soundEnabled') === 'true') {
                const file = localStorage.getItem('soundFile') || 'chime1.mp3'
                const audio = new Audio(`/sounds/${file}`)
                audio.play().catch(e => console.error('Error playing sound:', e))
            }
        }

        window.addEventListener('flux-traffic-event', handleTrafficEvent)

        return () => {
            window.removeEventListener('flux-traffic-event', handleTrafficEvent)
        }
    }, [mode, activeCounties, activeMessageTypes, activeSeverities, refreshKey]) // Re-fetch when filters, mode, or visibility changes

    // Sync monitored counties from localStorage
    useEffect(() => {
        const handleStorageChange = () => {
            const saved = localStorage.getItem('localCounties')
            const ids = saved ? saved.split(',').map(id => parseInt(id)) : []
            setMonitoredCounties(ids)
        }
        window.addEventListener('storage', handleStorageChange)
        // Also check on focus
        window.addEventListener('focus', handleStorageChange)
        return () => {
            window.removeEventListener('storage', handleStorageChange)
            window.removeEventListener('focus', handleStorageChange)
        }
    }, [])

    useEffect(() => {
        // Handle deep linking from props
        if (initialEventId && events.length > 0) {
            const openDeepLink = async () => {
                // First check if we already have it in the feed
                const localMatch = events.find(e => e.external_id === initialEventId);
                if (localMatch) {
                    setSelectedEvent(localMatch);
                    if (onClearInitialEvent) onClearInitialEvent();
                    return;
                }

                // Otherwise fetch it directly from backend (might be an older händelse)
                try {
                    const response = await axios.get(`${API_BASE}/events`);
                    // The backend /api/events returns a list. Let's see if it's there.
                    const match = response.data.find(e => e.external_id === initialEventId);
                    if (match) {
                        setSelectedEvent(match);
                        if (onClearInitialEvent) onClearInitialEvent();
                    } else {
                        console.warn('Deep link event not found in current feed');
                        // Optional: Clear if not found to avoid infinite retry if we ever add more deps
                        if (onClearInitialEvent) onClearInitialEvent();
                    }
                } catch (err) {
                    console.error('Failed to resolve deep link:', err);
                }
            };
            openDeepLink();
        }
    }, [initialEventId, events, onClearInitialEvent]);

    // Automatic Cleanup of expired events
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            const now = new Date()
            setEvents(prev => {
                const expiredIds = prev
                    .filter(e => e.end_time && new Date(e.end_time) < now)
                    .map(e => e.id)

                if (expiredIds.length > 0) {
                    console.log(`Cleaning up ${expiredIds.length} expired events`)
                    return prev.filter(e => !expiredIds.includes(e.id))
                }
                return prev
            })
        }, 60000) // Every minute

        return () => clearInterval(cleanupInterval)
    }, [])

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !isFetchingMore && !loading) {
                    fetchEvents(false)
                }
            },
            { threshold: 1.0 }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current)
            }
        }
    }, [hasMore, isFetchingMore, loading, offset])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 animate-pulse">Hämtar senaste väghändelserna...</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-600/20">
                        {mode === 'planned' ? <Calendar className="w-6 h-6 text-white" /> : <Activity className="w-6 h-6 text-white" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                            {mode === 'planned' ? 'Planerat' : 'Realtid'}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {mode === 'planned' ? 'Kommande och långvariga händelser' : 'Trafikhändelser i realtid'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Filter Toggle */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 transition-all ${showFilters || activeFilterCount > 0
                            ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                            }`}
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Filter
                        {activeFilterCount > 0 && (
                            <span className="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                </div>
            </div>

            {/* Filter Bar */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4">
                            {/* Message Type Filter */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Meddelandetyp</label>
                                <div className="flex flex-wrap gap-2">
                                    {MESSAGE_TYPES.map(type => (
                                        <button
                                            key={type}
                                            onClick={() => toggleMessageType(type)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeMessageTypes.includes(type)
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                                                }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Severity Filter */}
                            <div>
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Påverkan</label>
                                <div className="flex flex-wrap gap-2">
                                    {SEVERITY_LEVELS.map(level => (
                                        <button
                                            key={level}
                                            onClick={() => toggleSeverity(level)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeSeverities.includes(level)
                                                ? SEVERITY_COLORS[level] + ' ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-slate-900'
                                                : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                                                }`}
                                        >
                                            {level}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* County Filter */}
                            {monitoredCounties.length > 0 && (
                                <div>
                                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Län (Dina bevakade)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {COUNTIES.filter(c => monitoredCounties.includes(c.id)).map(county => (
                                            <button
                                                key={county.id}
                                                onClick={() => toggleCounty(county.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeCounties.includes(county.id)
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                                    : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-500'
                                                    }`}
                                            >
                                                {county.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Active Filters Summary */}
                            {activeFilterCount > 0 && (
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <span className="text-xs text-slate-500">
                                        Visar {filteredEvents.length} av {events.length} händelser
                                    </span>
                                    <button
                                        onClick={clearFilters}
                                        className="text-xs text-red-500 hover:text-red-600 font-medium flex items-center gap-1 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                        Rensa filter
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid gap-4">
                <AnimatePresence initial={false}>
                    {filteredEvents.length === 0 && !loading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-20 bg-slate-50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800"
                        >
                            <AlertCircle className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
                            <h3 className="text-lg font-medium text-slate-900 dark:text-white">Inga händelser hittades</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-xs text-center mt-2">
                                Prova att ändra dina filter eller välj fler län i inställningarna.
                            </p>
                            {(activeFilterCount > 0) && (
                                <button
                                    onClick={clearFilters}
                                    className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                    Nollställ filter
                                </button>
                            )}
                        </motion.div>
                    )}
                    {filteredEvents.map((event) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -100 }}
                            className={`bg-white dark:bg-slate-800/50 border p-4 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-all group relative overflow-hidden shadow-sm dark:shadow-none border-l-4 ${SEVERITY_CARD_BORDERS[event.severity_text] || 'border-slate-200 dark:border-slate-700'} ${SEVERITY_ACCENT_COLORS[event.severity_text] || 'border-l-slate-200'} ${SEVERITY_BG_TINTS[event.severity_text] || ''}`}
                        >
                            {/* Severe Event Pulsing Border Overlay */}
                            {event.severity_text === 'Mycket stor påverkan' && (
                                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] z-10 animate-pulse"></div>
                            )}

                            {/* Update Flash Animation */}
                            {event.updated_at && event.updated_at !== event.created_at && (
                                <motion.div
                                    initial={{ opacity: 0.5 }}
                                    animate={{ opacity: 0 }}
                                    transition={{ duration: 2 }}
                                    className="absolute inset-0 bg-yellow-400/20 dark:bg-yellow-500/10 pointer-events-none z-0"
                                />
                            )}

                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 space-y-4">
                                    <div className="flex-1 space-y-2">
                                        {/* Primary Metadata (Row 1) */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-full mr-1">
                                                <button
                                                    onClick={() => setActiveTabs(prev => ({ ...prev, [event.id]: 'current' }))}
                                                    className={`p-1.5 rounded-full transition-all ${(!activeTabs[event.id] || activeTabs[event.id] === 'current')
                                                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                                        }`}
                                                    title="Händelsen nu"
                                                >
                                                    <Info className="w-4 h-4" />
                                                </button>
                                            </div>

                                            {/* Road Number Badge (Preserved Style) */}
                                            {event.road_number && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded border shadow-sm flex items-center justify-center min-w-[30px] ${event.road_number.startsWith('E')
                                                    ? 'bg-[#00933C] text-white border-white border-[1.5px] shadow' // Europaväg styling
                                                    : 'bg-[#006AA7] text-white border-white border-[1.5px] border-dotted' // Riksväg/Länsväg styling
                                                    }`}>
                                                    {event.road_number.replace(/^Väg\s+/, '')}
                                                </span>
                                            )}

                                            {/* Severity Badge */}
                                            {event.severity_text && (
                                                <span className={`text-[10px] uppercase font-bold px-3 py-0.5 rounded-full border ${SEVERITY_COLORS[event.severity_text] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                                    {event.severity_text}
                                                </span>
                                            )}

                                            <span className="text-slate-500 text-xs flex items-center gap-1 ml-auto"
                                                title={event.updated_at && event.updated_at !== event.created_at ? `Uppdaterad: ${safeFormat(event.updated_at, 'yyyy-MM-dd HH:mm')}` : `Skapad: ${safeFormat(event.created_at, 'yyyy-MM-dd HH:mm')}`}>
                                                <Clock className="w-3 h-3" />
                                                {event.updated_at && event.updated_at !== event.created_at ? (
                                                    <span className="font-semibold text-blue-600 dark:text-blue-400">
                                                        {safeFormat(event.updated_at, 'HH:mm')}
                                                    </span>
                                                ) : (
                                                    <span>{safeFormat(event.created_at, 'HH:mm')}</span>
                                                )}
                                            </span>
                                        </div>

                                        {/* Supplemental Metadata (Row 2) - hidden on mobile */}
                                        <div className="hidden sm:flex flex-wrap items-center gap-1.5 ml-1">
                                            {/* Long-term / Upcoming Badge */}
                                            {(() => {
                                                const now = new Date();
                                                const start = new Date(event.start_time);
                                                const end = event.end_time ? new Date(event.end_time) : null;
                                                const durationDays = end ? (end - start) / (1000 * 60 * 60 * 24) : 0;
                                                // Simplified badge logic matching the tab separation
                                                if (start > (new Date(now.getTime() + 60000))) return (
                                                    <span className="bg-purple-50 dark:bg-purple-500/5 text-purple-600 dark:text-purple-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-purple-200/50 dark:border-purple-500/20">
                                                        Kommande
                                                    </span>
                                                );
                                                if (durationDays >= 5) return (
                                                    <span className="bg-indigo-50 dark:bg-indigo-500/5 text-indigo-600 dark:text-indigo-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-indigo-200/50 dark:border-indigo-500/20">
                                                        Långtidsarbete
                                                    </span>
                                                );
                                                return null;
                                            })()}

                                            {/* Message Type Badges */}
                                            {event.message_type && event.message_type.split(', ').map((type, idx) => (
                                                <span key={idx} className="bg-blue-50 dark:bg-blue-500/5 text-blue-600 dark:text-blue-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-blue-200/50 dark:border-blue-500/20">
                                                    {type}
                                                </span>
                                            ))}

                                            {/* Restriction Badges */}
                                            {event.temporary_limit && (
                                                <span className="bg-red-50 dark:bg-red-500/5 text-red-600 dark:text-red-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-red-200/50 dark:border-red-500/20">
                                                    {event.temporary_limit}
                                                </span>
                                            )}
                                            {event.traffic_restriction_type && event.traffic_restriction_type.split(', ').map((restr, idx) => (
                                                <span key={idx} className="bg-orange-50 dark:bg-orange-500/5 text-orange-600 dark:text-orange-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-orange-200/50 dark:border-orange-500/20">
                                                    {restr}
                                                </span>
                                            ))}

                                            {/* County Name */}
                                            {event.county_no && (
                                                <span className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                                                    {COUNTIES.find(c => c.id === event.county_no)?.name || `Län ${event.county_no}`}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {(!activeTabs[event.id] || activeTabs[event.id] === 'current') ? (
                                        <div className="space-y-4">
                                            <div className="flex items-start gap-2">
                                                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                                                <span className="font-semibold text-slate-900 dark:text-white text-base">{(event.location || 'Platsinformation saknas').replace(/\s+i\s+(?:(?!\s+i\s+).)*?\s+län\s+\([A-Z]+\)\s*$/i, '')}</span>
                                            </div>

                                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2">
                                                {event.icon_url && <img src={event.icon_url} alt="Icon" className="w-8 h-8 object-contain" />}
                                                {event.title || 'Okänd händelse'}
                                            </h3>

                                            <div className="space-y-2">

                                                {event.description && (
                                                    <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700/50">
                                                        <Info className="w-4 h-4 mt-1 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                                                        <div className="space-y-2">
                                                            {event.description.split(' | ').map((desc, idx) => (
                                                                <p key={idx}>{desc}</p>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Validity Period + Weather */}
                                                {(event.start_time || event.end_time || event.weather) && (
                                                    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-slate-500 mt-1">
                                                        {(event.start_time || event.end_time) && (
                                                            <>
                                                                <span>Gäller:</span>
                                                                {event.start_time && <span className="text-slate-700 dark:text-slate-400">{safeFormat(event.start_time, 'd MMM HH:mm')}</span>}
                                                                <span>→</span>
                                                                {event.end_time ? (
                                                                    <span className="text-slate-700 dark:text-slate-400">{safeFormat(event.end_time, 'd MMM HH:mm')}</span>
                                                                ) : (
                                                                    <span className="italic">Tillsvidare</span>
                                                                )}
                                                            </>
                                                        )}
                                                        {event.weather && (
                                                            <>
                                                                {(event.start_time || event.end_time) && <span className="text-slate-300 dark:text-slate-600">·</span>}
                                                                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                                                    <Thermometer className="w-3 h-3" />
                                                                    <span className="font-semibold">{(event.weather.air_temperature ?? event.weather.temp) ?? '?'}°C</span>
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Wind className="w-3 h-3" />
                                                                    <span>{event.weather.wind_speed ?? '?'} m/s {(event.weather.wind_direction ?? event.weather.wind_dir) ?? ''}</span>
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-4 py-2">
                                            {eventHistory[event.external_id]?.length > 0 ? (
                                                <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                                                    {eventHistory[event.external_id].map((version, vidx) => (
                                                        <div key={vidx} className="relative">
                                                            <div className="absolute -left-[24px] top-1.5 w-[13px] h-[13px] rounded-full bg-blue-500 border-2 border-white dark:border-slate-800 z-10 shadow-sm"></div>
                                                            <div className="space-y-1">
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                                        Uppdatering {safeFormat(version.version_timestamp, 'd MMM HH:mm:ss')}
                                                                    </span>
                                                                    {version.severity_text && (
                                                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${SEVERITY_COLORS[version.severity_text] || ''}`}>
                                                                            {version.severity_text}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                                                    {version.icon_url && <img src={version.icon_url} alt="" className="w-5 h-5" />}
                                                                    {version.title}
                                                                </p>
                                                                {version.location && (
                                                                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ml-1">
                                                                        <MapPin className="w-3 h-3" />
                                                                        <span>{version.location}</span>
                                                                    </div>
                                                                )}
                                                                <div className="mt-2 text-sm text-slate-700 dark:text-slate-300 bg-slate-100/50 dark:bg-slate-900/50 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-800/50">
                                                                    {version.description?.split(' | ').map((d, i) => <p key={i} className="leading-relaxed">{d}</p>)}

                                                                    {version.camera_snapshot && (
                                                                        <div className="mt-3 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video max-w-sm">
                                                                            <img
                                                                                src={`/api/snapshots/${version.camera_snapshot}`}
                                                                                alt="Historisk bild"
                                                                                className="w-full h-full object-cover cursor-zoom-in"
                                                                                onClick={() => window.open(`/api/snapshots/${version.camera_snapshot}`, '_blank')}
                                                                            />
                                                                            <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm px-2 py-1 text-[8px] text-white flex items-center gap-1">
                                                                                <Camera className="w-2 h-2" />
                                                                                <span>Bild från denna tidpunkt</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <div className="text-[10px] text-slate-400 italic pt-2">
                                                        * Endast ändringar sparas i historiken
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-center py-8 px-4 bg-slate-50 dark:bg-slate-900/20 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
                                                    <HistoryIcon className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-700 opacity-50" />
                                                    <p className="text-slate-500 text-sm font-medium">Ingen historik än</p>
                                                    <p className="text-slate-400 text-xs mt-1">
                                                        Denna händelse är ny och har inte uppdaterats sedan den först rapporterades.
                                                        Historik sparas så fort informationen ändras.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col justify-start items-stretch gap-3 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-700/50 pt-4 lg:pt-0 lg:pl-6 max-w-full">
                                    <div className="flex flex-row gap-2 w-full lg:w-auto mt-1 lg:mt-0 flex-shrink-0">
                                        {/* Camera Slot (Always visible) */}
                                        <div
                                            className={`relative w-1/2 lg:w-48 h-24 sm:h-32 rounded-lg overflow-hidden border transition-all duration-300 group/camera flex items-center justify-center flex-shrink-0 ${expandedCameras.has(event.id) ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50 dark:bg-blue-500/10' : 'bg-slate-200 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                                        >
                                            {/* Mobile Carousel View */}
                                            <div className="md:hidden w-full h-full">
                                                <CameraCarousel
                                                    cameras={[
                                                        ...(event.camera_snapshot ? [{ snapshot: event.camera_snapshot, name: event.camera_name }] : []),
                                                        ...(event.extra_cameras?.filter(c => c.snapshot) || [])
                                                    ]}
                                                    onExpand={() => toggleCamera(event.id)}
                                                    isExpanded={expandedCameras.has(event.id)}
                                                />
                                            </div>

                                            {/* Desktop Static View */}
                                            <div
                                                className="hidden md:block w-full h-full cursor-zoom-in relative"
                                                onClick={(e) => {
                                                    if (event.camera_url || event.camera_snapshot) {
                                                        e.stopPropagation();
                                                        toggleCamera(event.id)
                                                    }
                                                }}
                                            >
                                                {event.camera_snapshot ? (
                                                    <img
                                                        src={`/api/snapshots/${event.camera_snapshot}`}
                                                        alt={event.camera_name || 'Trafikkamera'}
                                                        className="w-full h-full object-cover group-hover/camera:scale-105 transition-transform duration-500 z-10"
                                                        onError={(e) => {
                                                            e.target.style.opacity = '0';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 z-0">
                                                        <Camera className="w-8 h-8 mb-1 opacity-20" />
                                                        <span className="text-[10px] italic">Ingen bild</span>
                                                    </div>
                                                )}

                                                {/* Camera Name Overlay */}
                                                {event.camera_name && (
                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-[10px] text-white px-2 py-1 z-20">
                                                        <div className="flex items-center gap-1 truncate">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                            <span className="truncate">{event.camera_name}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Extra Cameras Badge (Top Right) */}
                                                {(() => {
                                                    const validExtras = event.extra_cameras?.filter(c => c.snapshot) || [];
                                                    if (validExtras.length === 0) return null;
                                                    return (
                                                        <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5 bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-lg backdrop-blur-sm border border-white/20">
                                                            <Camera className="w-3 h-3" />
                                                            <span>+{validExtras.length}</span>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>

                                        {/* Map / Location Preview */}
                                        {event.latitude && event.longitude ? (
                                            <div
                                                className={`relative w-1/2 lg:w-48 h-24 sm:h-32 rounded-lg overflow-hidden border transition-all duration-300 group/map cursor-pointer ${expandedMaps.has(event.id) ? 'border-blue-500 ring-2 ring-blue-500/20' : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleMap(event.id)
                                                }}
                                            >
                                                <EventMap
                                                    lat={event.latitude}
                                                    lng={event.longitude}
                                                    popupContent={event.location}
                                                    interactive={false}
                                                />

                                                {/* Overlay hint (Desktop only or hover) */}
                                                <div className="absolute inset-0 bg-black/5 group-hover/map:bg-black/10 transition-colors pointer-events-none flex items-center justify-center opacity-0 group-hover/map:opacity-100">
                                                    <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                                                        Förstora
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            /* No Location Placeholder */
                                            <div className="w-1/2 lg:w-48 h-24 sm:h-32 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                                                <MapPin className="w-4 h-4 text-slate-300 dark:text-slate-600 mb-1" />
                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 italic">Ingen plats</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Custom Update Pill / History Toggle - Placed below Camera/Map */}
                                    {event.history_count > 0 && (
                                        <motion.button
                                            whileHover={{ scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleHistory(event.id, event.external_id);
                                            }}
                                            className={`mt-2 py-1.5 px-3 rounded-xl border transition-all relative overflow-hidden group/pill ${activeTabs[event.id] === 'history'
                                                ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                                                : 'bg-blue-50/50 dark:bg-blue-500/5 text-blue-600 dark:text-blue-400 border-blue-200/50 dark:border-blue-500/20 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                                                }`}
                                        >
                                            {/* Fading Arrow Animation Overlay */}
                                            <div className="absolute inset-0 flex items-center justify-around pointer-events-none opacity-20">
                                                {[0, 1, 2, 3, 4].map((i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{
                                                            opacity: [0, 1, 0],
                                                            x: [-10, 10],
                                                        }}
                                                        transition={{
                                                            duration: 2,
                                                            repeat: Infinity,
                                                            delay: i * 0.4,
                                                            ease: "easeInOut"
                                                        }}
                                                    >
                                                        <ChevronRight className="w-4 h-4" />
                                                    </motion.div>
                                                ))}
                                            </div>

                                            <div className="relative z-10 flex items-center justify-between w-full">
                                                <div className="flex items-center gap-3">
                                                    <HistoryIcon className={`w-3.5 h-3.5 ${activeTabs[event.id] === 'history' ? 'animate-pulse' : ''}`} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">Uppdaterad</span>
                                                </div>
                                                <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-colors ${activeTabs[event.id] === 'history'
                                                    ? 'bg-blue-500/50 text-white'
                                                    : 'bg-blue-100 dark:bg-blue-400/20 text-blue-700 dark:text-blue-300'
                                                    }`}>
                                                    {event.history_count} {event.history_count === 1 ? 'ändring' : 'ändringar'}
                                                </div>
                                            </div>
                                        </motion.button>
                                    )}
                                </div>
                            </div>

                            {/* Expanded Views (Camera / Map) */}
                            <AnimatePresence>
                                {expandedCameras.has(event.id) && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg bg-slate-100/50 dark:bg-black/20"
                                    >
                                        <div className="p-4 space-y-4" onClick={e => e.stopPropagation()}>
                                            {/* Unified Image Grid */}
                                            {(() => {
                                                const allImages = [];
                                                if (event.camera_snapshot) {
                                                    allImages.push({
                                                        src: `/api/snapshots/${event.camera_snapshot}`,
                                                        name: event.camera_name,
                                                        type: 'Primär vy',
                                                        link: `/api/snapshots/${event.camera_snapshot}`
                                                    });
                                                }
                                                if (event.extra_cameras) {
                                                    event.extra_cameras.forEach(extra => {
                                                        if (extra.snapshot) {
                                                            allImages.push({
                                                                src: `/api/snapshots/${extra.snapshot}`,
                                                                name: extra.name,
                                                                type: 'Alternativ vy',
                                                                link: `/api/snapshots/${extra.snapshot}`
                                                            });
                                                        }
                                                    });
                                                }

                                                if (allImages.length === 0) return (
                                                    <div className="text-center py-8 text-slate-400">Inga bilder tillgängliga</div>
                                                );

                                                return (
                                                    <div className="space-y-4">
                                                        {/* Mobile Expanded Carousel */}
                                                        <div className="md:hidden">
                                                            <CameraCarousel
                                                                cameras={allImages}
                                                                variant="expanded"
                                                                onExpand={() => toggleCamera(event.id)}
                                                                isExpanded={true}
                                                            />
                                                        </div>

                                                        {/* Desktop Expanded Grid (Reverted) */}
                                                        <div className="hidden md:grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {allImages.map((img, idx) => {
                                                                const isThreeImages = allImages.length === 3;
                                                                const isFirstOfThree = isThreeImages && idx === 0;

                                                                return (
                                                                    <div
                                                                        key={idx}
                                                                        className={`relative group/expanded rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/5 flex flex-col ${isFirstOfThree ? 'md:col-span-2' : ''}`}
                                                                    >
                                                                        <div className="relative aspect-video bg-slate-900">
                                                                            <img
                                                                                src={img.src}
                                                                                alt={img.name}
                                                                                className="w-full h-full object-contain"
                                                                                loading="lazy"
                                                                                onError={(e) => {
                                                                                    e.target.style.opacity = '0';
                                                                                }}
                                                                            />
                                                                        </div>
                                                                        <div className="bg-white/90 dark:bg-black/80 backdrop-blur-md p-3 border-t border-slate-200 dark:border-white/10">
                                                                            <div className="flex justify-between items-center gap-2">
                                                                                <div className="min-w-0">
                                                                                    <h3 className="text-slate-900 dark:text-white text-sm font-semibold truncate" title={img.name}>{img.name}</h3>
                                                                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">{img.type}</p>
                                                                                </div>
                                                                                <a
                                                                                    href={img.link}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="shrink-0 text-[10px] bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 px-2.5 py-1.5 rounded transition-colors text-slate-700 dark:text-slate-300 font-medium"
                                                                                >
                                                                                    Visa fullstorlek
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            <button
                                                onClick={() => toggleCamera(event.id)}
                                                className="w-full py-3 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2"
                                            >
                                                <X className="w-4 h-4" /> Stäng kameravyer
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {expandedMaps.has(event.id) && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 350 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg"
                                    >
                                        <div className="h-full relative" onClick={e => e.stopPropagation()}>
                                            <EventMap
                                                lat={event.latitude}
                                                lng={event.longitude}
                                                popupContent={event.location}
                                                interactive={true}
                                            />
                                            <button
                                                onClick={() => toggleMap(event.id)}
                                                className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors z-[1000]"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Loading sentinel */}
                <div ref={observerTarget} className="h-10 flex items-center justify-center mt-4">
                    {isFetchingMore && (
                        <div className="flex items-center gap-2 text-slate-400">
                            <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm">Laddar fler händelser...</span>
                        </div>
                    )}
                    {!hasMore && events.length > 0 && (
                        <span className="text-xs text-slate-400">Inga fler händelser att visa</span>
                    )}
                </div>

                {
                    events.length === 0 && !loading && (
                        <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                            <AlertTriangle className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                            <p className="text-slate-500">Inga aktiva händelser hittades för tillfället.</p>
                        </div>
                    )
                }
            </div >

            {/* Event Modal for detailed view (used for deep linking and general interaction) */}
            <EventModal
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
            />
        </div >
    )
}
