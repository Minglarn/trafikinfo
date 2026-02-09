import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { Save, ShieldCheck, Server, AlertCircle } from 'lucide-react'

const API_BASE = '/api'

export default function Settings() {
    const [settings, setSettings] = useState({
        api_key: '',
        mqtt_host: 'localhost',
        mqtt_port: '1883',
        mqtt_topic: 'trafikinfo/events'
    })
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState(null)

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
        setSaving(true)
        setMessage(null)
        try {
            await axios.post(`${API_BASE}/settings`, settings)
            setMessage({ type: 'success', text: 'Inställningarna har sparats!' })
        } catch (error) {
            setMessage({ type: 'error', text: 'Kunde inte spara inställningarna.' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-white">Inställningar</h2>
                <p className="text-slate-400">Hantera dina API-nycklar och MQTT-kopplingar</p>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
                {/* API Key */}
                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-4">
                    <div className="flex items-center gap-3 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-semibold">Trafikverket API</h3>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-slate-400 font-medium">Authentication Key</label>
                        <input
                            type="password"
                            value={settings.api_key}
                            onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors"
                            placeholder="Din API-nyckel..."
                        />
                        <p className="text-xs text-slate-500">Hämta din nyckel på dataportalen.trafikverket.se</p>
                    </div>
                </div>

                {/* MQTT Config */}
                <div className="bg-slate-800/50 border border-slate-700 p-6 rounded-2xl space-y-6">
                    <div className="flex items-center gap-3 mb-2">
                        <Server className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-semibold">MQTT Broker</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400 font-medium">Host</label>
                            <input
                                type="text"
                                value={settings.mqtt_host}
                                onChange={(e) => setSettings({ ...settings, mqtt_host: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-slate-400 font-medium">Port</label>
                            <input
                                type="text"
                                value={settings.mqtt_port}
                                onChange={(e) => setSettings({ ...settings, mqtt_port: e.target.value })}
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors"
                                placeholder="1883"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-slate-400 font-medium">Topic Path</label>
                        <input
                            type="text"
                            value={settings.mqtt_topic}
                            onChange={(e) => setSettings({ ...settings, mqtt_topic: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 transition-colors"
                        />
                    </div>
                </div>

                {message && (
                    <div className={`p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                        {message.type === 'success' ? <ShieldCheck className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                        <span className="text-sm font-medium">{message.text}</span>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20"
                >
                    {saving ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <Save className="w-5 h-5" />
                            Spara inställningar
                        </>
                    )}
                </button>
            </form>
        </div>
    )
}
