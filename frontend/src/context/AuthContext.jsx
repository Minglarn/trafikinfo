import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [appAuth, setAppAuth] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [clientId] = useState(() => {
        let id = localStorage.getItem('flux_client_id');
        if (!id) {
            // Fallback for non-secure contexts (HTTP)
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                id = crypto.randomUUID();
            } else {
                id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                    return v.toString(16);
                });
            }
            localStorage.setItem('flux_client_id', id);
        }
        return id;
    });

    useEffect(() => {
        // Set default header for all requests
        axios.defaults.headers.common['X-Client-ID'] = clientId;

        const initAuth = async () => {
            // 0. Check Auth Config (No Login Mode)
            try {
                const configRes = await axios.get('/api/auth/config');
                if (configRes.data.auth_required === false) {
                    setAppAuth(true);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.warn("Could not fetch auth config", e);
            }

            // 1. Check App Session (Cookie based)
            try {
                await axios.get('/api/auth/app-check');
                setAppAuth(true);
            } catch (err) {
                setAppAuth(false);
            }

            // 2. Check Admin Session (Token based)
            const token = localStorage.getItem('admin_token');
            if (token) {
                try {
                    await axios.get('/api/auth/check', {
                        headers: { 'X-Admin-Token': token }
                    });
                    setIsLoggedIn(true);
                    axios.defaults.headers.common['X-Admin-Token'] = token;
                } catch (error) {
                    console.error('Admin Auth verification failed', error);
                    localStorage.removeItem('admin_token');
                    delete axios.defaults.headers.common['X-Admin-Token'];
                    setIsLoggedIn(false);
                }
            }

            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = async (password) => {
        try {
            const response = await axios.post('/api/auth/login', { password });
            const { token } = response.data;
            localStorage.setItem('admin_token', token);
            axios.defaults.headers.common['X-Admin-Token'] = token;
            setIsLoggedIn(true);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.detail || 'Inloggning misslyckades'
            };
        }
    };

    const appLogin = async (password) => {
        try {
            await axios.post('/api/auth/app-login', { password });
            setAppAuth(true);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.detail || 'Ogiltigt lösenord'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('admin_token');
        delete axios.defaults.headers.common['X-Admin-Token'];
        setIsLoggedIn(false);
    };

    const appLogout = async () => {
        try {
            await axios.get('/api/auth/logout');
        } catch (e) { }
        setAppAuth(false);
    };

    return (
        <AuthContext.Provider value={{ isLoggedIn, appAuth, isLoading, login, logout, appLogin, appLogout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
