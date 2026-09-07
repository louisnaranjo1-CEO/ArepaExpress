import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { driversApi } from '../lib/api';
import { supabase } from '../lib/supabase';
import DeliveryLayout from './components/DeliveryLayout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import OrdersRadar from './pages/OrdersRadar';
import Earnings from './pages/Earnings';
import DriverProfile from './pages/DriverProfile';
import PendingApproval from './pages/PendingApproval';
import Achievements from './pages/Achievements';

function DeliveryRoutes() {
    const { user, userData, loading: authLoading } = useAuth();
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [loadingDriver, setLoadingDriver] = useState(true);

    const isProfileComplete = !!(userData?.displayName && userData?.phone);
    const isDriverProfileComplete = !!(userData?.displayName && userData?.phone);

    useEffect(() => {
        let isMounted = true;
        if (!user) {
            setLoadingDriver(false);
            return;
        }

        const fetchDriver = async () => {
            try {
                const profile = await driversApi.getDriver(user.uid);
                if (isMounted) {
                    setDriverProfile(profile);
                    setLoadingDriver(false);
                }
            } catch (error) {
                console.error("Error fetching driver profile:", error);
                if (isMounted) {
                    setDriverProfile(null);
                    setLoadingDriver(false);
                }
            }
        };

        fetchDriver();

        const channel = supabase.channel(`public:drivers:${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.uid}` }, async () => {
                if (!isMounted) return;
                try {
                    const profile = await driversApi.getDriver(user.uid);
                    setDriverProfile(profile);
                } catch(e) {}
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [user]);

    if (authLoading || loadingDriver) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        return (
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
        );
    }

    // Si ya existe registro de Delivery, verificar estado
    if (driverProfile) {
        const status = driverProfile.status;

        if (status === 'pending' || status === 'rejected') {
            return (
                <Routes>
                    <Route path="/pending" element={<PendingApproval status={status} />} />
                    <Route path="*" element={<Navigate to="/pending" replace />} />
                </Routes>
            );
        }

        // Si está activo pero le faltan datos básicos (nombre/teléfono)
        if (!isDriverProfileComplete) {
            return (
                <Routes>
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="*" element={<Navigate to="/onboarding" replace />} />
                </Routes>
            );
        }

        // Si está activo
        return (
            <DeliveryLayout>
                <Routes>
                    <Route path="/radar" element={<OrdersRadar />} />
                    <Route path="/earnings" element={<Earnings />} />
                    <Route path="/profile" element={<DriverProfile />} />
                    <Route path="/achievements" element={<Achievements />} />
                    <Route path="*" element={<Navigate to="/radar" replace />} />
                </Routes>
            </DeliveryLayout>
        );
    }

    // Si es un user autenticado pero no tiene perfil de delivery aún (Onboarding)
    return (
        <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
        </Routes>
    );
}

export default function DeliveryApp() {
    const isDeliveryPath = window.location.pathname.startsWith('/delivery');
    const isDeliverySubdomain = window.location.hostname.startsWith('delivery.');
    const basename = isDeliveryPath && !isDeliverySubdomain ? '/delivery' : '/';

    // Efecto secundario: Forzar clase en body si estamos en delivery
    React.useEffect(() => {
        document.body.className = 'bg-slate-50';
        return () => {
            document.body.className = '';
        };
    }, []);

    return (
        <Router basename={basename}>
            <DeliveryRoutes />
        </Router>
    );
}
