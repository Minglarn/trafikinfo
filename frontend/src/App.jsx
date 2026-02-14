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

  // 0. Last Seen State (Option A)
  const [lastSeen, setLastSeen] = useState(() => {
    const saved = localStorage.getItem('flux_lastSeen')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch (e) {
        console.error("Failed to parse lastSeen", e)
      }
    }
    // Default to far in past if never seen, so everything looks "new" first time
    // Or set to now if we want a clean slate on first install
    return {
      feed: new Date().toISOString(),
      planned: new Date().toISOString(),
      'road-conditions': new Date().toISOString()
    }
  })

  // Save lastSeen to localStorage
  React.useEffect(() => {
    localStorage.setItem('flux_lastSeen', JSON.stringify(lastSeen))
  }, [lastSeen])

  // Update lastSeen when activeTab changes
  React.useEffect(() => {
    if (['feed', 'planned', 'road-conditions'].includes(activeTab)) {
      setLastSeen(prev => ({
        ...prev,
        [activeTab]: new Date().toISOString()
      }))
      // Optimistically clear count for active tab
      setCounts(prev => ({
        ...prev,
        [activeTab]: 0
      }))
    }
  }, [activeTab])

  // 1. Initial status and setup redirect
  React.useEffect(() => {
    const initStatus = async () => {
      try {
        const response = await fetch('/api/status')
        if (response.ok) {
          const data = await response.json()
          setSetupRequired(data.setup_required)
          if (data.setup_required) {
            setActiveTab('settings')
          }
        }
      } catch (error) {
        console.error('Failed to init status:', error)
      }
    }
    initStatus()
  }, []) // Only on mount

  // 2. Continuous status and counts polling
  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/status')
        if (response.ok) {
          const data = await response.json()
          setSetupRequired(data.setup_required)
        }
      } catch (error) {
        console.error('Failed to poll status:', error)
      }
    }

    const fetchCounts = async (isMounted) => {
      try {
        const params = new URLSearchParams()
        if (lastSeen.feed) params.append('since_feed', lastSeen.feed)
        if (lastSeen.planned) params.append('since_planned', lastSeen.planned)
        if (lastSeen['road-conditions']) params.append('since_road_conditions', lastSeen['road-conditions'])

        const res = await fetch(`/api/status/counts?${params.toString()}`)
        if (res.ok && isMounted) {
          const data = await res.json()
          // Ensure active tab count is forced to 0 in case of timing issues
          if (['feed', 'planned', 'road-conditions'].includes(activeTab)) {
            data[activeTab] = 0
          }
          setCounts(data)
        }
      } catch (e) {
        if (isMounted) console.error("Counts poll error", e)
      }
    }

    let isMounted = true
    fetchCounts(isMounted) // Immediate first fetch for counts
    const statusInterval = setInterval(fetchStatus, 30000)
    const countsInterval = setInterval(() => fetchCounts(isMounted), 30000)
    return () => {
      isMounted = false
      clearInterval(statusInterval)
      clearInterval(countsInterval)
    }
  }, [lastSeen, activeTab]) // Add activeTab to dependencies to ensure force-clear works


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
      <MobileHeader onOpenLogin={() => setIsLoginModalOpen(true)} />

      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        theme={theme}
        toggleTheme={toggleTheme}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        counts={counts}
        setupRequired={setupRequired}
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
      <BottomNav activeTab={activeTab} setActiveTab={setActiveTab} counts={counts} setupRequired={setupRequired} />

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
