import React, { useState } from 'react'
import { Activity, History, Settings as SettingsIcon } from 'lucide-react'
import EventFeed from './components/EventFeed'
import HistoryBoard from './components/HistoryBoard'
import Settings from './components/Settings'

function App() {
  const [activeTab, setActiveTab] = useState('feed')

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Trafikinfo <span className="text-blue-500">Flux</span></h1>
          </div>

          <nav className="flex gap-1 bg-slate-800/50 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setActiveTab('feed')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'feed' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}
            >
              <Activity className="w-4 h-4" />
              <span className="hidden sm:inline">Realtid</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">Historik</span>
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-slate-700 text-slate-400'}`}
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Inställningar</span>
            </button>
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden lg:flex flex-col items-end">
              <span className="text-xs text-slate-500 uppercase font-semibold">Status</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-sm font-medium">Ansluten</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {activeTab === 'feed' && <EventFeed />}
        {activeTab === 'history' && <HistoryBoard />}
        {activeTab === 'settings' && <Settings />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 bg-slate-900/80">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          &copy; 2026 Trafikinfo Flux • Drivs av Trafikverket Öppna Data
        </div>
      </footer>
    </div>
  )
}

export default App
