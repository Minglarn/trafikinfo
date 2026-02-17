import React, { useState, useEffect } from 'react'
import { Server, Activity, Lock, Unlock, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const MobileHeader = ({ onOpenLogin, isSSEConnected }) => {
    const { isLoggedIn, logout } = useAuth()
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
        <header className="md:hidden fixed top-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 h-14 z-50 flex items-center justify-between px-4 overflow-hidden">
            <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Flux" className="h-6 w-auto" />
                <span className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    Trafikinfo <span className="text-blue-600 dark:text-blue-500">Flux</span>
                </span>
            </div>

            <div className="flex items-center gap-3">
                {/* Status Indicator Dots */}
                <div className="flex items-center gap-2 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                    <div className="flex items-center gap-1.5" title="Trafikverket">
                        <div className={`w-1.5 h-1.5 rounded-full ${status.trafikverket.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    </div>
                    <div className="w-px h-3 bg-slate-300 dark:bg-slate-700"></div>
                    <div className="flex items-center gap-1.5" title="MQTT">
                        <div className={`w-1.5 h-1.5 rounded-full ${!status.mqtt?.enabled ? 'bg-slate-300 dark:bg-slate-700' : status.mqtt?.connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    </div>
                    <div className="w-px h-3 bg-slate-300 dark:bg-slate-700"></div>
                    <div className="flex items-center gap-1.5" title="Live-ström (SSE)">
                        <div className={`w-1.5 h-1.5 rounded-full ${isSSEConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                    </div>
                </div>

            </div>
        </header>
    )
}

export default MobileHeader
