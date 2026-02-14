import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Clock, AlertTriangle, Camera, Snowflake, Thermometer, Wind, ChevronDown, ChevronUp, Droplets, Zap, Gauge } from 'lucide-react'
import EventMap from './EventMap'

function RoadConditions() {
    const [conditions, setConditions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedMaps, setExpandedMaps] = useState(new Set())
    const [expandedCameras, setExpandedCameras] = useState(new Set())

    // Pagination
    const [offset, setOffset] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [isFetchingMore, setIsFetchingMore] = useState(false)
    const observerTarget = useRef(null)

    // Filtering state
    const [selectedCounties, setSelectedCounties] = useState(() => {
        const saved = localStorage.getItem('roadcond_filter_counties')
        return saved ? saved.split(',').filter(x => x) : []
    })
    const [roadFilter, setRoadFilter] = useState('')
    const [allowedCounties, setAllowedCounties] = useState([])

    const ALL_COUNTIES = [
        { id: 1, name: "Stockholm" },
        { id: 3, name: "Uppsala" },
        { id: 4, name: "Södermanland" },
        { id: 5, name: "Östergötland" },
        { id: 6, name: "Jönköping" },
        { id: 7, name: "Kronoberg" },
        { id: 8, name: "Kalmar" },
        { id: 9, name: "Gotland" },
        { id: 10, name: "Blekinge" },
        { id: 12, name: "Skåne" },
        { id: 13, name: "Halland" },
        { id: 14, name: "Västra Götaland" },
        { id: 17, name: "Värmland" },
        { id: 18, name: "Örebro" },
        { id: 19, name: "Västmanland" },
        { id: 20, name: "Dalarna" },
        { id: 21, name: "Gävleborg" },
        { id: 22, name: "Västernorrland" },
        { id: 23, name: "Jämtland" },
        { id: 24, name: "Västerbotten" },
        { id: 25, name: "Norrbotten" },
    ]

    useEffect(() => {
        const fetchMonitored = () => {
            const saved = localStorage.getItem('localCounties')
            const ids = saved ? saved.split(',') : []
            setAllowedCounties(ALL_COUNTIES.filter(c => ids.includes(c.id.toString())))
        }
        fetchMonitored()
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('App returned to foreground (RoadConditions), refreshing data...')
                fetchConditions(true)
            }
        }
        window.addEventListener('storage', fetchMonitored)
        window.addEventListener('focus', fetchMonitored)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        return () => {
            window.removeEventListener('storage', fetchMonitored)
            window.removeEventListener('focus', fetchMonitored)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [])

    useEffect(() => {
        // Initial fetch or re-fetch when county changes
        setOffset(0)
        setHasMore(true)
        fetchConditions(true)
    }, [selectedCounties]) // Re-fetch when county changes

    // Sync monitored counties from localStorage
    const API_BASE = '/api'

    const fetchConditions = useCallback(async (reset = false) => {
        try {
            if (!reset) setIsFetchingMore(true)
            const currentOffset = reset ? 0 : offset
            const LIMIT = 50

            // Construct URL
            let url = `${API_BASE}/road-conditions?limit=${LIMIT}&offset=${currentOffset}`

            // Handle multi-county selection
            if (selectedCounties.length > 0) {
                const countyParam = selectedCounties.join(',')
                url += `&county_no=${countyParam}`
            }

            const response = await fetch(url)
            if (!response.ok) throw new Error('Failed to fetch road conditions')
            const data = await response.json()

            if (reset) {
                setConditions(data)
                setOffset(LIMIT)
            } else {
                setConditions(prev => {
                    const existingIds = new Set(prev.map(c => c.id))
                    const newItems = data.filter(c => !existingIds.has(c.id))
                    return [...prev, ...newItems]
                })
                setOffset(prev => prev + LIMIT)
            }

            setHasMore(data.length === LIMIT)
            setLoading(false)
            setIsFetchingMore(false)
        } catch (err) {
            setError(err.message)
            setLoading(false)
            setIsFetchingMore(false)
        }
    }, [offset, selectedCounties])

    // SSE for real-time updates
    useEffect(() => {
        const eventSource = new EventSource(`${API_BASE}/stream`)

        eventSource.onmessage = (event) => {
            try {
                const newData = JSON.parse(event.data)
                if (newData.event_type !== 'RoadCondition') return

                setConditions(prev => {
                    // Check if is expired
                    if (newData.end_time && new Date(newData.end_time) < new Date()) {
                        return prev.filter(c => c.id !== newData.id)
                    }

                    // Check if matches selectedCounties
                    if (selectedCounties.length > 0 && !selectedCounties.includes(newData.county_no.toString())) {
                        return prev.filter(c => c.id !== newData.id)
                    }

                    const index = prev.findIndex(c => c.id === newData.id)

                    if (index !== -1) {
                        // Remove existing so we can move updated to top
                        const filtered = prev.filter(c => c.id !== newData.id)
                        return [newData, ...filtered]
                    } else {
                        // Add new to top
                        return [newData, ...prev]
                    }
                })

            } catch (err) {
                console.error('Error parsing SSE event in RoadConditions:', err)
            }
        }

        eventSource.onerror = (err) => {
            console.error('SSE Error in RoadConditions:', err)
        }

        return () => {
            eventSource.close()
        }
    }, [selectedCounties])

    // Infinite Scroll Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !isFetchingMore && !loading) {
                    fetchConditions(false)
                }
            },
            { threshold: 1.0 }
        )

        if (observerTarget.current) {
            observer.observe(observerTarget.current)
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current)
            }
        }
    }, [hasMore, isFetchingMore, loading, fetchConditions])

    const toggleMap = (id) => {
        setExpandedMaps(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                // Close camera if map is opened
                setExpandedCameras(cp => {
                    const cn = new Set(cp)
                    cn.delete(id)
                    return cn
                })
            }
            return next
        })
    }

    const toggleCamera = (id) => {
        setExpandedCameras(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else {
                next.add(id)
                // Close map if camera is opened
                setExpandedMaps(mp => {
                    const mn = new Set(mp)
                    mn.delete(id)
                    return mn
                })
            }
            return next
        })
    }

    const toggleCounty = (countyId) => {
        const idStr = countyId.toString()
        setSelectedCounties(prev => {
            if (countyId === 'Alla') {
                localStorage.removeItem('roadcond_filter_counties')
                return []
            }
            const isSelected = prev.includes(idStr)
            const next = isSelected ? prev.filter(id => id !== idStr) : [...prev, idStr]
            localStorage.setItem('roadcond_filter_counties', next.join(','))
            return next
        })
    }

    const formatValidity = (start, end) => {
        if (!start) return ''
        const startTime = new Date(start).toLocaleTimeString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit'
        })
        const endTime = end ? new Date(end).toLocaleTimeString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit'
        }) : 'tillsvidare'
        return `Gäller: ${startTime} - ${endTime}`
    }

    const getConditionStyle = (rc) => {
        // Base card style - remove border-l as we use absolute div now
        return "bg-white dark:bg-slate-800 relative"
    }

    const getConditionBadgeColor = (code) => {
        switch (code) {
            case 4: return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800'
            case 3: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800'
            case 2: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800'
            default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800'
        }
    }

    const getIcon = (code) => {
        switch (code) {
            case 4: return <Snowflake className="w-5 h-5" />
            case 3: return <AlertTriangle className="w-5 h-5" />
            case 2: return <AlertTriangle className="w-5 h-5" />
            default: return <Thermometer className="w-5 h-5" />
        }
    }

    // Filter active conditions
    const activeConditions = conditions.filter(rc => {
        if (rc.end_time && new Date(rc.end_time) <= new Date()) return false

        // Apply filters
        // County filter is handled by API
        if (roadFilter && rc.road_number && !rc.road_number.toLowerCase().includes(roadFilter.toLowerCase())) return false

        return true
    })

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Laddar väglagsdata...</div>
    if (error) return <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg mx-4 mt-4">Kunde inte ladda väglag: {error}</div>

    return (
        <div className="space-y-4 max-w-5xl mx-auto pb-24">
            {/* Header with Filters */}
            <div className="flex flex-col gap-4 py-4 px-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Snowflake className="w-6 h-6 text-blue-500" />
                        Väglag
                        <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                            {conditions.length} rapporter
                            {selectedCounties.length > 0 && ` i ${selectedCounties.length} län`}
                        </span>
                    </h2>

                    {/* Road Filter Input */}
                    <div className="w-full md:w-auto">
                        <input
                            type="text"
                            placeholder="Filtrera väg..."
                            value={roadFilter}
                            onChange={(e) => setRoadFilter(e.target.value)}
                            className="text-sm rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 px-4 w-full md:w-64 focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* County Filter Chips */}
                <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Län</label>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => toggleCounty('Alla')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedCounties.length === 0
                                ? 'bg-slate-800 text-white border-slate-800 dark:bg-white dark:text-slate-900'
                                : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                }`}
                        >
                            Alla län
                        </button>
                        {allowedCounties.map(county => {
                            const isSelected = selectedCounties.includes(county.id.toString())
                            return (
                                <button
                                    key={county.id}
                                    onClick={() => toggleCounty(county.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isSelected
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                                        }`}
                                >
                                    {county.name}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>

            {activeConditions.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700">
                    <Snowflake className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Inga väglagsrapporter just nu</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Det ser ut att vara lugnt ute på vägarna</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {activeConditions.map((rc) => {
                        const isMapOpen = expandedMaps.has(rc.id)
                        const isCameraOpen = expandedCameras.has(rc.id)

                        return (
                            <div
                                key={rc.id}
                                className={`rounded-xl shadow-sm overflow-hidden transition-all duration-300 ${getConditionStyle(rc)}`}
                            >
                                {/* Warning Border */}
                                {rc.warning && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] z-10 animate-pulse"></div>
                                )}

                                {/* Standard Border (if not warning) */}
                                {!rc.warning && (
                                    <div className={`absolute left-0 top-0 bottom-0 w-1 ${rc.condition_code === 4 ? 'bg-red-500' :
                                        rc.condition_code === 3 ? 'bg-orange-500' :
                                            rc.condition_code === 2 ? 'bg-yellow-500' :
                                                'bg-blue-500'
                                        } shadow-[0_0_10px_rgba(59,130,246,0.5)]`}></div>
                                )}

                                <div className="p-4 sm:p-5 pl-6">
                                    <div className="flex flex-col md:flex-row gap-4">
                                        {/* Left Side: Content */}
                                        <div className="flex-1 min-w-0 space-y-3">
                                            {/* Header Row */}
                                            <div className="flex items-start gap-3">
                                                <div className={`p-2 rounded-full shadow-sm shrink-0 ${getConditionBadgeColor(rc.condition_code)}`}>
                                                    {rc.icon_url ? (
                                                        <img src={rc.icon_url} alt="" className="w-5 h-5 object-contain" />
                                                    ) : (
                                                        getIcon(rc.condition_code)
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight text-base sm:text-lg uppercase">
                                                            {rc.condition_text || 'Okänt väglag'}
                                                        </h3>
                                                        <div className="flex flex-col items-end gap-0.5">
                                                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded-md whitespace-nowrap shrink-0 mt-0.5">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                <span>{formatValidity(rc.start_time, rc.end_time)}</span>
                                                            </div>
                                                            {rc.weather && (
                                                                <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-md whitespace-nowrap shrink-0 mt-0.5 border border-blue-100 dark:border-blue-500/20 shadow-sm">
                                                                    <Thermometer className="w-3 h-3" />
                                                                    <span>
                                                                        {(rc.weather.air_temperature ?? rc.weather.temp) != null
                                                                            ? Number(rc.weather.air_temperature ?? rc.weather.temp).toFixed(1)
                                                                            : '?'}°C
                                                                    </span>
                                                                    <div className="w-px h-2.5 bg-blue-200 dark:bg-blue-500/30"></div>
                                                                    <Wind className="w-3 h-3" />
                                                                    <span>
                                                                        {rc.weather.wind_speed != null ? Number(rc.weather.wind_speed).toFixed(1) : '?'}
                                                                        <span className="text-[10px] font-normal opacity-70 ml-0.5">
                                                                            {(rc.weather.wind_direction ?? rc.weather.wind_dir) ?? ''}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Road Badge & Location */}
                                                    {(rc.road_number || rc.camera_name) && (
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            {rc.road_number && (
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded border shadow-sm flex items-center justify-center min-w-[30px] ${rc.road_number.startsWith('E')
                                                                    ? 'bg-[#00933C] text-white border-white border-[1.5px] shadow'
                                                                    : 'bg-[#006AA7] text-white border-white border-[1.5px] border-dotted'
                                                                    }`}>
                                                                    {rc.road_number.replace(/^Väg\s+/, '')}
                                                                </span>
                                                            )}

                                                            {/* Location next to road number */}
                                                            {(rc.camera_name || rc.location_text) && (
                                                                <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-sm font-medium">
                                                                    <MapPin className="w-3.5 h-3.5" />
                                                                    <span>{rc.location_text || rc.camera_name}</span>
                                                                    {rc.location_text && rc.camera_name && rc.location_text !== rc.camera_name && (
                                                                        <span className="text-xs opacity-60 ml-1 hidden sm:inline">({rc.camera_name})</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* County Badge */}
                                                            {rc.county_no && (
                                                                <span className="text-[10px] items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hidden sm:flex">
                                                                    {ALL_COUNTIES.find(c => c.id === rc.county_no)?.name || `Län ${rc.county_no}`}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Description Content */}
                                            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed pl-1 pt-1">

                                                {/* ORSAK (Cause) */}
                                                {rc.cause && (
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Orsak</span>
                                                        <span className="font-medium text-slate-800 dark:text-slate-200">{rc.cause}</span>
                                                    </div>
                                                )}

                                                {/* VARNING (Warning) */}
                                                {rc.warning && (
                                                    <div className={`p-3 rounded-lg border flex items-start gap-3 ${rc.warning.toLowerCase().includes('halka')
                                                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                                                        : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-200'
                                                        }`}>
                                                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                                                        <div>
                                                            <span className="block text-[10px] uppercase tracking-wider font-bold opacity-75 mb-0.5">Varning</span>
                                                            <span className="font-bold">{rc.warning}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ÅTGÄRD (Measure) */}
                                                {rc.measure && (
                                                    <div className="pl-3 border-l-2 border-blue-200 dark:border-blue-800 py-0.5">
                                                        <span className="block text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-0.5">Åtgärd</span>
                                                        <span className="text-slate-700 dark:text-slate-300">{rc.measure}</span>
                                                    </div>
                                                )}

                                                {/* VÄGYTA (Surface Data) */}
                                                {(rc.weather && (rc.weather.road_temperature !== undefined || rc.weather.grip !== undefined)) && (
                                                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-inner">
                                                        <div className="flex items-center gap-2 mb-2.5">
                                                            <div className="p-1 bg-blue-100 dark:bg-blue-900/40 rounded-md">
                                                                <Gauge className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                                            </div>
                                                            <span className="text-[10px] uppercase tracking-widest font-black text-slate-500 dark:text-slate-400">Vägyta & Friktion</span>
                                                        </div>

                                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                            {/* Road Temperature */}
                                                            {rc.weather.road_temperature !== undefined && (
                                                                <div className="flex flex-col">
                                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold">Vägtemp</span>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <Thermometer className="w-3.5 h-3.5 text-blue-500" />
                                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{rc.weather.road_temperature}°C</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Grip */}
                                                            {rc.weather.grip !== undefined && (
                                                                <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-3">
                                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold">Friktion</span>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <Zap className={`w-3.5 h-3.5 ${rc.weather.grip < 0.25 ? 'text-red-500' : rc.weather.grip < 0.4 ? 'text-orange-500' : 'text-green-500'}`} />
                                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{rc.weather.grip.toFixed(2)}</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Ice depth */}
                                                            {rc.weather.ice_depth !== undefined && rc.weather.ice_depth > 0 && (
                                                                <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-3">
                                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold">Isdjup</span>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <Snowflake className="w-3.5 h-3.5 text-cyan-400" />
                                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{rc.weather.ice_depth}mm</span>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Snow depth */}
                                                            {rc.weather.snow_depth !== undefined && rc.weather.snow_depth > 0 && (
                                                                <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-3">
                                                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 uppercase font-bold">Snö</span>
                                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                                        <Droplets className="w-3.5 h-3.5 text-blue-300" />
                                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{rc.weather.snow_depth}mm</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* (Location moved to header) */}
                                            </div>
                                        </div>

                                        {/* Right Side: Camera & Map Side-by-Side */}
                                        <div className="flex flex-col lg:flex-row justify-between items-stretch gap-4 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700/50 pt-4 md:pt-0 md:pl-6 max-w-full overflow-hidden shrink-0">
                                            <div className="flex flex-row gap-2 w-full md:w-auto mt-2 md:mt-0 flex-shrink-0">
                                                {/* Camera Slot */}
                                                <div
                                                    className={`relative w-1/2 md:w-40 h-24 sm:h-28 rounded-lg overflow-hidden border transition-all duration-300 group/camera flex items-center justify-center flex-shrink-0 cursor-zoom-in ${isCameraOpen ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50 dark:bg-blue-500/10' : 'bg-slate-200 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
                                                    onClick={(e) => {
                                                        if (rc.camera_snapshot) {
                                                            e.stopPropagation();
                                                            toggleCamera(rc.id)
                                                        }
                                                    }}
                                                >
                                                    {rc.camera_snapshot ? (
                                                        <img
                                                            src={rc.snapshot_url}
                                                            alt={rc.camera_name || 'Väglagskamera'}
                                                            className="w-full h-full object-cover group-hover/camera:scale-105 transition-transform duration-500 z-10"
                                                        />
                                                    ) : (
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 z-0">
                                                            <Camera className="w-8 h-8 mb-1 opacity-20" />
                                                            <span className="text-[10px] italic lg:block hidden">Ingen bild</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Map Slot */}
                                                <div
                                                    className={`relative w-1/2 md:w-40 h-24 sm:h-28 rounded-lg overflow-hidden border transition-all duration-300 group/map cursor-pointer ${isMapOpen ? 'border-blue-500 ring-2 ring-blue-500/20' : 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        toggleMap(rc.id)
                                                    }}
                                                >
                                                    {rc.latitude && rc.longitude ? (
                                                        <EventMap
                                                            lat={rc.latitude}
                                                            lng={rc.longitude}
                                                            interactive={false}
                                                        />
                                                    ) : (
                                                        <div className="h-full flex items-center justify-center text-slate-400">
                                                            <MapPin className="w-6 h-6 opacity-20" />
                                                        </div>
                                                    )}

                                                    {/* Overlay hint */}
                                                    <div className="absolute inset-0 bg-black/5 group-hover/map:bg-black/10 transition-colors pointer-events-none flex items-center justify-center opacity-0 group-hover/map:opacity-100 z-20">
                                                        <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm">
                                                            Förstora
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Map Area */}
                                    {isMapOpen && rc.latitude && rc.longitude && (
                                        <div className="h-80 w-full relative z-0 border-t border-slate-200 dark:border-slate-700">
                                            <EventMap
                                                lat={rc.latitude}
                                                lng={rc.longitude}
                                                popupContent={`${rc.condition_text || ''} ${rc.warning || ''}`}
                                                interactive={true}
                                            />
                                        </div>
                                    )}

                                    {/* Expanded Camera Area */}
                                    {isCameraOpen && rc.camera_snapshot && (
                                        <div className="relative bg-slate-900 aspect-video rounded-b-xl overflow-hidden border-t border-slate-200 dark:border-slate-700 group/expanded">
                                            {/* Blurred Background to eliminate "sorgkanter" */}
                                            <div className="absolute inset-0 overflow-hidden">
                                                <img
                                                    src={rc.snapshot_url}
                                                    alt=""
                                                    className="w-full h-full object-cover blur-3xl opacity-40 scale-110"
                                                />
                                            </div>

                                            {/* Main Image */}
                                            <img
                                                src={rc.snapshot_url}
                                                alt={rc.camera_name || "Väglagskamera"}
                                                className="relative w-full h-full object-contain z-10"
                                                loading="lazy"
                                            />

                                            {/* Overlay Info */}
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 z-20 opacity-0 group-hover/expanded:opacity-100 transition-opacity duration-300">
                                                <p className="text-white text-sm font-bold flex items-center gap-2">
                                                    <Camera className="w-4 h-4 text-blue-400" />
                                                    {rc.camera_name || `Kamera vid väg ${rc.road_number}`}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Load More Button */}
            {/* Infinite Scroll Loader */}
            <div ref={observerTarget} className="py-8 flex justify-center w-full">
                {isFetchingMore && (
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-xs font-medium animate-pulse">Laddar fler rapporter...</span>
                    </div>
                )}
                {!hasMore && conditions.length > 0 && (
                    <div className="text-slate-400 text-xs font-medium">
                        Inga fler rapporter att visa
                    </div>
                )}
            </div>
        </div>
    )
}

export default RoadConditions

