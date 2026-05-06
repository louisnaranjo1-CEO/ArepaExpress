import React, { useState, useEffect } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import CpanelLayout from './components/CpanelLayout';

import Dashboard from './pages/Dashboard';
import RestaurantsManager from './pages/RestaurantsManager';
import RestaurantProfile from './pages/RestaurantProfile';
import UsersManager from './pages/UsersManager';
import BannersManager from './pages/BannersManager';
import CategoriesManager from './pages/CategoriesManager';
import DeliveryManagement from './pages/DeliveryManagement';
import AppOrders from './pages/AppOrders';
import FinancesManager from './pages/FinancesManager';
import LiquidationsManager from './pages/LiquidationsManager';
import TransportRequests from './pages/TransportRequests';
import IconsManager from './pages/IconsManager';
import FidelizationManager from './pages/FidelizationManager';
import RafflesManager from './pages/RafflesManager';
import SupportTicketsManager from './pages/SupportTicketsManager';
import MarketingManager from './pages/MarketingManager';
import PilotAchievements from './pages/PilotAchievements';

export default function CpanelApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/cpanel');
    const isCpanelSubdomain = window.location.hostname.startsWith('cpanel.');
    const basename = isDevAdminPath && !isCpanelSubdomain ? '/cpanel' : '/';

    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        import('firebase/auth').then(({ signInAnonymously }) => {
            signInAnonymously(auth).then(async (userCredential) => {
                const { setDoc } = await import('firebase/firestore');
                // Ensure the user has an admin doc
                const userDocRef = doc(db, 'users', userCredential.user.uid);
                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists() || userDoc.data()?.role !== 'admin') {
                    await setDoc(userDocRef, {
                        role: 'admin',
                        email: 'admin_auto@cpanel.local',
                        name: 'Auto Admin',
                        createdAt: new Date().toISOString()
                    }, { merge: true });
                }
                setIsAuthenticated(true);
                setIsLoading(false);
            }).catch(err => {
                console.error("Firebase Auth error:", err);
                setIsLoading(false);
            });
        });
    }, []);


    const logout = () => {
        localStorage.removeItem('cpanel_auth_email');
        localStorage.removeItem('cpanel_auth_pwd');
        setIsAuthenticated(false);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    // Always bypass Login component and just show the cpanel layout when authenticated
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <p>Authenticating...</p>
            </div>
        );
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
                    <Route path="/app-orders" element={<AppOrders />} />
                    <Route path="/transports" element={<TransportRequests />} />
                    <Route path="/finances" element={<FinancesManager />} />
                    <Route path="/liquidations" element={<LiquidationsManager />} />
                    <Route path="/icons" element={<IconsManager />} />
                    <Route path="/fidelization" element={<FidelizationManager />} />
                    <Route path="/raffles" element={<RafflesManager />} />
                    <Route path="/marketing" element={<MarketingManager />} />
                    <Route path="/achievements" element={<PilotAchievements />} />
                    <Route path="/support" element={<SupportTicketsManager />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </CpanelLayout>
        </Router>
    );
}
