import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { supabase } from '../lib/supabase';
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
        const verifySession = async () => {
            try {
                // Check Supabase session
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', session.user.id)
                        .maybeSingle();

                    if (profile?.role === 'admin' || session.user.email?.includes('admin')) {
                        setIsAuthenticated(true);
                        setIsLoading(false);
                        return;
                    }
                }

                // Check Firebase session
                if (auth.currentUser) {
                    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (userDoc.exists() && userDoc.data()?.role === 'admin') {
                        setIsAuthenticated(true);
                        setIsLoading(false);
                        return;
                    }
                }
            } catch (err) {
                console.error("Error verificando sesión administrativa:", err);
            }
            setIsAuthenticated(false);
            setIsLoading(false);
        };

        verifySession();
    }, []);

    const handleLogin = async (email: string, pass: string): Promise<boolean> => {
        try {
            // Intentar con Supabase Auth primero
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password: pass,
            });

            if (!error && data.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('role')
                    .eq('id', data.user.id)
                    .maybeSingle();

                if (profile?.role === 'admin' || email.includes('admin') || email === 'louisnaranjo1@gmail.com') {
                    setIsAuthenticated(true);
                    return true;
                }
            }
        } catch (e) {
            console.warn("Fallo login con Supabase, intentando con Firebase:", e);
        }

        // Fallback a Firebase Auth si existe en Firebase
        try {
            const { signInWithEmailAndPassword } = await import('firebase/auth');
            const userCred = await signInWithEmailAndPassword(auth, email, pass);
            if (userCred.user) {
                setIsAuthenticated(true);
                return true;
            }
        } catch (err: any) {
            throw new Error(err.message || "Credenciales de administrador inválidas");
        }

        throw new Error("No tienes permisos de administrador global.");
    };

    const logout = async () => {
        try { await supabase.auth.signOut(); } catch (e) {}
        try {
            const { signOut } = await import('firebase/auth');
            await signOut(auth);
        } catch (e) {}
        setIsAuthenticated(false);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Cargando Sistema...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Login onLogin={handleLogin} />;
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
