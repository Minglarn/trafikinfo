import React from 'react'
import { Activity, Camera, BarChart2, History, Settings, Snowflake } from 'lucide-react'

const BottomNav = ({ activeTab, setActiveTab }) => {
    const tabs = [
        { id: 'feed', icon: Activity, label: 'Realtid' },
        { id: 'road-conditions', icon: Snowflake, label: 'Väglag' },
        { id: 'cameras', icon: Camera, label: 'Kamera' },
        { id: 'statistics', icon: BarChart2, label: 'Statistik' },
        { id: 'history', icon: History, label: 'Historik' },
        { id: 'settings', icon: Settings, label: 'Inställn.' },
    ]

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-1 z-50 flex justify-around items-center h-16 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            {tabs.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id

                return (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-lg transition-all ${isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                            }`}
                    >
                        <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                        <span className={`text-[10px] font-bold mt-1 transition-all ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                            {item.label}
                        </span>
                    </button>
                )
            })}
        </nav>
    )
}

export default BottomNav
