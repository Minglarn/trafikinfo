import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { format } from 'date-fns'
import { Search, Database } from 'lucide-react'

const API_BASE = 'http://localhost:8000'

export default function HistoryBoard() {
    const [history, setHistory] = useState([])
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await axios.get(`${API_BASE}/events?limit=100`)
                setHistory(response.data)
            } catch (error) {
                console.error('Error fetching history:', error)
            }
        }
        fetchHistory()
    }, [])

    const filteredHistory = history.filter(ev =>
        (ev.title?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ev.description?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (ev.location?.toLowerCase().includes(searchTerm.toLowerCase()))
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white">Händelsehistorik</h2>
                    <p className="text-slate-400">Arkiv över alla lagrade trafikmeddelanden</p>
                </div>
                <div className="relative group max-w-md w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                    <input
                        type="text"
                        placeholder="Sök händelse, plats eller ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 transition-all text-sm"
                    />
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
