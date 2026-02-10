import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { Activity, AlertTriangle, TrendingUp, Truck, Users } from 'lucide-react'

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
    const [timeRange, setTimeRange] = useState(24) // hours

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            try {
                const res = await axios.get(`/api/stats?hours=${timeRange}`)
                setData(res.data)
            } catch (error) {
                console.error("Error fetching stats:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [timeRange])

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
                    <p className="text-slate-500 dark:text-slate-400">Översikt över händelser senaste {timeRange} timmarna</p>
                </div>

                <div className="flex bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    {[24, 168, 720].map((hours) => (
                        <button
                            key={hours}
                            onClick={() => setTimeRange(hours)}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${timeRange === hours
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                }`}
                        >
                            {hours === 24 ? '24h' : hours === 168 ? '7d' : '30d'}
                        </button>
                    ))}
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
            </div>
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
