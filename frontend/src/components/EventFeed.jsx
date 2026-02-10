import React, { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { MapPin, Info, AlertTriangle, Clock, Filter, X } from 'lucide-react'
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion'
import EventMap from './EventMap'

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

export default function EventFeed() {
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(true)
    const [isConnected, setIsConnected] = useState(false)
    const [expandedMaps, setExpandedMaps] = useState(new Set())

    const [activeMessageTypes, setActiveMessageTypes] = useState([])
    const [activeSeverities, setActiveSeverities] = useState([])
    const [showFilters, setShowFilters] = useState(false)

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
            else next.add(id)
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

    const clearFilters = () => {
        setActiveMessageTypes([])
        setActiveSeverities([])
    }

    const activeFilterCount = activeMessageTypes.length + activeSeverities.length

    const filteredEvents = useMemo(() => {
        return events.filter(event => {
            if (activeMessageTypes.length > 0 && !activeMessageTypes.includes(event.message_type)) {
                return false
            }
            if (activeSeverities.length > 0 && !activeSeverities.includes(event.severity_text)) {
                return false
            }
            return true
        })
    }, [events, activeMessageTypes, activeSeverities])

    const fetchEvents = async (reset = false) => {
        try {
            const currentOffset = reset ? 0 : offset
            if (!reset) setIsFetchingMore(true)

            const response = await axios.get(`${API_BASE}/events?limit=${LIMIT}&offset=${currentOffset}`)
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
            console.error('Error fetching events:', error)
            setLoading(false)
            setIsFetchingMore(false)
        }
    }

    useEffect(() => {
        // eslint-disable-next-line
        fetchEvents(true) // Initial load with reset

        const eventSource = new EventSource(`${API_BASE}/stream`)

        eventSource.onopen = () => {
            setIsConnected(true)
        }

        eventSource.onmessage = (event) => {
            try {
                const newEvent = JSON.parse(event.data)
                // Add new event to top and increment offset so we don't load a duplicate at the bottom
                setEvents(prev => [newEvent, ...prev])
                setOffset(prev => prev + 1)

                // Play sound if enabled
                if (localStorage.getItem('soundEnabled') === 'true') {
                    const file = localStorage.getItem('soundFile') || 'chime1.mp3'
                    const audio = new Audio(`/sounds/${file}`)
                    audio.play().catch(e => console.error('Error playing sound:', e))
                }
            } catch (err) {
                console.error('Error parsing SSE event:', err)
            }
        }

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err)
            setIsConnected(false)
            eventSource.close()
        }

        return () => {
            eventSource.close()
        }
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
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Realtidsflöde</h2>
                    <p className="text-slate-500 dark:text-slate-400">Aktuella händelser på de svenska vägarna</p>
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

                    {/* Live Status */}
                    <div className={`px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-2 ${isConnected
                        ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                        }`}>
                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-500 dark:bg-blue-400 animate-pulse' : 'bg-red-500 dark:bg-red-400'}`}></span>
                        {isConnected ? 'LIVE STREAM' : 'OFFLINE'}
                    </div>
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
                    {filteredEvents.map((event) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -100 }}
                            className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 rounded-xl hover:border-slate-300 dark:hover:border-slate-600 transition-all group relative overflow-hidden shadow-sm dark:shadow-none"
                        >
                            {/* Severe Event Border */
                                event.severity_code >= 4 && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] z-10 animate-pulse"></div>
                                )}

                            {/* Standard Border (if not severe) */}
                            {(!event.severity_code || event.severity_code < 4) && (
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${event.severity_code === 2 ? 'bg-yellow-500' : 'bg-blue-500'} 
                                    shadow-[0_0_10px_rgba(59,130,246,0.5)]`}></div>
                            )}

                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                                            {event.external_id}
                                        </span>

                                        {/* Road Number Badge */}
                                        {event.road_number && (
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded border shadow-sm ${event.road_number.startsWith('Väg')
                                                ? 'bg-blue-600 text-white border-blue-700'
                                                : event.road_number.startsWith('E')
                                                    ? 'bg-green-600 text-white border-green-700'
                                                    : 'bg-yellow-500 text-black border-yellow-600'
                                                }`}>
                                                {event.road_number}
                                            </span>
                                        )}

                                        {/* Message Type Badge */}
                                        {event.message_type && (
                                            <span className="bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-blue-200 dark:border-blue-500/20">
                                                {event.message_type}
                                            </span>
                                        )}

                                        {/* Restriction Badges */}
                                        {event.temporary_limit && (
                                            <span className="bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-red-200 dark:border-red-500/20">
                                                {event.temporary_limit}
                                            </span>
                                        )}
                                        {event.traffic_restriction_type && (
                                            <span className="bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-orange-200 dark:border-orange-500/20">
                                                {event.traffic_restriction_type}
                                            </span>
                                        )}

                                        <span className="text-slate-500 text-xs flex items-center gap-1 ml-auto">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(event.created_at), 'HH:mm')}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-2">
                                        {event.icon_url && <img src={event.icon_url} alt="Icon" className="w-8 h-8 object-contain" />}
                                        {event.title || 'Okänd händelse'}
                                    </h3>

                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2 text-slate-500 dark:text-slate-400 text-sm">
                                            <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                                            <span className="font-medium text-slate-700 dark:text-slate-300">{event.location || 'Platsinformation saknas'}</span>
                                        </div>

                                        {event.description && (
                                            <div className="flex items-start gap-2 text-slate-600 dark:text-slate-300 text-sm leading-relaxed p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700/50">
                                                <Info className="w-4 h-4 mt-1 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                                                <div className="space-y-1">
                                                    <p>{event.description}</p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Validity Period */}
                                        {(event.start_time || event.end_time) && (
                                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                                <span>Gäller:</span>
                                                {event.start_time && <span className="text-slate-700 dark:text-slate-400">{format(new Date(event.start_time), 'd MMM HH:mm')}</span>}
                                                <span>→</span>
                                                {event.end_time ? (
                                                    <span className="text-slate-700 dark:text-slate-400">{format(new Date(event.end_time), 'd MMM HH:mm')}</span>
                                                ) : (
                                                    <span className="italic">Tillsvidare</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex md:flex-col justify-between md:justify-start items-center md:items-end gap-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700/50 pt-4 md:pt-0 md:pl-6 min-w-[140px]">

                                    <div className="flex flex-col gap-2 w-full md:w-48 mt-4 md:mt-0">
                                        {/* Map / Location Preview */}
                                        {event.latitude && event.longitude ? (
                                            <div
                                                className="relative h-20 w-full bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 group/map cursor-pointer"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    toggleMap(event.id)
                                                }}
                                            >
                                                <EventMap
                                                    lat={event.latitude}
                                                    lng={event.longitude}
                                                    interactive={false}
                                                />

                                                {/* Hover Overlay */}
                                                <div className="absolute inset-0 bg-black/5 group-hover/map:bg-black/10 transition-colors pointer-events-none flex items-center justify-center opacity-0 group-hover/map:opacity-100">
                                                    <span className="text-xs font-bold text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                                                        Klicka för att förstora
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            /* No Location Placeholder */
                                            <div className="h-20 w-full bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                                                <MapPin className="w-6 h-6 text-slate-300 dark:text-slate-600 mb-1" />
                                                <span className="text-xs text-slate-400 dark:text-slate-500 italic">Plats ej känd</span>
                                            </div>
                                        )}


                                    </div>
                                </div>
                            </div>

                            {/* Expanded Interactive Map (Full Width) */}
                            <AnimatePresence>
                                {expandedMaps.has(event.id) && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 300 }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner"
                                    >
                                        <div className="h-full" onClick={e => e.stopPropagation()}>
                                            <EventMap
                                                lat={event.latitude}
                                                lng={event.longitude}
                                                popupContent={event.location}
                                                interactive={true}
                                            />
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

                {events.length === 0 && !loading && (
                    <div className="text-center py-20 bg-slate-50 dark:bg-slate-800/30 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700">
                        <AlertTriangle className="w-10 h-10 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500">Inga aktiva händelser hittades för tillfället.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
