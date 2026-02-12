import React, { useState, useEffect } from 'react'
import { MapPin, Clock, AlertTriangle, Camera, Snowflake, Thermometer } from 'lucide-react'

function RoadConditions() {
    const [conditions, setConditions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedImage, setSelectedImage] = useState(null)

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
            // Sort by severity (ConditionCode is 4=Worst, 1=Normal) or timestamp
            // Let's sort by timestamp desc, then severity
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

    const getConditionColor = (code) => {
        switch (code) {
            case 4: return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800' // Is/Snö
            case 3: return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800' // Mycket besvärligt
            case 2: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800' // Besvärligt
            default: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800' // Normalt
        }
    }

    const getIcon = (code) => {
        switch (code) {
            case 4: return <Snowflake className="w-5 h-5 flex-shrink-0 mt-0.5" />
            case 3: return <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            case 2: return <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            default: return <Thermometer className="w-5 h-5 flex-shrink-0 mt-0.5" />
        }
    }

    if (loading) return <div className="p-4 text-center text-slate-500">Laddar väglag...</div>
    if (error) return <div className="p-4 text-center text-red-500">Kunde inte ladda väglag: {error}</div>

    return (
        <div className="space-y-4 max-w-3xl mx-auto pb-20">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <Snowflake className="w-6 h-6 text-blue-500" />
                Väglag
            </h2>

            {conditions.length === 0 ? (
                <div className="text-center py-10 text-slate-500 dark:text-slate-400">
                    Inga väglagsrapporter tillgängliga just nu.
                </div>
            ) : (
                conditions.map((rc) => (
                    <div
                        key={rc.id}
                        className={`rounded-lg border shadow-sm overflow-hidden bg-white dark:bg-slate-900 transition-all hover:shadow-md ${getConditionColor(rc.condition_code)} border-l-4`}
                        style={{ borderLeftColor: rc.condition_code === 4 ? '#ef4444' : rc.condition_code === 3 ? '#f97316' : rc.condition_code === 2 ? '#eab308' : '#22c55e' }}
                    >
                        <div className="p-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        {getIcon(rc.condition_code)}
                                        <h3 className="font-semibold text-lg">{rc.condition_text || 'Okänt väglag'}</h3>
                                    </div>

                                    {rc.road_number && (
                                        <div className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium mb-2 border border-slate-200 dark:border-slate-700">
                                            Väg {rc.road_number}
                                        </div>
                                    )}

                                    <div className="space-y-1 text-sm mt-2 opacity-90">
                                        {rc.warning && (
                                            <div className="flex items-start gap-2 text-red-700 dark:text-red-300 font-medium">
                                                <AlertTriangle className="w-4 h-4 mt-0.5" />
                                                <span>{rc.warning}</span>
                                            </div>
                                        )}
                                        {rc.measure && (
                                            <div className="flex items-start gap-2">
                                                <span className="font-semibold">Åtgärd:</span>
                                                <span>{rc.measure}</span>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-4 text-xs mt-3 opacity-75">
                                            {rc.start_time && (
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>{new Date(rc.start_time).toLocaleString('sv-SE', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {rc.camera_snapshot && (
                                    <div className="flex flex-col items-end gap-2">
                                        <div
                                            className="relative w-32 h-24 bg-slate-200 dark:bg-slate-800 rounded-md overflow-hidden cursor-pointer border border-slate-300 dark:border-slate-700 shadow-sm group"
                                            onClick={() => setSelectedImage({ url: rc.snapshot_url, title: rc.camera_name || rc.road_number })}
                                        >
                                            <img
                                                src={rc.snapshot_url}
                                                alt={rc.camera_name || "Väglagskamera"}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                                                <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                                            </div>
                                        </div>
                                        {rc.camera_name && <span className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[8rem] truncate">{rc.camera_name}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))
            )}

            {/* Image Modal */}
            {selectedImage && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
                    onClick={() => setSelectedImage(null)}
                >
                    <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
                        <img
                            src={selectedImage.url}
                            alt={selectedImage.title}
                            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl border border-slate-800"
                        />
                        <h3 className="text-white mt-4 font-medium text-lg">{selectedImage.title}</h3>
                        <button
                            className="absolute -top-10 right-0 text-white hover:text-gray-300 p-2"
                            onClick={() => setSelectedImage(null)}
                        >
                            Stäng
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default RoadConditions
