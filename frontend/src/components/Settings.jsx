import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, ShieldCheck, Server, AlertCircle, Volume2, MapPin, Check, Trash2, AlertTriangle, Bell, BellOff } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const API_BASE = '/api'

const SWEDISH_COUNTIES = [
    { id: '0', name: 'Alla län' },
    { id: '1', name: 'Stockholms län' },
    { id: '2', name: 'Stockholms län (Legacy)' },
    { id: '3', name: 'Uppsala län' },
    { id: '4', name: 'Södermanlands län' },
    { id: '5', name: 'Östergötlands län' },
    { id: '6', name: 'Jönköpings län' },
    { id: '7', name: 'Kronobergs län' },
    { id: '8', name: 'Kalmar län' },
    { id: '9', name: 'Gotlands län' },
    { id: '10', name: 'Blekinge län' },
    { id: '12', name: 'Skåne län' },
    { id: '13', name: 'Hallands län' },
    { id: '14', name: 'Västra Götalands län' },
    { id: '17', name: 'Värmlands län' },
    { id: '18', name: 'Örebro län' },
    { id: '19', name: 'Västmanlands län' },
    { id: '20', name: 'Dalarnas län' },
    { id: '21', name: 'Gävleborgs län' },
    { id: '22', name: 'Västernorrlands län' },
    { id: '23', name: 'Jämtlands län' },
    { id: '24', name: 'Västerbottens län' },
    { id: '25', name: 'Norrbottens län' }
]

