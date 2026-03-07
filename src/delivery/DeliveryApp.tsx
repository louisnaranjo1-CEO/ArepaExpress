import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import DeliveryLayout from './components/DeliveryLayout';
import Login from './pages/Login';
import Onboarding from './pages/Onboarding';
import OrdersRadar from './pages/OrdersRadar';
import Earnings from './pages/Earnings';
import DriverProfile from './pages/DriverProfile';
import PendingApproval from './pages/PendingApproval';

function DeliveryRoutes() {
    const { user, userData, loading: authLoading } = useAuth();
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [loadingDriver, setLoadingDriver] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoadingDriver(false);
            return;
        }

        const unsub = onSnapshot(doc(db, 'delivery_drivers', user.uid), (snap) => {
            if (snap.exists()) {
                setDriverProfile(snap.data());
            } else {
                setDriverProfile(null);
            }
            setLoadingDriver(false);
        });

        return () => unsub();
    }, [user]);

    if (authLoading || loadingDriver) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
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

        if (status === 'pending') {
            return (
                <Routes>
                    <Route path="/pending" element={<PendingApproval />} />
                    <Route path="*" element={<Navigate to="/pending" replace />} />
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
        <AuthProvider>
            <Router basename={basename}>
                <DeliveryRoutes />
            </Router>
        </AuthProvider>
    );
}
