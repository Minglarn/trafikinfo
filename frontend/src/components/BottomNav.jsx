import React from 'react'
import { Activity, Camera, BarChart2, History, Settings, Snowflake, Calendar } from 'lucide-react'

const BottomNav = ({ activeTab, setActiveTab, counts = {}, setupRequired }) => {
    const tabs = [
        { id: 'feed', icon: Activity, label: 'Realtid' },
        { id: 'planned', icon: Calendar, label: 'Planerat' },
        { id: 'road-conditions', icon: Snowflake, label: 'Väglag' },
        { id: 'cameras', icon: Camera, label: 'Kamera' },
        { id: 'settings', icon: Settings, label: 'Inställn.' },
    ]

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-1 z-50 flex justify-around items-center h-16 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            {tabs.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                const count = counts[item.id] || 0
                const needsSetup = item.id === 'settings' && setupRequired

                return (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex flex-col items-center justify-center flex-1 py-1 px-2 rounded-lg transition-all ${isActive
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400'
                            }`}
                    >
                        <div className="relative">
                            <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                            {count > 0 && (
                                <span className="absolute -top-1.5 -right-2 bg-blue-600 text-white text-[8px] font-black px-1 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center min-w-[16px] h-4">
                                    {count > 99 ? '99+' : count}
                                </span>
                            )}
                            {needsSetup && (
                                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-white dark:border-slate-900 rounded-full animate-pulse"></span>
                            )}
                        </div>
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
