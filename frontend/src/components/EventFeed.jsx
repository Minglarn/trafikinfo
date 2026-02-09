import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { MapPin, Info, AlertTriangle, Share2, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const API_BASE = '/api'

export default function EventFeed() {
    const [events, setEvents] = useState([])
    const [loading, setLoading] = useState(true)

    const [isConnected, setIsConnected] = useState(false)

    const fetchEvents = async () => {
        try {
            const response = await axios.get(`${API_BASE}/events`)
            setEvents(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching events:', error)
        }
    }

    useEffect(() => {
        fetchEvents()

        const eventSource = new EventSource(`${API_BASE}/stream`)

        eventSource.onopen = () => {
            setIsConnected(true)
        }

        eventSource.onmessage = (event) => {
            try {
                const newEvent = JSON.parse(event.data)
                setEvents(prev => [newEvent, ...prev])
            } catch (err) {
                console.error('Error parsing SSE event:', err)
            }
        }

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err)
            setIsConnected(false)
            eventSource.close()
            // Simple retry logic could be added here, but EventSource usually retries automatically
        }

        return () => {
            eventSource.close()
        }
    }, [])

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
                    <h2 className="text-2xl font-bold text-white">Realtidsflöde</h2>
                    <p className="text-slate-400">Aktuella händelser på de svenska vägarna</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-2 ${isConnected
                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-blue-400 animate-pulse' : 'bg-red-400'}`}></span>
                    {isConnected ? 'LIVE STREAM' : 'OFFLINE'}
                </div>
            </div>

            <div className="grid gap-4">
                <AnimatePresence initial={false}>
                    {events.map((event) => (
                        <motion.div
                            key={event.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -100 }}
                            className="bg-slate-800/50 border border-slate-700 p-5 rounded-2xl hover:border-slate-600 transition-all group relative overflow-hidden"
                        >
                            {/* Vertical Accent */}
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>

                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <span className="bg-blue-500/10 text-blue-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-blue-500/20">
                                            {event.external_id}
                                        </span>
                                        <span className="text-slate-500 text-xs flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {format(new Date(event.created_at), 'HH:mm:ss')}
                                        </span>
                                    </div>

                                    <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors flex items-center gap-2">
                                        {event.icon_url && <img src={event.icon_url} alt="Icon" className="w-6 h-6 object-contain" />}
                                        {event.title || 'Okänd händelse'}
                                    </h3>

                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2 text-slate-400 text-sm">
                                            <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-slate-500" />
                                            <span>{event.location || 'Platsinformation saknas'}</span>
                                        </div>
                                        <div className="flex items-start gap-2 text-slate-300 text-sm leading-relaxed">
                                            <Info className="w-4 h-4 mt-1 flex-shrink-0 text-slate-500" />
                                            <span>{event.description}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex md:flex-col justify-between md:justify-start items-center md:items-end gap-4 border-t md:border-t-0 md:border-l border-slate-700/50 pt-4 md:pt-0 md:pl-6">
                                    <div className="flex flex-col items-center md:items-end">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 mb-1">MQTT Status</span>
                                        {event.pushed_to_mqtt ? (
                                            <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-green-400"></span>
                                                Pushed
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                                Pending
                                            </div>
                                        )}
                                    </div>

                                    <button className="flex items-center gap-2 bg-slate-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
                                        <Share2 className="w-4 h-4" />
                                        Push manuellt
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {events.length === 0 && (
                    <div className="text-center py-20 bg-slate-800/30 rounded-3xl border border-dashed border-slate-700">
                        <AlertTriangle className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500">Inga aktiva händelser hittades för tillfället.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
