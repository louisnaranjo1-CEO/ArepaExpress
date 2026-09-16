import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Search from './pages/Search';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Restaurant from './pages/Restaurant';
import TrackOrder from './pages/TrackOrder';
import TransportTracker from './pages/TransportTracker';
import Taxi from './pages/Taxi';
import Rewards from './pages/Rewards';
import Orders from './pages/Orders';
import ResetPassword from './pages/ResetPassword';
import { useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { CartProvider } from './context/CartContext';
import { useGlobalAudioAlerts } from './hooks/useGlobalAudioAlerts';
import { usePushCampaigns } from './hooks/usePushCampaigns';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from './lib/supabase';
import toast from 'react-hot-toast';
import WhatsAppPurchaseConfirmationModal from './components/WhatsAppPurchaseConfirmationModal';

function RedirectHandler({ children }: { children: React.ReactNode }) {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    
    useGlobalAudioAlerts('user', user?.uid);
    usePushCampaigns(userData, user?.uid);

    // Deep linking handler for In-App Native Google Auth
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const handleUrl = async (urlStr: string) => {
            if (!urlStr || !urlStr.includes('auth/callback')) return;

            try {
                await Browser.close();
            } catch (e) {}

            try {
                const hashIdx = urlStr.indexOf('#');
                const queryIdx = urlStr.indexOf('?');
                let paramsStr = '';
                if (hashIdx !== -1) {
                    paramsStr = urlStr.substring(hashIdx + 1);
                } else if (queryIdx !== -1) {
                    paramsStr = urlStr.substring(queryIdx + 1);
                }

                const params = new URLSearchParams(paramsStr);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (accessToken && refreshToken) {
                    const { data: authData, error: authErr } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    });

                    if (!authErr && authData?.user) {
                        toast.success('¡Bienvenido! Sesión iniciada');
                        navigate('/profile');
                    } else if (authErr) {
                        console.error('Error setting session from deep link:', authErr);
                        toast.error('Error al iniciar sesión');
                    }
                }
            } catch (err) {
                console.error('Error processing deep link:', err);
            }
        };

        const sub = CapApp.addListener('appUrlOpen', (event) => {
            handleUrl(event.url);
        });

        return () => {
            sub.then((s) => s.remove());
        };
    }, [navigate]);

    return <>{children}</>;
}

function AppContent() {
    const location = useLocation();
    const isTrackRoute = location.pathname.startsWith('/taxi/track') || location.pathname.startsWith('/track');

    return (
        <div className="h-[100dvh] w-full bg-slate-100 flex justify-center overflow-hidden">
            <div className="bg-white w-full max-w-md flex flex-col shadow-2xl h-full relative overflow-hidden">
                <div className="flex-1 h-full overflow-hidden relative">
                    <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/search" element={<Search />} />
                        <Route path="/restaurant/:id" element={<Restaurant />} />
                        <Route path="/orders" element={<Orders />} />
                        <Route path="/cart" element={<Orders />} />
                        <Route path="/favorites" element={<Favorites />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/rewards" element={<Rewards />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/track/:orderId" element={<TrackOrder />} />
                        <Route path="/taxi/track/:requestId" element={<TransportTracker />} />
                        <Route path="/taxi" element={<Taxi />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                    </Routes>
                </div>
                {!isTrackRoute && <BottomNav />}
                <WhatsAppPurchaseConfirmationModal />
            </div>
        </div>
    );
}

export default function ClientApp() {
    return (
        <Router>
            <Toaster position="top-center" reverseOrder={false} />
            <RedirectHandler>
                <CartProvider>
                    <AppContent />
                </CartProvider>
            </RedirectHandler>
        </Router>
    );
}
