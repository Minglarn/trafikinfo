import React, { useState } from 'react'
import { Activity, History, Settings, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { motion } from 'framer-motion'

export default function Sidebar({ activeTab, setActiveTab }) {
    const [isCollapsed, setIsCollapsed] = useState(false)

    const menuItems = [
        { id: 'feed', label: 'Realtid', icon: Activity },
        { id: 'history', label: 'Historik', icon: History },
        { id: 'settings', label: 'Inställningar', icon: Settings },
    ]

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
            <div className={`p-4 border-t border-slate-800 ${isCollapsed ? 'justify-center' : ''} flex`}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    {!isCollapsed && <span className="text-xs text-slate-500 font-medium">System Online</span>}
                </div>
            </div>
        </motion.div>
    )
}
