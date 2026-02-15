import React from 'react';
import { X, Sparkles, CheckCircle2 } from 'lucide-react';

const WhatIsNewModal = ({ isOpen, onClose, content }) => {
    if (!isOpen) return null;

    // Simple markdown-ish parser for the changelog content
    const renderContent = (text) => {
        if (!text) return null;

        return text.split('\n').map((line, i) => {
            if (line.startsWith('## ')) {
                return <h2 key={i} className="text-xl font-bold text-white mb-4 mt-2">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('### ')) {
                const title = line.replace('### ', '');
                let icon = <CheckCircle2 className="w-4 h-4 text-blue-400" />;
                if (title.toLowerCase().includes('added')) icon = <Sparkles className="w-4 h-4 text-amber-400" />;

                return (
                    <h3 key={i} className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 mt-6 flex items-center gap-2">
                        {icon}
                        {title}
                    </h3>
                );
            }
            if (line.startsWith('- ')) {
                // Handle bold text in list items
                const parts = line.replace('- ', '').split('**');
                return (
                    <li key={i} className="text-slate-300 text-sm mb-2 ml-4 list-none flex gap-2">
                        <span className="text-blue-500 mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-blue-500" />
                        <span>
                            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-white font-semibold">{part}</strong> : part)}
                        </span>
                    </li>
                );
            }
            if (line.trim() === '') return <div key={i} className="h-2" />;
            return <p key={i} className="text-slate-400 text-sm mb-2">{line}</p>;
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
                {/* Header */}
                <div className="relative p-6 pb-0">
                    <button
                        onClick={onClose}
                        className="absolute top-6 right-6 p-2 rounded-xl bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                            <Sparkles className="w-6 h-6 text-blue-500" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Nyheter i FLUX</h1>
                            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Senaste uppdateringen</p>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 pt-4 custom-scrollbar">
                    <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-5">
                        {renderContent(content)}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 mt-2">
                    <button
                        onClick={onClose}
                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-900/20 active:scale-[0.98]"
                    >
                        Häftigt, jag förstår!
                    </button>
                    <p className="text-center text-[10px] text-slate-600 mt-3 font-medium uppercase tracking-tighter italic">
                        Tack för att du använder TrafikInfo FLUX
                    </p>
                </div>
            </div>
        </div>
    );
};

export default WhatIsNewModal;
