import React, { useState, useEffect } from 'react'
import { X, MapPin, Info, Clock, AlertTriangle, ShieldCheck, Activity, Camera, History as HistoryIcon, Thermometer, Wind } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import axios from 'axios'
import EventMap from './EventMap'

export default function EventModal({ event, onClose }) {
    const [showFullImage, setShowFullImage] = useState(false)
    const [activeTab, setActiveTab] = useState('info')
    const [history, setHistory] = useState([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (showFullImage) setShowFullImage(false)
                else onClose()
            }
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose, showFullImage])

    if (!event) return null

    const fetchHistory = async () => {
        if (history.length > 0) {
            setActiveTab('history')
            return
        }
        setLoadingHistory(true)
        try {
            const response = await axios.get(`/api/events/${event.external_id}/history`)
            setHistory(response.data)
            setActiveTab('history')
        } catch (err) {
            console.error('Failed to fetch history:', err)
        } finally {
            setLoadingHistory(false)
        }
    }

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 text-slate-900 dark:text-white">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 dark:bg-slate-900/80 backdrop-blur-sm"
                />

                {/* Modal Content */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-4xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-700"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                            {event.icon_url && (
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex-shrink-0">
                                    <img src={event.icon_url} alt="Icon" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base sm:text-lg font-bold truncate leading-tight">
                                    {event.title || 'Okänd händelse'}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {/* Tab Switcher */}
                                    <div className="flex items-center gap-1 bg-slate-200 dark:bg-slate-900/50 p-1 rounded-lg mr-2">
                                        <button
                                            onClick={() => setActiveTab('info')}
                                            className={`px-2 py-1 rounded-md transition-all text-[10px] font-bold uppercase flex items-center gap-1.5 ${activeTab === 'info'
                                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                        >
                                            <Info className="w-3 h-3" /> Info
                                        </button>
                                        <button
                                            onClick={fetchHistory}
                                            disabled={loadingHistory}
                                            className={`px-2 py-1 rounded-md transition-all text-[10px] font-bold uppercase flex items-center gap-1.5 ${activeTab === 'history'
                                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                                }`}
                                        >
                                            {loadingHistory ? (
                                                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
                                                    <Clock className="w-3 h-3" />
                                                </motion.div>
                                            ) : (
                                                <HistoryIcon className="w-3 h-3" />
                                            )}
                                            Historik
                                        </button>
                                    </div>

                                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                                        ID: {event.external_id?.split('-')[0]}
                                    </span>

                                    {event.weather && (
                                        <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 px-2 py-1 rounded-lg">
                                            <div className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                                                <Thermometer className="w-3.5 h-3.5" />
                                                <span className="text-xs font-bold">{event.weather.temp}°C</span>
                                            </div>
                                            <div className="w-px h-3 bg-blue-200 dark:bg-blue-500/30"></div>
                                            <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                                <Wind className="w-3.5 h-3.5" />
                                                <span className="text-xs font-medium">{event.weather.wind_speed} m/s {event.weather.wind_dir}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 ml-4 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                        {activeTab === 'info' ? (
                            <div className="space-y-6">
                                {/* Media Section (Camera & Map) */}
                                <div className="flex flex-col md:flex-row gap-4">
                                    {/* Camera Slot */}
                                    <div
                                        className={`relative w-full md:w-1/2 h-48 sm:h-64 bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/camera flex items-center justify-center flex-shrink-0 ${event.camera_url ? 'cursor-zoom-in' : 'cursor-default'}`}
                                        onClick={() => {
                                            if (event.camera_url || event.camera_snapshot) setShowFullImage(true);
                                        }}
                                    >
                                        {(event.camera_snapshot || event.camera_url) ? (
                                            <img
                                                src={event.camera_snapshot ? `/api/snapshots/${event.camera_snapshot}` : event.camera_url}
                                                alt={event.camera_name || 'Trafikkamera'}
                                                className="w-full h-full object-cover group-hover/camera:scale-105 transition-transform duration-500 z-10"
                                                onError={(e) => {
                                                    if (event.camera_snapshot && e.target.src.includes('/api/snapshots/')) {
                                                        e.target.src = event.camera_url;
                                                    } else {
                                                        e.target.style.opacity = '0';
                                                    }
                                                }}
                                            />
                                        ) : null}

                                        {/* Placeholder */}
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-slate-400 dark:text-slate-600 z-0">
                                            <Camera className="w-10 h-10 mb-2 opacity-20" />
                                            <span className="text-xs italic">Ingen bild tillgänglig</span>
                                        </div>

                                        {event.camera_name && (
                                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-[10px] text-white px-3 py-2 flex items-center gap-2 z-20">
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                                <span className="truncate font-medium">{event.camera_name}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Map */}
                                    {event.latitude && event.longitude && (
                                        <div className={`rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 h-48 sm:h-64 ${(event.camera_url || event.camera_snapshot) ? 'w-full md:w-1/2' : 'w-full'}`}>
                                            <EventMap
                                                lat={event.latitude}
                                                lng={event.longitude}
                                                popupContent={event.location}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="p-4 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-700/50">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Info className="w-3.5 h-3.5 text-blue-500" />
                                        Beskrivning
                                    </h4>
                                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm">
                                        {event.description}
                                    </p>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                            <MapPin className="w-3 h-3" /> Plats
                                        </label>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-lg p-3 shadow-sm">
                                            {event.location}
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                            <Activity className="w-3 h-3" /> Typ
                                        </label>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-lg p-3 shadow-sm">
                                            {event.message_type || 'N/A'}
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                            <Clock className="w-3 h-3" /> Starttid
                                        </label>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-lg p-3 shadow-sm">
                                            {event.start_time ? format(new Date(event.start_time), 'yyyy-MM-dd HH:mm') : '-'}
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                            <Clock className="w-3 h-3" /> Sluttid
                                        </label>
                                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-lg p-3 shadow-sm">
                                            {event.end_time ? format(new Date(event.end_time), 'yyyy-MM-dd HH:mm') : 'Tillsvidare'}
                                        </p>
                                    </div>
                                </div>

                                {/* Extra Properties */}
                                {(event.temporary_limit || event.traffic_restriction_type || event.severity_text) && (
                                    <div className="flex flex-wrap gap-2 pt-2">
                                        {event.severity_text && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                                                <AlertTriangle className="w-4 h-4 text-red-500" />
                                                <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                                                    Allvarlig: {event.severity_text}
                                                </span>
                                            </div>
                                        )}
                                        {event.temporary_limit && (
                                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30">
                                                <AlertTriangle className="w-4 h-4 text-orange-500" />
                                                <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">
                                                    Limit: {event.temporary_limit}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6 relative before:absolute before:inset-0 before:left-[11px] before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800 before:h-full pb-10">
                                {history.map((version, idx) => (
                                    <div key={idx} className="relative pl-10 group">
                                        {/* dot */}
                                        <div className="absolute left-0 top-1.5 w-6 h-6 flex items-center justify-center">
                                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-slate-800 shadow-sm" />
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 uppercase tracking-wider">
                                            {format(new Date(version.version_timestamp), 'yyyy-MM-dd HH:mm:ss')}
                                        </div>
                                        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 transition-colors shadow-sm">
                                            <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                                                {version.description}
                                            </p>
                                            {version.camera_snapshot && (
                                                <div className="mt-4 relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 max-w-md aspect-video">
                                                    <img
                                                        src={`/api/snapshots/${version.camera_snapshot}`}
                                                        alt="Snapshot"
                                                        className="w-full h-full object-cover cursor-zoom-in"
                                                        onClick={() => window.open(`/api/snapshots/${version.camera_snapshot}`, '_blank')}
                                                    />
                                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm px-2 py-1 text-[8px] text-white flex items-center gap-1">
                                                        <Camera className="w-2.5 h-2.5" />
                                                        <span>VERSION ÖGONBLICKSBILD</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {history.length === 0 && !loadingHistory && (
                                    <div className="py-20 text-center pl-10">
                                        <HistoryIcon className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
                                        <p className="text-slate-400 italic">Ingen historik hittades för denna händelse.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Info */}
                    <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Trafikinfo Flux System</span>
                        <div className="flex items-center gap-3">
                            {event.pushed_to_mqtt && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-green-600 dark:text-green-500 uppercase tracking-widest">
                                    <ShieldCheck className="w-3 h-3" /> MQTT OK
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* Full-size Image Popover */}
                <AnimatePresence>
                    {showFullImage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
                            onClick={() => setShowFullImage(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95 }}
                                animate={{ scale: 1 }}
                                exit={{ scale: 0.95 }}
                                onClick={(e) => e.stopPropagation()}
                                className="relative max-w-full max-h-full flex flex-col shadow-2xl"
                            >
                                <button
                                    onClick={() => setShowFullImage(false)}
                                    className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                                <div className="bg-slate-900 rounded-2xl overflow-hidden border border-white/10 flex flex-col">
                                    <img
                                        src={event.camera_snapshot ? `/api/snapshots/${event.camera_snapshot}` : event.camera_url}
                                        alt={event.camera_name}
                                        className="max-w-[95vw] max-h-[80vh] object-contain"
                                    />
                                    <div className="p-4 bg-slate-900 border-t border-white/5 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-white font-bold text-sm">{event.camera_name}</h3>
                                            <p className="text-[10px] text-slate-400">Trafikkamera ögonblicksbild (Full storlek)</p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AnimatePresence>
    )
}
