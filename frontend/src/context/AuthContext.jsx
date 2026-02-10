import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('admin_token');
        if (token) {
            checkAuth(token);
        } else {
            setIsLoading(false);
        }
    }, []);

    const checkAuth = async (token) => {
        try {
            await axios.get('/api/auth/check', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setIsLoggedIn(true);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        } catch (error) {
            console.error('Auth verification failed', error);
            localStorage.removeItem('admin_token');
            delete axios.defaults.headers.common['Authorization'];
            setIsLoggedIn(false);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (password) => {
        try {
            const response = await axios.post('/api/auth/login', { password });
            const { token } = response.data;
            localStorage.setItem('admin_token', token);
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            setIsLoggedIn(true);
            return { success: true };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.detail || 'Inloggning misslyckades'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('admin_token');
        delete axios.defaults.headers.common['Authorization'];
        setIsLoggedIn(false);
    };

    return (
        <AuthContext.Provider value={{ isLoggedIn, isLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
