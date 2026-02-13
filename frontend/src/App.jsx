import React, { useState } from 'react'
import { AuthProvider } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import EventFeed from './components/EventFeed'
import HistoryBoard from './components/HistoryBoard'
import Settings from './components/Settings'
import Statistics from './components/Statistics'
import CameraGrid from './components/CameraGrid'
import LoginModal from './components/LoginModal'
import MobileHeader from './components/MobileHeader'
import BottomNav from './components/BottomNav'
import RoadConditions from './components/RoadConditions'

function AppContent() {
  const [activeTab, setActiveTab] = useState('feed')
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false)
  const [initialEventId, setInitialEventId] = useState(null)

  // Theme State
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'dark'
    }
    return 'dark'
  })

  // Setup state
  const [setupRequired, setSetupRequired] = useState(false)

  // Tab Counts State
  const [counts, setCounts] = useState({
    feed: 0,
    planned: 0,
    'road-conditions': 0,
    cameras: 0
  })

  // Fetch status and counts
  React.useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch('/api/status')
        if (response.ok) {
          const data = await response.json()
          setSetupRequired(data.setup_required)
          if (data.setup_required && activeTab !== 'settings') {
            setActiveTab('settings')
          }
        }
      } catch (error) {
        console.error('Failed to fetch status:', error)
      }
    }

    const fetchCounts = async () => {
      try {
        const res = await fetch('/api/status/counts')
        if (res.ok) {
          const data = await res.json()
          setCounts(data)
        }
      } catch (e) {
        console.error("Counts fetch error", e)
      }
    }

    checkStatus()
    fetchCounts()
    // Check every 30 seconds
    const statusInterval = setInterval(checkStatus, 30000)
    const countsInterval = setInterval(fetchCounts, 30000)
    return () => {
      clearInterval(statusInterval)
      clearInterval(countsInterval)
    }
  }, [activeTab])

  // Report Base URL and handle Deep Links
  React.useEffect(() => {
    // 1. Report base_url to backend
    const reportBaseUrl = async () => {
      try {
        await fetch('/api/report-base-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base_url: window.location.origin })
        });
      } catch (err) {
        console.error('Failed to report base_url:', err);
      }
    };
    reportBaseUrl();

    // 2. Check for deep link event_id
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event_id');
    if (eventId) {
      setInitialEventId(eventId);
      // Optional: Clean up URL after capturing
      // window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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
      {/* Mobile Top Header */}
      <MobileHeader />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        counts={counts}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8 pt-16 pb-20 md:pt-4 md:pb-4 bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
          <div className="max-w-7xl mx-auto h-full">
            {activeTab === 'feed' && <EventFeed mode="realtid" initialEventId={initialEventId} onClearInitialEvent={() => setInitialEventId(null)} />}
            {activeTab === 'planned' && <EventFeed mode="planned" />}
            {activeTab === 'road-conditions' && <RoadConditions />}
            {activeTab === 'cameras' && <CameraGrid />}
            {activeTab === 'statistics' && <Statistics />}
            {activeTab === 'history' && <HistoryBoard />}
            {activeTab === 'settings' && <Settings />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
