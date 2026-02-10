import React, { useState } from 'react'
import Sidebar from './components/Sidebar'
import EventFeed from './components/EventFeed'
import HistoryBoard from './components/HistoryBoard'
import Settings from './components/Settings'
import Statistics from './components/Statistics'

function App() {
  const [activeTab, setActiveTab] = useState('feed')

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'dark'
    }
    return 'dark'
  })

  // Apply theme class to html element
  React.useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-hidden transition-colors duration-300">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'feed' && <EventFeed />}
            {activeTab === 'statistics' && <Statistics />}
            {activeTab === 'history' && <HistoryBoard />}
            {activeTab === 'settings' && <Settings />}
          </div>
        </main>
      </div>
    </div>
  )
}

export default App
