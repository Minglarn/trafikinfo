import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Loader2, ArrowRight } from 'lucide-react';

const SessionGate = ({ children }) => {
    const { appAuth, isLoading, appLogin } = useAuth();
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-[9999]">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            </div>
        );
    }

    if (appAuth) {
        return children;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        const result = await appLogin(password);
        if (!result.success) {
            setError(result.message);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0a0a0a] z-[9999] flex flex-col items-center justify-center p-6 sm:p-0">
            {/* Background decorative elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

            <div className="w-full max-w-sm">
                <div className="bg-[#111] border border-[#222] rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 border border-blue-500/20">
                            <Lock className="w-8 h-8 text-blue-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Trafikinfo Flux</h1>
                        <p className="text-gray-400 text-center text-sm">
                            Vänligen ange lösenordet för att få tillgång till realtidsinformation.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Lösenord"
                                className={`w-full bg-[#1a1a1a] border ${error ? 'border-red-500/50' : 'border-[#333]'} text-white px-5 py-4 rounded-2xl outline-none focus:border-blue-500/50 transition-all text-center tracking-widest`}
                                autoFocus
                                disabled={isSubmitting}
                            />
                            {error && (
                                <p className="text-red-500 text-xs mt-2 text-center animate-pulse">
                                    {error}
                                </p>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !password}
                            className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-semibold transition-all ${isSubmitting || !password
                                    ? 'bg-[#222] text-gray-500 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20 active:scale-[0.98]'
                                }`}
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    Logga in
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-[#222] text-center">
                        <p className="text-[10px] text-gray-600 uppercase tracking-widest font-medium">
                            Sekretessläge Aktiverat
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SessionGate;
