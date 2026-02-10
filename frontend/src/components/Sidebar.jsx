import React, { useState, useEffect } from 'react'
import { Activity, History, Settings, ChevronLeft, ChevronRight, Sun, Moon, BarChart2 } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Sidebar({ activeTab, setActiveTab, theme, toggleTheme }) {
    const [isCollapsed, setIsCollapsed] = useState(false)

    const menuItems = [
        { id: 'feed', label: 'Realtid', icon: Activity },
        { id: 'statistics', label: 'Statistik', icon: BarChart2 },
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
            className="h-screen bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 relative z-20 shadow-xl dark:shadow-none"
        >
            {/* Logo Area */}
            <div className="p-6 flex flex-col items-center justify-center overflow-hidden whitespace-nowrap gap-4">
                <div className={`transition-all duration-300 bg-white p-2 rounded-xl shadow-sm ${isCollapsed ? 'w-12 h-12' : 'w-48'}`}>
                    <img src="/logo.png" alt="Trafikinfo Flux" className="w-full h-full object-contain" />
                </div>
                {!isCollapsed && (
                    <motion.h1
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xl font-bold tracking-tight text-slate-900 dark:text-white"
                    >
                        Trafikinfo <span className="text-blue-600 dark:text-blue-500">Flux</span>
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
                            className={`w-full flex items-center gap-4 p-3 rounded-xl transition-all font-medium ${isActive
                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                                }`}
                        >
                            <Icon className="w-6 h-6 min-w-6" />
                            {!isCollapsed && (
                                <motion.span
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="whitespace-nowrap"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </button>
                    )
                })}
            </nav>

            {/* Theme Toggle */}
            <div className="px-4 mb-4">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center gap-4 p-3 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-all bg-slate-50 dark:bg-transparent border border-slate-200 dark:border-transparent"
                    title={theme === 'dark' ? 'Byt till ljust läge' : 'Byt till mörkt läge'}
                >
                    {theme === 'dark' ? <Sun className="w-6 h-6 min-w-6" /> : <Moon className="w-6 h-6 min-w-6" />}

                    {!isCollapsed && (
                        <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="font-medium whitespace-nowrap"
                        >
                            {theme === 'dark' ? 'Ljust läge' : 'Mörkt läge'}
                        </motion.span>
                    )}
                </button>
            </div>

            {/* Collapse Button */}
            <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="absolute -right-3 top-20 bg-white dark:bg-slate-800 text-slate-400 p-1 rounded-full border border-slate-200 dark:border-slate-700 hover:text-blue-600 dark:hover:text-white transition-colors shadow-sm"
            >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>

            {/* Footer Status */}
            <div className={`p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3 ${isCollapsed ? 'items-center' : ''}`}>
                {!isCollapsed && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Systemstatus</p>}

                {/* Trafikverket Status */}
                <div className="flex items-center gap-3" title={status.trafikverket.last_error}>
                    <span className={`w-2.5 h-2.5 rounded-full ${status.trafikverket.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                    {!isCollapsed && (
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-600 dark:text-slate-300">Trafikverket</span>
                            {!status.trafikverket.connected && <span className="text-[10px] text-red-500 dark:text-red-400">Frånkopplad</span>}
                        </div>
                    )}
                </div>

                {/* MQTT Status */}
                <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${status.mqtt.connected ? 'bg-green-500 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'}`}></span>
                    {!isCollapsed && <span className="text-sm text-slate-600 dark:text-slate-300">MQTT Broker</span>}
                </div>
            </div>
        </motion.div>
    )
}
