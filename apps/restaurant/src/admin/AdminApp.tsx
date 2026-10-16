import SplashScreen from '../components/SplashScreen';
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { handleDeepLinkAuthUrl } from '../lib/auth-service';
import { useRealtimeResilience } from '../hooks/useRealtimeResilience';
import { setupBackButtonHandler } from '../utils/backButtonManager';
import { useAuth } from '../context/AuthContext';
import AdminAuth from './AdminAuth';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import ProductManagement from './pages/ProductManagement';
import RestaurantProfile from './pages/RestaurantProfile';
import Clients from './pages/Clients';
import WaitersManager from './pages/WaitersManager';
import CashiersManager from './pages/CashiersManager';
import PrintersManager from './pages/PrintersManager';

import TablesManager from './pages/TablesManager';
import Subscriptions from './pages/Subscriptions';
import Banners from './pages/Banners';
import ReviewsManager from './pages/ReviewsManager';
import AdsManager from './pages/AdsManager';
import Finance from './pages/Finance';
import Fidelization from './pages/Fidelization';
import ResuelveManager from './pages/ResuelveManager';
import PushCampaigns from './pages/PushCampaigns';
import Notifications from './pages/Notifications';

function AdminRoutes() {
    const { user, userData, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (!user) {
        return <AdminAuth />;
    }

    const rid = userData?.managedRestaurantId || user?.uid || (user as any)?.id;

    useRealtimeResilience();

    useEffect(() => {
        return setupBackButtonHandler(
            () => window.history.back(),
            () => window.location.pathname === '/' || window.location.pathname === '/admin' || window.location.pathname === '/admin/' || window.location.pathname.endsWith('/orders')
        );
    }, []);

    return (
        <AdminLayout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/products" element={<ProductManagement />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/waiters" element={<WaitersManager />} />
                <Route path="/cashiers" element={<CashiersManager />} />
                <Route path="/tables" element={<TablesManager />} />
                <Route path="/stations" element={<PrintersManager />} />
                <Route path="/profile" element={<RestaurantProfile />} />
                <Route path="/banners" element={<Banners />} />
                <Route path="/reviews" element={<ReviewsManager />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/ads" element={<AdsManager />} />
                <Route path="/finance" element={<Finance />} />
                <Route path="/fidelization" element={<Fidelization />} />
                <Route path="/resuelve" element={<ResuelveManager />} />
                <Route path="/push-campaigns" element={<PushCampaigns restaurantId={rid} />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AdminLayout>
    );
}

export default function AdminApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/admin');
    const isAdminSubdomain = window.location.hostname.startsWith('restaurante.') || window.location.hostname.startsWith('negocios.');

    const basename = isDevAdminPath && !isAdminSubdomain ? '/admin' : '/';

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const sub = CapApp.addListener('appUrlOpen', async (event) => {
            if (event.url && event.url.includes('auth/callback')) {
                await handleDeepLinkAuthUrl(event.url);
            }
        });

        return () => {
            sub.then(s => s.remove());
        };
    }, []);

    return (
        <Router basename={basename}>
            {!splashFinished && (
                <SplashScreen onFinish={() => setSplashFinished(true)} />
            )}
            <AdminRoutes />
        </Router>
    );
}
