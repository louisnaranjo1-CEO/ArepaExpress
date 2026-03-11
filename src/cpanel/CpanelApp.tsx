import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CpanelLayout from './components/CpanelLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RestaurantsManager from './pages/RestaurantsManager';
import RestaurantProfile from './pages/RestaurantProfile';
import UsersManager from './pages/UsersManager';
import BannersManager from './pages/BannersManager';
import CategoriesManager from './pages/CategoriesManager';
import DeliveryManagement from './pages/DeliveryManagement';
import FinancesManager from './pages/FinancesManager';
import TransportRequests from './pages/TransportRequests';
import IconsManager from './pages/IconsManager';
import FidelizationManager from './pages/FidelizationManager';
import RafflesManager from './pages/RafflesManager';

export default function CpanelApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/cpanel');
    const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.');
    const basename = isDevAdminPath && !isCpanelSubdomain ? '/cpanel' : '/';

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const storedEmail = localStorage.getItem('cpanel_auth_email');
        const storedPwd = localStorage.getItem('cpanel_auth_pwd');

        if (storedEmail && storedPwd) {
            signInWithEmailAndPassword(auth, storedEmail, storedPwd).then(() => {
                setIsAuthenticated(true);
                setIsLoading(false);
            }).catch(err => {
                console.error("Firebase Auth error:", err);
                setIsLoading(false);
                logout(); // Clear invalid credentials
            });
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = async (email: string, password: string) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            localStorage.setItem('cpanel_auth_email', email);
            localStorage.setItem('cpanel_auth_pwd', password);
            setIsAuthenticated(true);
            return true;
        } catch (err: any) {
            console.error("Login Error:", err);
            throw new Error("Credenciales inválidas o error de conexión: " + (err.code || err.message));
        }
    };

    const logout = () => {
        localStorage.removeItem('cpanel_auth_email');
        localStorage.removeItem('cpanel_auth_pwd');
        setIsAuthenticated(false);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={login} />;
    }

    return (
        <Router basename={basename}>
            <CpanelLayout onLogout={logout}>
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/restaurants" element={<RestaurantsManager />} />
                    <Route path="/restaurants/:id" element={<RestaurantProfile />} />
                    <Route path="/users" element={<UsersManager />} />
                    <Route path="/banners" element={<BannersManager />} />
                    <Route path="/categories" element={<CategoriesManager />} />
                    <Route path="/delivery" element={<DeliveryManagement />} />
                    <Route path="/transports" element={<TransportRequests />} />
                    <Route path="/finances" element={<FinancesManager />} />
                    <Route path="/icons" element={<IconsManager />} />
                    <Route path="/fidelization" element={<FidelizationManager />} />
                    <Route path="/raffles" element={<RafflesManager />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </CpanelLayout>
        </Router>
    );
}
