
import React, { useEffect } from 'react'
import { X, MapPin, Info, Clock, AlertTriangle, ShieldCheck, Activity } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import EventMap from './EventMap'

export default function EventModal({ event, onClose }) {
    // Close on escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    if (!event) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
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
                    className="relative w-full max-w-4xl bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-700"
                >
                    {/* Header */}
                    <div className="flex items-start justify-between p-6 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-center gap-4 pr-8">
                            {event.icon_url && (
                                <div className="p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                                    <img src={event.icon_url} alt="Icon" className="w-10 h-10 object-contain" />
                                </div>
                            )}
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">
                                    {event.title || 'Okänd händelse'}
                                </h3>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                                        ID: {event.external_id}
                                    </span>
                                    {event.road_number && (
                                        <span className="bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-400 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200 dark:border-yellow-500/20">
                                            {event.road_number}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Description */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700/50 space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-slate-900 dark:text-gray-200 mb-2 flex items-center gap-2">
                                    <Info className="w-4 h-4 text-blue-500" />
                                    Beskrivning
                                </h4>
                                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-sm">
                                    {event.description}
                                </p>
                            </div>

                            {/* Map */}
                            {event.latitude && event.longitude && (
                                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                                    <EventMap
                                        lat={event.latitude}
                                        lng={event.longitude}
                                        popupContent={event.location}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Location */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                    <MapPin className="w-3.5 h-3.5" /> Plats
                                </label>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                                    {event.location}
                                </p>
                            </div>

                            {/* Message Type */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                    <Activity className="w-3.5 h-3.5" /> Typ
                                </label>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                                    {event.message_type || 'N/A'}
                                </p>
                            </div>

                            {/* Start Time */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                    <Clock className="w-3.5 h-3.5" /> Starttid
                                </label>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                                    {event.start_time ? format(new Date(event.start_time), 'yyyy-MM-dd HH:mm') : '-'}
                                </p>
                            </div>

                            {/* End Time */}
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                    <Clock className="w-3.5 h-3.5" /> Sluttid
                                </label>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5">
                                    {event.end_time ? format(new Date(event.end_time), 'yyyy-MM-dd HH:mm') : 'Tillsvidare'}
                                </p>
                            </div>
                        </div>

                        {/* Extra Properties */}
                        {(event.temporary_limit || event.traffic_restriction_type || event.severity_text) && (
                            <div className="space-y-3 pt-2">
                                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 pb-1">
                                    Detaljerad Info
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {event.severity_text && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
                                            <AlertTriangle className="w-4 h-4 text-red-500" />
                                            <span className="text-xs font-medium text-red-700 dark:text-red-400">
                                                Allvarlighetsgrad: {event.severity_text}
                                            </span>
                                        </div>
                                    )}
                                    {event.temporary_limit && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-900/30">
                                            <AlertTriangle className="w-4 h-4 text-orange-500" />
                                            <span className="text-xs font-medium text-orange-700 dark:text-orange-400">
                                                Begränsning: {event.temporary_limit}
                                            </span>
                                        </div>
                                    )}
                                    {event.traffic_restriction_type && (
                                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30">
                                            <Info className="w-4 h-4 text-blue-500" />
                                            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                                                Trafikpåverkan: {event.traffic_restriction_type}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* MQTT Info */}
                        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">MQTT Status</span>
                            {event.pushed_to_mqtt ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    Skickad
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                    Ej skickad
                                </span>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
