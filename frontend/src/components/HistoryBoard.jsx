import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { Search, Database } from 'lucide-react'

const API_BASE = '/api'

export default function HistoryBoard() {
    const [history, setHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [hours, setHours] = useState(24) // Default 24 hours

    useEffect(() => {
        fetchHistory()
        // Poll every 30 seconds
        const interval = setInterval(fetchHistory, 30000)
        return () => clearInterval(interval)
    }, [hours]) // Reload when hours change

    const fetchHistory = async () => {
        try {
            const response = await axios.get(`${API_BASE}/events`, {
                params: {
                    limit: 1000,
                    hours: hours
                }
            })
            setHistory(response.data)
            setLoading(false)
        } catch (error) {
            console.error('Error fetching history:', error)
            setLoading(false)
        }
    }

    const filteredHistory = history.filter(event =>
        event.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.description.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Database className="w-6 h-6 text-blue-500" />
                    Händelsehistorik
                </h2>

                <div className="flex flex-wrap gap-4 w-full sm:w-auto">
                    {/* Time Filter */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-slate-400 text-sm">H</span>
                        </div>
                        <select
                            value={hours}
                            onChange={(e) => setHours(Number(e.target.value))}
                            className="bg-slate-800 border-none rounded-lg py-2 pl-8 pr-4 text-slate-200 focus:ring-2 focus:ring-blue-500 w-full sm:w-auto cursor-pointer appearance-none"
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
                            className="bg-slate-800 border-none rounded-lg py-2 pl-10 pr-4 text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 w-full"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="bg-slate-800/30 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-800/50 border-b border-slate-700">
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Datum</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Händelse</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Plats</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">MQTT</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {filteredHistory.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="text-sm text-slate-200 font-medium">
                                                {format(new Date(item.created_at), 'yyyy-MM-dd')}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                {format(new Date(item.created_at), 'HH:mm:ss')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-xs xl:max-w-md">
                                            <div className="text-sm font-semibold text-white mb-0.5">{item.title}</div>
                                            <div className="text-xs text-slate-500 line-clamp-2">{item.description}</div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-sm text-slate-400 truncate block max-w-[200px]">{item.location}</span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {item.pushed_to_mqtt ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20 uppercase">OK</span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-700 text-slate-500 border border-slate-600 uppercase">Skip</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {filteredHistory.length === 0 && (
                    <div className="py-20 text-center">
                        <Database className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-500 italic">Inga matchande historikposter hittades.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
