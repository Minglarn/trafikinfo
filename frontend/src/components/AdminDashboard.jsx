import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import {
    Shield,
    Monitor,
    Bell,
    Settings as SettingsIcon,
    Database,
    Trash2,
    Key,
    Wifi,
    Smartphone,
    Clock,
    MapPin,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Loader2,
    Lock,
    Eye,
    EyeOff,
    Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const parseUserAgent = (ua) => {
    if (!ua) return { os: 'Okänd', device: 'Okänd', type: 'desktop' };

    let os = 'Okänd';
    let device = 'Desktop';
    let type = 'desktop';

    // OS Detection
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    // Device/Browser refinement
    if (ua.includes('iPhone')) { device = 'iPhone'; type = 'mobile'; }
    else if (ua.includes('iPad')) { device = 'iPad'; type = 'tablet'; }
    else if (ua.includes('Android')) { device = 'Samsung/Android'; type = 'mobile'; } // Generic
    else if (ua.includes('Mobile')) { type = 'mobile'; }

    return { os, device, type };
};

const AdminDashboard = () => {
    const { isLoggedIn, login, logout } = useAuth();
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loginError, setLoginError] = useState('');
    const [activeTab, setActiveTab] = useState('monitoring');
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // System Config State
    const [settings, setSettings] = useState({});
    const [version, setVersion] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null);
    const [showApiKey, setShowApiKey] = useState(false);

    useEffect(() => {
        if (isLoggedIn) {
            fetchAdminData();
            fetchSettings();
            fetchVersion();
        }
    }, [isLoggedIn]);

    const fetchAdminData = async () => {
        setIsLoading(true);
        try {
            const response = await axios.get('/api/admin/clients');
            setData(response.data);
        } catch (err) {
            console.error('Failed to fetch admin data', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchSettings = async () => {
        try {
            const response = await axios.get('/api/settings');
            setSettings(response.data);
        } catch (err) {
            console.error('Failed to fetch settings', err);
        }
    };

    const fetchVersion = async () => {
        try {
            const response = await axios.get('/api/auth/config');
            if (response.data.version) {
                setVersion(response.data.version);
            }
        } catch (err) {
            console.error('Failed to fetch version', err);
        }
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setIsSubmitting(true);
        const result = await login(password);
        if (!result.success) {
            setLoginError(result.message);
        }
        setIsSubmitting(false);
    };

    const handleSaveSettings = async () => {
        setIsSaving(true);
        setSaveStatus(null);
        try {
            await axios.post('/api/settings', settings);
            setSaveStatus('success');
            setTimeout(() => setSaveStatus(null), 3000);
        } catch (err) {
            setSaveStatus('error');
            setTimeout(() => setSaveStatus(null), 3000);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        if (window.confirm('ÄR DU SÄKER? Detta kommer att rensa ALL historik, händelser och push-prenumerationer. API-nyckel och MQTT-inställningar behålls.')) {
            try {
                await axios.post('/api/reset', { confirm: true });
                alert('Systemet har återställts.');
                window.location.reload();
            } catch (err) {
                alert('Misslyckades att återställa systemet.');
            }
        }
    };

    if (!isLoggedIn) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-xl border border-slate-200 dark:border-slate-800"
                >
                    <div className="flex flex-col items-center mb-8">
                        <div className="p-4 bg-blue-500/10 rounded-2xl mb-4">
                            <Shield className="w-10 h-10 text-blue-500" />
                        </div>
                        <h1 className="text-2xl font-bold dark:text-white">Admin Dashboard</h1>
                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center mt-2">
                            Ange administratörslösenordet för att komma åt systeminställningar och flödesstatistik.
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Admin lösenord"
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all dark:text-white"
                                autoFocus
                            />
                        </div>

                        {loginError && (
                            <p className="text-red-500 text-sm text-center animate-pulse">{loginError}</p>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting || !password}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-bold shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Logga in som Admin'}
                        </button>
                    </form>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                        <Shield className="w-8 h-8 text-blue-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold dark:text-white">Admin Dashboard</h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Systemövervakning och konfiguration</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={fetchAdminData}
                        className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                        title="Uppdatera data"
                    >
                        <Clock className={`w-5 h-5 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                        onClick={logout}
                        className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-50/10 rounded-xl transition-colors"
                    >
                        Logga ut
                    </button>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {[
                    { id: 'monitoring', label: 'Övervakning', icon: Monitor },
                    { id: 'connectivity', label: 'Anslutning', icon: Wifi },
                    { id: 'system', label: 'System', icon: SettingsIcon }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                    >
                        <tab.icon className="w-5 h-5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main Content Areas */}
            <div className="grid grid-cols-1 gap-6">
                <AnimatePresence mode="wait">
                    {/* MONITORING TAB */}
                    {activeTab === 'monitoring' && (
                        <motion.div
                            key="monitoring"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            {/* Summary Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Aktiva Klienter</p>
                                    <div className="flex items-center gap-3">
                                        <Smartphone className="w-5 h-5 text-blue-500" />
                                        <h3 className="text-3xl font-bold dark:text-white">{data?.active_clients?.length || 0}</h3>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2">Enheter aktiva de senaste 24 timmarna</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">Push-prenumerationer</p>
                                    <div className="flex items-center gap-3">
                                        <Bell className="w-5 h-5 text-purple-500" />
                                        <h3 className="text-3xl font-bold dark:text-white">{data?.push_subscriptions?.length || 0}</h3>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2">Aktiva endpoint-registreringar i DB</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-1">SSE Anslutningar</p>
                                    <div className="flex items-center gap-3">
                                        <Database className="w-5 h-5 text-green-500" />
                                        <h3 className="text-3xl font-bold dark:text-white">{data?.sse_clients_count || 0}</h3>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2">Realtidsströmmar öppna just nu</p>
                                </div>
                            </div>

                            {/* Clients Table */}
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                    <h3 className="font-bold dark:text-white">Aktiva Enheter (Senaste 24h)</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-[10px] uppercase tracking-widest">
                                                <th className="px-6 py-3">Enhet / ID</th>
                                                <th className="px-6 py-3">OS / Typ</th>
                                                <th className="px-6 py-3">Auth Metod</th>
                                                <th className="px-6 py-3">Bevakade Län</th>
                                                <th className="px-6 py-3">Roll</th>
                                                <th className="px-6 py-3">Senast Aktiv</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {data?.active_clients.map((client) => {
                                                const ua = parseUserAgent(client.user_agent);
                                                return (
                                                    <tr key={client.client_id} className="text-sm dark:text-slate-300">
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-col">
                                                                <span className="font-medium truncate max-w-[200px]" title={client.user_agent}>
                                                                    {ua.device}
                                                                </span>
                                                                <span className="text-[10px] text-slate-400 font-mono">{client.client_id.slice(0, 8)}...</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                {ua.type === 'mobile' ? <Smartphone className="w-4 h-4 text-slate-400" /> : <Monitor className="w-4 h-4 text-slate-400" />}
                                                                <span>{ua.os}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {client.used_password ? (
                                                                <span className="px-2 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-300 rounded text-xs font-mono font-bold">
                                                                    {client.used_password}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs italic">-</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap gap-1">
                                                                {client.counties.split(',').map(c => (
                                                                    <span key={c} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[10px] font-bold">L{c}</span>
                                                                ))}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {client.is_admin ? (
                                                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-[10px] font-bold">ADMIN</span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded text-[10px] font-bold">USER</span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                                                            {new Date(client.last_active).toLocaleTimeString()}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {data?.active_clients.length === 0 && (
                                                <tr>
                                                    <td colSpan="4" className="px-6 py-12 text-center text-slate-400 italic">Inga aktiva klienter hittades.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* CONNECTIVITY TAB */}
                    {activeTab === 'connectivity' && (
                        <motion.div
                            key="connectivity"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-8">
                                {/* API Key Section */}
                                <div>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-2 bg-blue-500/10 rounded-xl">
                                            <Key className="w-6 h-6 text-blue-500" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold dark:text-white">Trafikverket API</h3>
                                            <p className="text-xs text-slate-500">Huvudnyckel för datainhämtning</p>
                                        </div>
                                    </div>
                                    <div className="relative group">
                                        <input
                                            type={showApiKey ? "text" : "password"}
                                            value={settings.api_key || ''}
                                            onChange={(e) => setSettings({ ...settings, api_key: e.target.value })}
                                            className="w-full pl-6 pr-12 py-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all dark:text-white font-mono"
                                            placeholder="Ange API-nyckel..."
                                        />
                                        <button
                                            onClick={() => setShowApiKey(!showApiKey)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                        >
                                            {showApiKey ? <EyeOff className="w-4 h-4 text-slate-400" /> : <Eye className="w-4 h-4 text-slate-400" />}
                                        </button>
                                    </div>
                                </div>

                                {/* MQTT Section */}
                                <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-green-500/10 rounded-xl">
                                                <Wifi className="w-6 h-6 text-green-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold dark:text-white">MQTT Broker</h3>
                                                <p className="text-xs text-slate-500">Externa automationer (Home Assistant)</p>
                                            </div>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={settings.mqtt_enabled === "true"}
                                                onChange={(e) => setSettings({ ...settings, mqtt_enabled: e.target.checked ? "true" : "false" })}
                                                className="sr-only peer"
                                            />
                                            <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-green-600"></div>
                                        </label>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Värdnamn (Host)</label>
                                            <input
                                                type="text"
                                                value={settings.mqtt_host || ''}
                                                onChange={(e) => setSettings({ ...settings, mqtt_host: e.target.value })}
                                                disabled={settings.mqtt_enabled !== "true"}
                                                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                                placeholder=" t.ex. 192.168.1.100"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Port</label>
                                            <input
                                                type="number"
                                                value={settings.mqtt_port || ''}
                                                onChange={(e) => setSettings({ ...settings, mqtt_port: e.target.value })}
                                                disabled={settings.mqtt_enabled !== "true"}
                                                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                                placeholder="1883"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Användarnamn</label>
                                            <input
                                                type="text"
                                                value={settings.mqtt_username || ''}
                                                onChange={(e) => setSettings({ ...settings, mqtt_username: e.target.value })}
                                                disabled={settings.mqtt_enabled !== "true"}
                                                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Lösenord</label>
                                            <input
                                                type="password"
                                                value={settings.mqtt_password || ''}
                                                onChange={(e) => setSettings({ ...settings, mqtt_password: e.target.value })}
                                                disabled={settings.mqtt_enabled !== "true"}
                                                className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                            />
                                        </div>
                                    </div>

                                    {/* MQTT Topics */}
                                    <div className="mt-4 space-y-3">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">MQTT Topics</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Trafik Topic</label>
                                                <input
                                                    type="text"
                                                    value={settings.mqtt_topic || ''}
                                                    onChange={(e) => setSettings({ ...settings, mqtt_topic: e.target.value })}
                                                    disabled={settings.mqtt_enabled !== "true"}
                                                    className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                                    placeholder="trafikinfo/traffic"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Väglag Topic</label>
                                                    <label className="relative inline-flex items-center cursor-pointer scale-75">
                                                        <input
                                                            type="checkbox"
                                                            checked={settings.mqtt_rc_enabled === "true"}
                                                            onChange={(e) => setSettings({ ...settings, mqtt_rc_enabled: e.target.checked ? "true" : "false" })}
                                                            disabled={settings.mqtt_enabled !== "true"}
                                                            className="sr-only peer"
                                                        />
                                                        <div className="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:width-5 after:transition-all peer-checked:bg-green-600"></div>
                                                    </label>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={settings.mqtt_rc_topic || ''}
                                                    onChange={(e) => setSettings({ ...settings, mqtt_rc_topic: e.target.value })}
                                                    disabled={settings.mqtt_enabled !== "true" || settings.mqtt_rc_enabled !== "true"}
                                                    className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-blue-500 disabled:opacity-50 dark:text-white sm:text-sm"
                                                    placeholder="trafikinfo/road_conditions"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Save Button */}
                                <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        {saveStatus === 'success' && (
                                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-green-500 text-sm font-bold">
                                                <CheckCircle2 className="w-4 h-4" /> Sparat!
                                            </motion.span>
                                        )}
                                        {saveStatus === 'error' && (
                                            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="flex items-center gap-1 text-red-500 text-sm font-bold">
                                                <XCircle className="w-4 h-4" /> Fel vid sparning
                                            </motion.span>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleSaveSettings}
                                        disabled={isSaving}
                                        className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                                    >
                                        {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Spara Konfiguration</>}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* SYSTEM TAB */}
                    {activeTab === 'system' && (
                        <motion.div
                            key="system"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-6"
                        >
                            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-8 space-y-8">
                                    {/* Data Retention */}
                                    <div>
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-orange-500/10 rounded-xl">
                                                <Clock className="w-6 h-6 text-orange-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold dark:text-white">Dataåterhållning (Retention)</h3>
                                                <p className="text-xs text-slate-500">Hur länge historiska händelser sparas i databasen</p>
                                            </div>
                                        </div>
                                        <div className="flex items-end gap-4 max-w-sm">
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Kameraradie (km)</label>
                                                <input
                                                    type="number"
                                                    value={settings.camera_radius_km || '5'}
                                                    onChange={(e) => setSettings({ ...settings, camera_radius_km: e.target.value })}
                                                    className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-orange-500 dark:text-white text-sm"
                                                />
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Dagar att behålla</label>
                                                <input
                                                    type="number"
                                                    value={settings.retention_days || '30'}
                                                    onChange={(e) => setSettings({ ...settings, retention_days: e.target.value })}
                                                    className="w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-orange-500 dark:text-white text-sm"
                                                />
                                            </div>
                                            <button
                                                onClick={handleSaveSettings}
                                                className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold transition-colors"
                                            >
                                                Verkställ
                                            </button>
                                        </div>
                                    </div>

                                    {/* Factory Reset */}
                                    <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-red-500/10 rounded-xl">
                                                <AlertTriangle className="w-6 h-6 text-red-500" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-red-600 dark:text-red-500">Kritisk Zon: Fabriksåterställning</h3>
                                                <p className="text-xs text-slate-500">Återställer databasen och rensar alla sparade bilder.</p>
                                            </div>
                                        </div>
                                        <div className="bg-red-500/5 p-6 rounded-2xl border border-red-500/10">
                                            <p className="text-xs text-red-600 dark:text-red-400 mb-6 leading-relaxed">
                                                Varning: Denna åtgärd kommer att ta bort alla trafikolyckor, väglagshändelser, versionshistorik och alla sparade snapshots. Systeminställningar för API och MQTT kommer dock att bevaras.
                                            </p>
                                            <button
                                                onClick={handleReset}
                                                className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-red-600/20 active:scale-95"
                                            >
                                                <Trash2 className="w-4 h-4" /> Utför Fullständig Rensning
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Info Card */}
                            <div className="bg-blue-600 p-8 rounded-3xl shadow-xl shadow-blue-600/20 text-white overflow-hidden relative">
                                <Shield className="absolute right-[-20px] bottom-[-20px] w-48 h-48 text-white/10 rotate-12" />
                                <div className="relative z-10 space-y-4">
                                    <h3 className="text-xl font-bold">Admin Säkerhetsprofil</h3>
                                    <p className="text-blue-100 text-sm max-w-2xl leading-relaxed">
                                        Ditt system körs just nu med versionsnummer {version || '...'}.
                                        Administrative ändringar loggas i systemets loggare och appliceras omedelbart på den underliggande databasen.
                                        Se till att din API-nyckel hålls hemlig och att MQTT-broker endast är exponerad internt för maximal säkerhet.
                                    </p>
                                    <div className="flex gap-4">
                                        <div className="flex items-center gap-2 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full">
                                            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                            Systemet Online
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full">
                                            <CheckCircle2 className="w-3 h-3" />
                                            Verkryptering Aktiv
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default AdminDashboard;
