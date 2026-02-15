import React, { useState, useEffect } from 'react';
import { LayoutGrid, Map as MapIcon, Star } from 'lucide-react';
import RoadCameraMap from './RoadCameraMap';
import CameraGrid from './CameraGrid';

const RoadCameraDashboard = () => {
    const [viewMode, setViewMode] = useState(null); // 'grid' or 'map'
    const [favoriteCount, setFavoriteCount] = useState(0);

    useEffect(() => {
        const checkFavorites = () => {
            const saved = localStorage.getItem('camera_favorites');
            const favs = saved ? saved.split(',').filter(id => id.length > 0) : [];
            setFavoriteCount(favs.length);

            // Set initial view mode based on favorites if not already set
            if (viewMode === null) {
                setViewMode(favs.length > 0 ? 'grid' : 'map');
            }
        };

        checkFavorites();
        // Listen for internal changes (toggles in children)
        window.addEventListener('camera-favorites-changed', checkFavorites);
        return () => window.removeEventListener('camera-favorites-changed', checkFavorites);
    }, [viewMode]);

    if (viewMode === null) return null;

    return (
        <div className="flex flex-col h-full space-y-4">
            {/* Contextual Header with View Switcher */}
            <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${viewMode === 'grid' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'}`}>
                        {viewMode === 'grid' ? <Star className="w-5 h-5 fill-current" /> : <MapIcon className="w-5 h-5" />}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-white leading-tight">
                            {viewMode === 'grid' ? 'Mina Favoritkameror' : 'Hitta Kameror'}
                        </h2>
                        <p className="text-xs text-slate-500">
                            {viewMode === 'grid'
                                ? `Visar dina ${favoriteCount} sparade kameror`
                                : 'Använd kartan för att utforska och spara favoriter'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid'
                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <LayoutGrid className="w-4 h-4" />
                        <span>Grid</span>
                    </button>
                    <button
                        onClick={() => setViewMode('map')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'map'
                                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        <MapIcon className="w-4 h-4" />
                        <span>Karta</span>
                    </button>
                </div>
            </div>

            {/* View Content */}
            <div className="flex-1 min-h-0">
                {viewMode === 'grid' ? <CameraGrid /> : <RoadCameraMap />}
            </div>
        </div>
    );
};

export default RoadCameraDashboard;
