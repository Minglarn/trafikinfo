import React, { useState, useEffect } from 'react'
import { MapPin, Clock, AlertTriangle, Camera, Snowflake, Thermometer, ChevronDown, ChevronUp } from 'lucide-react'
import EventMap from './EventMap'

function RoadConditions() {
    const [conditions, setConditions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [expandedMaps, setExpandedMaps] = useState(new Set())
    const [expandedCameras, setExpandedCameras] = useState(new Set())

    // Filtering state
    const [selectedCounty, setSelectedCounty] = useState('Alla')
    const [roadFilter, setRoadFilter] = useState('')

    const COUNTIES = {
        1: "Stockholms län",
        3: "Uppsala län",
        4: "Södermanlands län",
        5: "Östergötlands län",
        6: "Jönköpings län",
        7: "Kronobergs län",
        8: "Kalmar län",
        9: "Gotlands län",
        10: "Blekinge län",
        12: "Skåne län",
        13: "Hallands län",
        14: "Västra Götalands län",
        17: "Värmlands län",
        18: "Örebro län",
        19: "Västmanlands län",
        20: "Dalarnas län",
        21: "Gävleborgs län",
        22: "Västernorrlands län",
        23: "Jämtlands län",
        24: "Västerbottens län",
        25: "Norrbottens län"
    }

    useEffect(() => {
        fetchConditions()
        const interval = setInterval(fetchConditions, 60000) // Refresh every minute
        return () => clearInterval(interval)
    }, [])

    const fetchConditions = async () => {
        try {
            const response = await fetch('/api/road-conditions')
            if (!response.ok) throw new Error('Failed to fetch road conditions')
            const data = await response.json()
            // Sort by timestamp desc to show newest first
            const sorted = data.sort((a, b) => {
                return new Date(b.timestamp) - new Date(a.timestamp)
            })
            setConditions(sorted)
            setLoading(false)
        } catch (err) {
            setError(err.message)
            setLoading(false)
        }
    }

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

    const getConditionStyle = (code) => {
        // Match EventFeed styling: White/Dark background with colored left border
        const baseStyle = "bg-white dark:bg-slate-800 border-l-4"
        switch (code) {
            case 4: return `${baseStyle} border-l-red-500 border-slate-200 dark:border-slate-700`
            case 3: return `${baseStyle} border-l-orange-500 border-slate-200 dark:border-slate-700`
            case 2: return `${baseStyle} border-l-yellow-500 border-slate-200 dark:border-slate-700`
            default: return `${baseStyle} border-l-blue-500 border-slate-200 dark:border-slate-700`
        }
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
        if (selectedCounty !== 'Alla' && rc.county_no !== parseInt(selectedCounty)) return false
        if (roadFilter && rc.road_number && !rc.road_number.toLowerCase().includes(roadFilter.toLowerCase())) return false

        return true
    })

    // Get unique counties from data for filter dropdown
    const availableCounties = [...new Set(conditions.map(c => c.county_no))].sort((a, b) => a - b)

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Laddar väglagsdata...</div>
    if (error) return <div className="p-8 text-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-lg mx-4 mt-4">Kunde inte ladda väglag: {error}</div>

    return (
        <div className="space-y-4 max-w-5xl mx-auto pb-24">
            {/* Header with Filters */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 px-1">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Snowflake className="w-6 h-6 text-blue-500" />
                    Väglag
                    <span className="ml-2 text-xs font-normal text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                        {activeConditions.length} rapporter
                        {selectedCounty !== 'Alla' && ` i ${COUNTIES[selectedCounty] || 'Valt län'}`}
                    </span>
                </h2>

                {/* Filters */}
                <div className="flex flex-row gap-2">
                    <select
                        value={selectedCounty}
                        onChange={(e) => setSelectedCounty(e.target.value)}
                        className="text-sm rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-3 focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="Alla">Alla län</option>
                        {availableCounties.map(c_id => (
                            <option key={c_id} value={c_id}>{COUNTIES[c_id] || `Län ${c_id}`}</option>
                        ))}
                    </select>

                    <input
                        type="text"
                        placeholder="Filtrera väg..."
                        value={roadFilter}
                        onChange={(e) => setRoadFilter(e.target.value)}
                        className="text-sm rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 px-3 w-32 focus:ring-2 focus:ring-blue-500"
                    />
                </div>
            </div>

            {activeConditions.length === 0 ? (
                <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700">
                    <Snowflake className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Inga väglagsrapporter just nu</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">Det ser ut att vara lugnt ute på vägarna</p>
                </div>
            ) : (
                activeConditions.map((rc) => {
                    const isMapOpen = expandedMaps.has(rc.id)
                    const isCameraOpen = expandedCameras.has(rc.id)

                    return (
                        <div
                            key={rc.id}
                            className={`rounded-xl shadow-sm overflow-hidden transition-all duration-300 ${getConditionStyle(rc.condition_code)}`}
                        >
                            <div className="p-4 sm:p-5">
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
                                                        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0 mt-0.5">
                                                            <Clock className="w-3.5 h-3.5" />
                                                            <span>
                                                                {new Date(rc.start_time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        {rc.end_time && (
                                                            <span className="text-[10px] text-slate-400">
                                                                Till {new Date(rc.end_time).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
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
                                                        {rc.camera_name && (
                                                            <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-sm font-medium">
                                                                <MapPin className="w-3.5 h-3.5" />
                                                                <span>{rc.camera_name}</span>
                                                            </div>
                                                        )}

                                                        {/* County Badge */}
                                                        {rc.county_no && (
                                                            <span className="text-[10px] items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hidden sm:flex">
                                                                {COUNTIES[rc.county_no] || `Län ${rc.county_no}`}
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
                                <div className="relative bg-black aspect-video sm:aspect-[21/9] border-t border-slate-200 dark:border-slate-700">
                                    <img
                                        src={rc.snapshot_url}
                                        alt={rc.camera_name || "Väglagskamera"}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                        <p className="text-white text-xs font-medium flex items-center gap-2">
                                            <Camera className="w-3 h-3" />
                                            {rc.camera_name || `Kamera vid väg ${rc.road_number}`}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })
            )}
        </div>
    )
}

export default RoadConditions
