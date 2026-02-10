import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { Search, Database } from 'lucide-react'
import EventModal from './EventModal'

const API_BASE = '/api'

export default function HistoryBoard() {
    const [history, setHistory] = useState([])

    const [searchTerm, setSearchTerm] = useState('')
    const [hours, setHours] = useState(24) // Default 24 hours
    const [selectedEvent, setSelectedEvent] = useState(null)



    const fetchHistory = async () => {
        try {
            const response = await axios.get(`${API_BASE}/events`, {
                params: {
                    limit: 1000,
                    hours: hours
                }
            })
            setHistory(response.data)

        } catch (error) {
            console.error('Error fetching history:', error)
        }
    }

    useEffect(() => {
        fetchHistory()
        // Poll every 30 seconds
        const interval = setInterval(fetchHistory, 30000)
        return () => clearInterval(interval)
    }, [hours]) // Reload when hours change

    const filteredHistory = history.filter(event =>
        (event.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.location || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (event.description || '').toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <Database className="w-6 h-6 text-blue-600 dark:text-blue-500" />
                    Händelsehistorik
                </h2>

                <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                    {/* Time Filter */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-slate-500 dark:text-slate-400 text-sm">H</span>
                        </div>
                        <select
                            value={hours}
                            onChange={(e) => setHours(Number(e.target.value))}
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-none rounded-lg py-2 pl-8 pr-4 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 w-full sm:w-auto cursor-pointer appearance-none shadow-sm dark:shadow-none"
                        >
                            <option value="1">Senaste timmen</option>
                            <option value="6">Senaste 6 timmarna</option>
                            <option value="12">Senaste 12 timmarna</option>
                            <option value="24">Senaste dygnet</option>
                            <option value="48">Senaste 2 dygnen</option>
                            <option value="168">Senaste veckan</option>
                            <option value="0">All historik</option>
                        </select>
                    </div>

                    {/* Search Box */}
                    <div className="relative w-full sm:w-64">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-slate-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Sök i historiken..."
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-none rounded-lg py-2 pl-10 pr-4 text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:ring-2 focus:ring-blue-500 w-full shadow-sm dark:shadow-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Datum</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Händelse</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plats</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">MQTT</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredHistory.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => setSelectedEvent(item)}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-slate-700 dark:text-slate-200 font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {format(new Date(item.created_at), 'yyyy-MM-dd')}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {format(new Date(item.created_at), 'HH:mm:ss')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-xs xl:max-w-md">
                                            <div className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                {item.title}
                                            </div>
                                            <div className="text-xs text-slate-500 line-clamp-2">{item.description}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-slate-600 dark:text-slate-400 truncate block max-w-[200px]">{item.location}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {item.pushed_to_mqtt ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 uppercase">OK</span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 border border-slate-200 dark:border-slate-600 uppercase">Skip</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredHistory.length === 0 && (
                    <div className="py-20 text-center">
                        <Database className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-500 italic">Inga matchande historikposter hittades.</p>
                    </div>
                )}
            </div>

            {/* Event Details Modal */}
            <EventModal
                event={selectedEvent}
                onClose={() => setSelectedEvent(null)}
            />
        </div>
    )
}
