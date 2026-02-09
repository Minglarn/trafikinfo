import React, { useState, useEffect } from 'react'
import { Activity, History, Settings, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Sidebar({ activeTab, setActiveTab }) {
    const [isCollapsed, setIsCollapsed] = useState(false)

    const menuItems = [
        { id: 'feed', label: 'Realtid', icon: Activity },
        { id: 'history', label: 'Historik', icon: History },
        { id: 'settings', label: 'Inställningar', icon: Settings },
    ]

    // Poll system status
    const [status, setStatus] = useState({
        trafikverket: { connected: false },
        mqtt: { connected: false }
    })

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                // Since this component might be loaded before axios base url is set in some cases, use relative path if possible, 
                // but here we assume API_BASE is handled or relative path works via proxy/catch-all
                const res = await fetch('/api/status')
                if (res.ok) {
                    const data = await res.json()
                    setStatus(data)
                }
            } catch (e) {
                console.error("Status fetch error", e)
            }
        }
        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [])

    return (
        <motion.div
            animate={{ width: isCollapsed ? 80 : 250 }}
            className="h-screen bg-slate-900 border-r border-slate-800 flex flex-col transition-all duration-300 relative"
        >
            {/* Logo Area */}
            <div className="p-6 flex items-center gap-3 overflow-hidden whitespace-nowrap">
                <div className="bg-blue-600 p-2 rounded-lg min-w-10">
                    <Activity className="w-6 h-6 text-white" />
                </div>
                {!isCollapsed && (
                    <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xl font-bold tracking-tight text-white"
                    >
                        Trafikinfo <span className="text-blue-500">Flux</span>
                    </motion.h1>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-8 space-y-2">
                {menuItems.map((item) => {
                    const Icon = item.icon
                    const isActive = activeTab === item.id

                    return (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                        >
                            <Icon className="w-6 h-6 min-w-6" />
                            {!isCollapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="font-medium whitespace-nowrap"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </button>
                    )
                })}
            </nav>

            {/* Collapse Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-20 bg-slate-800 text-slate-400 p-1 rounded-full border border-slate-700 hover:text-white transition-colors"
            >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            {/* Footer Status */}
            <div className={`p-4 border-t border-slate-800 flex flex-col gap-3 ${isCollapsed ? 'items-center' : ''}`}>
                {!isCollapsed && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Systemstatus</p>}

                {/* Trafikverket Status */}
                <div className="flex items-center gap-3" title={status.trafikverket.last_error}>
                    <span className={`w-2.5 h-2.5 rounded-full ${status.trafikverket.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                    {!isCollapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-300">Trafikverket</span>
                            {!status.trafikverket.connected && <span className="text-[10px] text-red-400">Frånkopplad</span>}
                        </div>
                    )}
                </div>

                {/* MQTT Status */}
                <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.mqtt.connected ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></span>
                    {!isCollapsed && <span className="text-sm text-slate-300">MQTT Broker</span>}
                </div>
            </div>
        </motion.div>
    )
}
