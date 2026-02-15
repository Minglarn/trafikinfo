import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [appAuth, setAppAuth] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
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
