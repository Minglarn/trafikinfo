import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import EventFeed from './components/EventFeed'
import HistoryBoard from './components/HistoryBoard'
import Settings from './components/Settings'

function App() {
  const [activeTab, setActiveTab] = useState('feed')

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'feed' && <EventFeed />}
            {activeTab === 'history' && <HistoryBoard />}
            {activeTab === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
