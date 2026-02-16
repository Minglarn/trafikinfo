import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, ShieldCheck, Server, AlertCircle, Volume2, MapPin, Check, Trash2, AlertTriangle, Bell, BellOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const API_BASE = '/api'

const SWEDISH_COUNTIES = [
    { id: 1, name: 'Stockholms län' },
    { id: 3, name: 'Uppsala län' },
    { id: 4, name: 'Södermanlands län' },
    { id: 5, name: 'Östergötlands län' },
    { id: 6, name: 'Jönköpings län' },
    { id: 7, name: 'Kronobergs län' },
    { id: 8, name: 'Kalmar län' },
    { id: 9, name: 'Gotlands län' },
    { id: 10, name: 'Blekinge län' },
    { id: 12, name: 'Skåne län' },
    { id: 13, name: 'Hallands län' },
    { id: 14, name: 'Västra Götalands län' },
    { id: 17, name: 'Värmlands län' },
    { id: 18, name: 'Örebro län' },
    { id: 19, name: 'Västmanlands län' },
    { id: 20, name: 'Dalarnas län' },
    { id: 21, name: 'Gävleborgs län' },
    { id: 22, name: 'Västernorrlands län' },
    { id: 23, name: 'Jämtlands län' },
    { id: 24, name: 'Västerbottens län' },
    { id: 25, name: 'Norrbottens län' }
]

const ROAD_WARNINGS = [
    { id: 'Risk för halka', label: 'Risk för halka', emoji: '⚠️' },
    { id: 'Halka', label: 'Halka', emoji: '🧊' },
    { id: 'Snörök', label: 'Snörök', emoji: '🌫️' },
    { id: 'Snödrev', label: 'Snödrev', emoji: '❄️' },
    { id: 'Hård vind', label: 'Hård vind', emoji: '💨' },
    { id: 'Snöfall', label: 'Snöfall', emoji: '🌨️' },
    { id: 'Annat', label: 'Annat', emoji: '📋' },
]

