import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { Activity, AlertTriangle, TrendingUp, Truck, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { format, subDays, addDays, isToday, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'
import EventModal from './EventModal'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d']
const SEVERITY_COLORS = {
    'Ingen påverkan': '#94a3b8',
    'Liten påverkan': '#eab308',
    'Stor påverkan': '#f97316',
    'Mycket stor påverkan': '#ef4444',
    'Okänd': '#cbd5e1'
}

export default function Statistics() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [selectedDate, setSelectedDate] = useState(new Date())
    const [events, setEvents] = useState([])
    const [selectedEvent, setSelectedEvent] = useState(null)

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const dateStr = format(selectedDate, 'yyyy-MM-dd')
                const [statsRes, eventsRes] = await Promise.all([
                    axios.get(`/api/stats?date=${dateStr}`),
                    axios.get(`/api/events?limit=200&date=${dateStr}`)
                ])
                setData(statsRes.data)
                setEvents(eventsRes.data)
            } catch (error) {
                console.error("Error fetching stats:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [selectedDate])

    const goToPreviousDay = () => setSelectedDate(prev => subDays(prev, 1))
    const goToNextDay = () => {
        if (!isToday(selectedDate)) {
            setSelectedDate(prev => addDays(prev, 1))
        }
    }
    const goToToday = () => setSelectedDate(new Date())

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400">Laddar statistik...</p>
            </div>
        )
    }

    if (!data) return null

    // Calculate some quick stats
    const totalAccidents = data.by_type.find(t => t.name === 'Olycka')?.value || 0
    const totalRoadworks = data.by_type.find(t => t.name === 'Vägarbete')?.value || 0
    const highImpact = data.by_severity.filter(s => s.name.includes('Stor')).reduce((acc, curr) => acc + curr.value, 0)

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Trafikstatistik</h2>
                    <p className="text-slate-500 dark:text-slate-400">
                        {isToday(selectedDate) ? 'Översikt för idag' : `Statistik för ${format(selectedDate, 'd MMMM yyyy', { locale: sv })}`}
                    </p>
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button
                        onClick={goToPreviousDay}
                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors text-slate-600 dark:text-slate-400"
                        title="Föregående dag"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>

                    <div className="px-4 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-2 min-w-[160px] justify-center">
                        <Calendar className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {isToday(selectedDate) ? 'Idag' : format(selectedDate, 'yyyy-MM-dd')}
                        </span>
                    </div>

                    <button
                        onClick={goToNextDay}
                        disabled={isToday(selectedDate)}
                        className={`p-2 rounded-xl transition-colors ${isToday(selectedDate)
                            ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                        title="Nästa dag"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>

                    {!isToday(selectedDate) && (
                        <button
                            onClick={goToToday}
                            className="ml-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
                        >
                            Tillbaka till idag
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                    title="Totalt antal händelser"
                    value={data.total}
                    icon={Activity}
                    color="blue"
                    trend={data.timeline.length > 0 ? "+12%" : "0%"} // Mock trend for now
                />
                <StatCard
                    title="Olyckor"
                    value={totalAccidents}
                    icon={AlertTriangle}
                    color="red"
                />
                <StatCard
                    title="Vägarbeten"
                    value={totalRoadworks}
                    icon={Truck}
                    color="orange"
                />
                <StatCard
                    title="Stora störningar"
                    value={highImpact}
                    icon={TrendingUp}
                    color="purple"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Event Types Chart */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Händelsetyp</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.by_type} layout="vertical" margin={{ left: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis type="number" stroke="#94a3b8" />
                                <YAxis dataKey="name" type="category" stroke="#94a3b8" width={100} tick={{ fontSize: 12 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="value" name="Antal" radius={[0, 4, 4, 0]}>
                                    {data.by_type.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Severity Pie Chart */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Fördelning av påverkan</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.by_severity}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {data.by_severity.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Timeline Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-6">Händelsevolym över tid</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data.timeline}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                <XAxis
                                    dataKey="time"
                                    stroke="#94a3b8"
                                    tickFormatter={(str) => str.split(' ')[1]}
                                />
                                <YAxis stroke="#94a3b8" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    labelFormatter={(label) => label}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="count"
                                    stroke="#3b82f6"
                                    strokeWidth={3}
                                    dot={{ r: 4, strokeWidth: 2 }}
                                    activeDot={{ r: 8 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Event List */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mt-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-500" />
                            Händelselista för dagen
                        </h3>
                        <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700">
                            {events.length} händelser
                        </span>
                    </div>

                    <div className="space-y-3">
                        {events.map(event => (
                            <div
                                key={event.id}
                                onClick={() => setSelectedEvent(event)}
                                className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-900/30 transition-all cursor-pointer group shadow-sm"
                            >
                                {event.icon_url && (
                                    <div className="w-10 h-10 p-2 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex-shrink-0 group-hover:scale-110 transition-transform">
                                        <img src={event.icon_url} alt="" className="w-full h-full object-contain" />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                            {format(new Date(event.created_at), 'HH:mm')}
                                        </span>
                                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                            {event.title}
                                        </h4>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                        {event.location}
                                    </p>
                                </div>
                                <div className="flex-shrink-0">
                                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 transition-colors" />
                                </div>
                            </div>
                        ))}
                        {events.length === 0 && (
                            <div className="py-12 text-center text-slate-400 italic text-sm">
                                Inga händelser registrerade denna dag.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Event Modal */}
            {selectedEvent && (
                <EventModal
                    event={selectedEvent}
                    onClose={() => setSelectedEvent(null)}
                />
            )}
        </div>
    )
}

function StatCard({ title, value, icon: Icon, color, trend }) { // eslint-disable-line no-unused-vars
    const colorClasses = {
        blue: 'bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
        red: 'bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400',
        orange: 'bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400',
        purple: 'bg-purple-100 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400',
    }

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-sm hover:shadow-md transition-shadow">
            <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
                <h4 className="text-3xl font-bold text-slate-900 dark:text-white">{value}</h4>
                {trend && <span className="text-xs text-green-500 font-medium mt-1 inline-block">{trend} vs förra perioden</span>}
            </div>
            <div className={`p-4 rounded-xl ${colorClasses[color] || colorClasses.blue}`}>
                <Icon className="w-6 h-6" />
            </div>
        </div>
    )
}
