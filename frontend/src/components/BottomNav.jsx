import React from 'react'
import { Activity, Camera, BarChart2, History, Settings } from 'lucide-react'

const BottomNav = ({ activeTab, setActiveTab }) => {
    const navItems = [
        { id: 'feed', label: 'Flöde', icon: Activity },
        { id: 'cameras', label: 'Kamera', icon: Camera },
        { id: 'statistics', label: 'Stats', icon: BarChart2 },
        { id: 'history', label: 'Logg', icon: History },
        { id: 'settings', label: 'Inst.', icon: Settings },
    ]

    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-2 py-1 z-50 flex justify-around items-center h-16 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
            {navItems.map((item) => {
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