export default function Settings() {
    const { isLoggedIn } = useAuth()
    const [settings, setSettings] = useState({
        api_key: '',
        mqtt_host: 'localhost',
        mqtt_port: '1883',
        mqtt_topic: 'trafikinfo/events',
        selected_counties: '1,4', // Default
        retention_days: '30' // Default 30 days
    })
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState(null)
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [pushEnabled, setPushEnabled] = useState(false)
    const [subscribing, setSubscribing] = useState(false)

    const performFactoryReset = async () => {
        if (!isLoggedIn) return
        try {
            await axios.delete(`${API_BASE}/reset`)
            setMessage({ type: 'success', text: 'Systemet har återställts via Factory Reset.' })
            setShowResetConfirm(false)
        } catch (error) {
            console.error('Reset failed:', error)
            setMessage({ type: 'error', text: 'Kunde inte återställa systemet.' })
        }
    }
    const toggleCounty = (id) => {
        const currentCounties = settings.selected_counties ? settings.selected_counties.split(',') : []
        let newCounties
        if (currentCounties.includes(id)) {
            newCounties = currentCounties.filter(c => c !== id)
        } else {
            newCounties = [...currentCounties, id]
        }
        setSettings({ ...settings, selected_counties: newCounties.join(',') })
    }

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
    }, [])

    const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');
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
                if (permission !== 'granted') {
                    throw new Error('Permission not granted')
                }

                const res = await axios.get(`${API_BASE}/push/vapid-public-key`)
                const vapidPublicKey = res.data.public_key
                const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey)

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
                    counties: settings.selected_counties,
                    min_severity: 1
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
            } catch (error) {
                console.error('Error fetching settings:', error)
            }
        }
        fetchSettings()
    }, [])

    const handleSave = async (e) => {
        e.preventDefault()
        if (!isLoggedIn) return
        setSaving(true)
        setMessage(null)
        try {
            await axios.post(`${API_BASE}/settings`, settings)
            setMessage({ type: 'success', text: 'Inställningarna har sparats!' })
        } catch (error) {
            setMessage({ type: 'error', text: 'Kunde inte spara inställningarna.' })
        }
        setSaving(false)
    }

    const selectedCountiesList = settings.selected_counties ? settings.selected_counties.split(',') : []

    return (
        <div className="max-w-2xl mx-auto space-y-8 pb-20 relative">
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Inställningar</h2>
                    <p className="text-slate-500 dark:text-slate-400">Hantera dina notiser och systeminställningar</p>
                </div>

                <div className="space-y-6 mt-8">
                    {/* --- PUBLIC SECTIONS (Always visible) --- */}

                    {/* Push Notifications */}
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
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                    />
                                )}
                            </button>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Ta emot notiser direkt i din enhet när nya händelser inträffar i dina bevakade län.
                        </p>
                        <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10 p-3 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                            <strong>Tips för iOS:</strong> Du måste först "Lägg till på hemskärmen" för att kunna aktivera notiser.
                        </div>
                    </div>

                    {/* Sound Notifications */}
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
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${soundEnabled ? 'translate-x-6' : 'translate-x-1'}`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Regional bevakning (Counties) - Public now */}
                    <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                        <div className="flex items-center gap-3 mb-2">
                            <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Regional bevakning</h3>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Välj vilka län du vill bevaka. Inställningen sparas lokalt för dina push-notiser.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                            {SWEDISH_COUNTIES.map((county) => (
                                <label
                                    key={county.id}
                                    className={`flex items-center gap-3 px-4 py-2 rounded-xl border cursor-pointer transition-all ${selectedCountiesList.includes(county.id)
                                        ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
                                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={selectedCountiesList.includes(county.id)}
                                        onChange={() => toggleCounty(county.id)}
                                    />
                                    <span className="text-sm font-medium">{county.name}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* --- ADMIN SECTIONS (Behind isLoggedIn) --- */}

                    {!isLoggedIn ? (
                        <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full text-center">
                            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                                <ShieldCheck className="w-8 h-8 text-blue-500" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Systeminställningar låsta</h3>
                            <p className="text-slate-500 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                                Du måste logga in som Admin för att ändra systemets kärninställningar som API-nycklar, län-bevakning och MQTT.
                            </p>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                                <p className="text-xs text-slate-500 italic">
                                    Klicka på lås-ikonen för att logga in.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            {/* General */}
                            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm dark:shadow-none space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <MapPin className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Generellt</h3>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-700 dark:text-slate-400 font-medium">Kameraradie (km)</label>
                                    <input
                                        type="number"
                                        value={settings.camera_radius_km ?? ''}
                                        onChange={(e) => setSettings({ ...settings, camera_radius_km: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white transition-colors"
                                        min="1"
                                        max="50"
                                    />
                                    <p className="text-xs text-slate-500">Sökområde för att matcha kameror mot händelser.</p>
                                </div>
                            </div>

                            {/* Data storage */}
                            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                                <div className="flex items-center gap-3 mb-2">
                                    <Trash2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Datalagring</h3>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-700 dark:text-slate-400 font-medium">Spara händelsehistorik</label>
                                    <select
                                        value={settings.retention_days ?? '30'}
                                        onChange={(e) => setSettings({ ...settings, retention_days: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 text-slate-900 dark:text-white transition-colors appearance-none"
                                    >
                                        <option value="7">7 dagar</option>
                                        <option value="30">30 dagar</option>
                                        <option value="90">90 dagar</option>
                                        <option value="365">1 år</option>
                                        <option value="0">För alltid (Rekommenderas ej)</option>
                                    </select>
                                    <p className="text-xs text-slate-500">Händelser och bilder äldre än detta rensas automatiskt varje natt.</p>
                                </div>
                            </div>

                            {/* API Key */}
                            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl space-y-4 shadow-sm dark:shadow-none">
                                <div className="flex items-center gap-3 mb-2">
                                    <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trafikverket API</h3>
                                </div>

                                {(!settings.api_key || settings.api_key === '') && (
                                    <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl flex gap-3 animate-in zoom-in duration-300">
                                        <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                        <div>
                                            <h4 className="text-sm font-bold text-red-900 dark:text-red-300">Konfiguration saknas</h4>
                                            <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                                                Systemet behöver en **Authentication Key** från Trafikverket för att kunna hämta händelser.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm text-slate-700 dark:text-slate-400 font-medium">Authentication Key</label>
                                    <input
                                        type="password"
                                        value={settings.api_key ?? ''}
                                        onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                                        className={`w-full bg-slate-50 dark:bg-slate-900 border rounded-xl px-4 py-2.5 outline-none transition-all ${!settings.api_key || settings.api_key === ''
                                            ? 'border-red-400 dark:border-red-500/50 focus:border-red-500'
                                            : 'border-slate-200 dark:border-slate-700 focus:border-blue-500'
                                            } text-slate-900 dark:text-white`}
                                        placeholder="Din API-nyckel..."
                                    />
                                </div>
                            </div>


                            {/* MQTT */}
                            <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm dark:shadow-none space-y-6">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-3">
                                        <Server className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">MQTT Broker</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSettings({ ...settings, mqtt_enabled: settings.mqtt_enabled === 'true' ? 'false' : 'true' })}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.mqtt_enabled === 'true' ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.mqtt_enabled === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Reset Confirm */}
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 p-6 rounded-2xl space-y-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                                    <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">Farlig zon</h3>
                                </div>
                                {!showResetConfirm ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowResetConfirm(true)}
                                        className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors text-sm"
                                    >
                                        Rensa allt (Factory Reset)
                                    </button>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-xs text-red-700 dark:text-red-300">Är du helt säker? Detta raderar allt permanent.</p>
                                        <div className="flex gap-2">
                                            <button onClick={performFactoryReset} className="bg-red-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Ja, rensa</button>
                                            <button onClick={() => setShowResetConfirm(false)} className="bg-slate-200 dark:bg-slate-700 px-3 py-2 rounded-lg text-xs">Avbryt</button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Message Display inside Admin */}
                            {message && (
                                <div className={`p-4 rounded-xl text-sm font-medium ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {message.text}
                                </div>
                            )}

                            {/* Save Button */}
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                            >
                                {saving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <><Save className="w-5 h-5" /> Spara systeminställningar</>}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