export default function Settings() {
    const { isLoggedIn } = useAuth()
    const [settings, setSettings] = useState({
        camera_radius_km: '5',
    })
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState(null)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [pushEnabled, setPushEnabled] = useState(false)
    const [subscribing, setSubscribing] = useState(false)
    const [status, setStatus] = useState(null)
    const [topicRealtid, setTopicRealtid] = useState(true)
    const [topicRoadCondition, setTopicRoadCondition] = useState(true)

    // Customization preferences
    const [includeSeverity, setIncludeSeverity] = useState(() => localStorage.getItem('push_include_severity') !== 'false')
    const [includeImage, setIncludeImage] = useState(() => localStorage.getItem('push_include_image') !== 'false')
    const [includeWeather, setIncludeWeather] = useState(() => localStorage.getItem('push_include_weather') !== 'false')
    const [includeLocation, setIncludeLocation] = useState(() => localStorage.getItem('push_include_location') !== 'false')
    const [minSeverity, setMinSeverity] = useState(() => parseInt(localStorage.getItem('push_min_severity') || '1'))
    const [rcWarningFilter, setRcWarningFilter] = useState(() => {
        const saved = localStorage.getItem('push_rc_warning_filter')
        return saved ? saved.split(',') : ROAD_WARNINGS.map(w => w.id)
    })

    // NEW: Local state for user's own preferred counties (for notifications)
    const [localCounties, setLocalCounties] = useState(() => {
        const saved = localStorage.getItem('localCounties')
        // Normalize 2 -> 1 on load
        const initial = saved ? saved.split(',') : ['1', '4']
        return [...new Set(initial.map(id => id === '2' ? '1' : id))]
    })

    useEffect(() => {
        localStorage.setItem('localCounties', localCounties.join(','))
        // Trigger storage event so other components (EventFeed) update
        window.dispatchEvent(new Event('storage'))
    }, [localCounties])

    useEffect(() => {
        localStorage.setItem('push_include_severity', includeSeverity)
        localStorage.setItem('push_include_image', includeImage)
        localStorage.setItem('push_include_weather', includeWeather)
        localStorage.setItem('push_include_location', includeLocation)
        localStorage.setItem('push_min_severity', minSeverity)
        localStorage.setItem('push_rc_warning_filter', rcWarningFilter.join(','))

        if (pushEnabled) {
            const sync = async () => {
                const reg = await navigator.serviceWorker.ready
                const sub = await reg.pushManager.getSubscription()
                if (sub) {
                    const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('p256dh'))))
                    const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('auth'))))
                    await axios.post(`${API_BASE}/push/subscribe`, {
                        endpoint: sub.endpoint,
                        keys: { p256dh, auth },
                        counties: localCounties.join(','),
                        min_severity: minSeverity,
                        topic_realtid: topicRealtid ? 1 : 0,
                        topic_road_condition: topicRoadCondition ? 1 : 0,
                        include_severity: includeSeverity ? 1 : 0,
                        include_image: includeImage ? 1 : 0,
                        include_weather: includeWeather ? 1 : 0,
                        include_location: includeLocation ? 1 : 0,
                        rc_warning_filter: rcWarningFilter.join(',')
                    })
                }
            }
            sync()
        }
    }, [includeSeverity, includeImage, includeWeather, includeLocation, topicRealtid, topicRoadCondition, minSeverity, rcWarningFilter])

    useEffect(() => {
        const syncInterest = async () => {
            try {
                await axios.post(`${API_BASE}/client/interest`, {
                    counties: localCounties.join(',')
                })
            } catch (error) {
                console.error('Failed to sync client interest:', error)
            }
        }
        const timeoutId = setTimeout(syncInterest, 2000)
        return () => clearTimeout(timeoutId)
    }, [localCounties])

    const toggleLocalCounty = (id) => {
        const strId = String(id === 2 ? 1 : id);
        setLocalCounties(prev =>
            prev.includes(strId) ? prev.filter(c => c !== strId) : [...prev, strId]
        )
    }

    const selectAllCounties = () => setLocalCounties(SWEDISH_COUNTIES.map(c => String(c.id)))
    const clearCounties = () => setLocalCounties([])

    const [soundEnabled, setSoundEnabled] = useState(false)
    const [soundFile, setSoundFile] = useState('chime1.mp3')

    useEffect(() => {
        const savedEnabled = localStorage.getItem('soundEnabled') === 'true'
        const savedFile = localStorage.getItem('soundFile') || 'chime1.mp3'
        setSoundEnabled(savedEnabled)
        setSoundFile(savedFile)
    }, [])

    const playSound = () => {
        const audio = new Audio(`/sounds/${soundFile}`)
        audio.play().catch(e => console.error('Error playing sound:', e))
    }

    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.pushManager.getSubscription().then(subscription => {
                    setPushEnabled(!!subscription)
                })
            })
        }
        axios.get(`${API_BASE}/status`).then(res => setStatus(res.data)).catch(() => { })
    }, [])

    const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    const togglePush = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            setMessage({ type: 'error', text: 'Din webbläsare stöder inte push-notiser.' })
            return
        }
        setSubscribing(true)
        try {
            if (pushEnabled) {
                const registration = await navigator.serviceWorker.ready
                const subscription = await registration.pushManager.getSubscription()
                if (subscription) {
                    await subscription.unsubscribe()
                    await axios.post(`${API_BASE}/push/unsubscribe`, { endpoint: subscription.endpoint })
                }
                setPushEnabled(false)
            } else {
                const permission = await Notification.requestPermission()
                if (permission !== 'granted') throw new Error('Permission not granted')
                const res = await axios.get(`${API_BASE}/push/vapid-public-key`)
                const convertedVapidKey = urlBase64ToUint8Array(res.data.public_key)
                const registration = await navigator.serviceWorker.ready
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedVapidKey
                })
                const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh'))))
                const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))))
                await axios.post(`${API_BASE}/push/subscribe`, {
                    endpoint: subscription.endpoint,
                    keys: { p256dh, auth },
                    counties: localCounties.join(','),
                    min_severity: 1,
                    topic_realtid: topicRealtid ? 1 : 0,
                    topic_road_condition: topicRoadCondition ? 1 : 0,
                    include_severity: includeSeverity ? 1 : 0,
                    include_image: includeImage ? 1 : 0,
                    include_weather: includeWeather ? 1 : 0,
                    include_location: includeLocation ? 1 : 0,
                    rc_warning_filter: rcWarningFilter.join(',')
                })
                setPushEnabled(true)
            }
        } catch (error) {
            console.error('Push toggle failed:', error)
            setMessage({ type: 'error', text: 'Kunde inte ändra push-notiser. Säkerställ HTTPS och att appen är installerad (iOS).' })
        }
        setSubscribing(false)
    }

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await axios.get(`${API_BASE}/settings`)
                setSettings(prev => ({ ...prev, ...response.data }))
            } catch (error) { console.error('Error fetching settings:', error) }
        }
        fetchSettings()
    }, [])

    const handleSave = async (e) => {
        e.preventDefault()
        setSaving(true)
        setMessage(null)
        try {
            await axios.post(`${API_BASE}/settings`, settings)
            setMessage({ type: 'success', text: 'Inställningarna har sparats!' })
        } catch (error) { setMessage({ type: 'error', text: 'Kunde inte spara inställningarna.' }) }
        setSaving(false)
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8 pb-20 relative">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Inställningar</h2>
                    <p className="text-slate-500 dark:text-slate-400">Hantera dina notiser och systeminställningar</p>
                </div>

                <div className="space-y-6 mt-8">
                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-3">
                                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">PWA Push-notiser</h3>
                            </div>
                            <button
                                type="button"
                                onClick={togglePush}
                                disabled={subscribing}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${pushEnabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                {subscribing ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                                ) : (
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                )}
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Ta emot notiser direkt i din enhet när nya händelser inträffar i dina bevakade län.
                        </p>
                        <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 p-3 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                            <strong>Tips för iOS:</strong> Du måste först "Lägg till på hemskärmen" för att kunna aktivera notiser.
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Ämnen att bevaka:</label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${topicRealtid ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 opacity-60'}`}>
                                    <input type="checkbox" checked={topicRealtid} onChange={() => setTopicRealtid(!topicRealtid)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Realtid</span>
                                </label>
                                <label className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${topicRoadCondition ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 opacity-60'}`}>
                                    <input type="checkbox" checked={topicRoadCondition} onChange={() => setTopicRoadCondition(!topicRoadCondition)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Väglag</span>
                                </label>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Innehåll i notiser:</label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${includeSeverity ? 'bg-slate-50 dark:bg-slate-800 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                                    <input type="checkbox" checked={includeSeverity} onChange={() => setIncludeSeverity(!includeSeverity)} className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Allvarlighetsgrad</span>
                                </label>
                                <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${includeImage ? 'bg-slate-50 dark:bg-slate-800 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                                    <input type="checkbox" checked={includeImage} onChange={() => setIncludeImage(!includeImage)} className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Kamerabild</span>
                                </label>
                                <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${includeWeather ? 'bg-slate-50 dark:bg-slate-800 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                                    <input type="checkbox" checked={includeWeather} onChange={() => setIncludeWeather(!includeWeather)} className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Väderdata</span>
                                </label>
                                <label className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${includeLocation ? 'bg-slate-50 dark:bg-slate-800 border-blue-200 dark:border-blue-500/30' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 opacity-60'}`}>
                                    <input type="checkbox" checked={includeLocation} onChange={() => setIncludeLocation(!includeLocation)} className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500" />
                                    <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Plats/Position</span>
                                </label>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100 dark:border-slate-700/50 space-y-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 italic flex items-center gap-2">
                                <AlertCircle className="w-3 h-3 text-blue-500" />
                                Minsta allvarlighetsgrad:
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 1, name: 'Ingen påverkan' },
                                    { id: 2, name: 'Liten påverkan' },
                                    { id: 3, name: 'Stor påverkan' },
                                    { id: 5, name: 'Extrem påverkan' }
                                ].map((level) => (
                                    <button
                                        key={level.id}
                                        onClick={() => setMinSeverity(level.id)}
                                        className={`px-3 py-2 rounded-xl border text-[10px] font-bold uppercase transition-all ${(minSeverity === level.id || (minSeverity === 4 && level.id === 3))
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-md scale-[1.02]'
                                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-300'
                                            }`}
                                    >
                                        {level.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                        <div className="flex items-center gap-3 mb-2">
                            <Volume2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Ljudnotiser</h3>
                        </div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-700 dark:text-slate-400 font-medium">Spela ljud vid ny händelse</label>
                            <button
                                type="button"
                                onClick={() => {
                                    const newValue = !soundEnabled
                                    setSoundEnabled(newValue)
                                    localStorage.setItem('soundEnabled', newValue)
                                    window.dispatchEvent(new Event('storage'))
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${soundEnabled ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <div className="flex items-center gap-3">
                                <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Min bevakning</h3>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={selectAllCounties} className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg hover:bg-blue-500/20 transition-colors">Alla län</button>
                                <button onClick={clearCounties} className="text-[10px] uppercase font-bold text-slate-500 bg-slate-500/10 px-2 py-1 rounded-lg hover:bg-slate-500/20 transition-colors">Rensa val</button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Välj dina regioner. Dessa används för dina personliga push-notiser.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {SWEDISH_COUNTIES.map((county) => (
                                <label key={county.id} className={`flex items-center gap-3 px-4 py-2 rounded-xl border cursor-pointer transition-all ${localCounties.includes(String(county.id)) ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400' : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                                    <input type="checkbox" className="hidden" checked={localCounties.includes(String(county.id))} onChange={() => toggleLocalCounty(county.id)} />
                                    <span className="text-sm font-medium">{county.name}</span>
                                </label>
                            ))}
                        </div>
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/50 flex justify-between items-center text-[10px] text-slate-500 font-medium">
                            <span>{localCounties.length} län valda</span>
                            <span className="italic">Sparas i din webbläsare</span>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm dark:shadow-none space-y-4">
                        <div className="flex items-center gap-3 mb-2">
                            <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Allmänna Inställningar</h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">Här hittar du dina lokala inställningar. Systeminställningar har flyttats till Admin-fliken.</p>
                        {message && (
                            <div className={`p-4 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {message.text}
                            </div>
                        )}
                        <button type="button" onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-500/25">
                            {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Save className="w-5 h-5" />}
                            Spara inställningar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
