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
import LockScreen from './components/LockScreen';
import GlobalCallReceiver from './components/GlobalCallReceiver';

function RedirectHandler({ children }: { children: React.ReactNode }) {
    const { user, userData, setIsUnlocked } = useAuth();
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

    // Auto-lock when app is backgrounded or minimized
    useEffect(() => {
        let lastBackgroundTime: number | null = null;

        const handleBackground = () => {
            lastBackgroundTime = Date.now();
        };

        const handleForeground = () => {
            if (lastBackgroundTime) {
                const elapsed = Date.now() - lastBackgroundTime;
                // If backgrounded for more than 20 seconds, lock the app
                if (elapsed > 20000) {
                    const hasBio = Boolean(userData?.biometricLockEnabled || userData?.biometric_lock_enabled);
                    if (hasBio && user) {
                        sessionStorage.removeItem('deliexpress_is_unlocked');
                        setIsUnlocked(false);
                    }
                }
            }
            lastBackgroundTime = null;
        };

        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                handleBackground();
            } else if (document.visibilityState === 'visible') {
                handleForeground();
            }
        };

        document.addEventListener('visibilitychange', onVisibility);

        let capAppState: any = null;
        if (Capacitor.isNativePlatform()) {
            capAppState = CapApp.addListener('appStateChange', (state) => {
                if (!state.isActive) {
                    handleBackground();
                } else {
                    handleForeground();
                }
            });
        }

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            if (capAppState) {
                capAppState.then((l: any) => l.remove());
            }
        };
    }, [user, userData?.biometricLockEnabled, userData?.biometric_lock_enabled, setIsUnlocked]);

    return <>{children}</>;
}

function AppContent() {
    const { user, userData, isUnlocked } = useAuth();
    const location = useLocation();
    const isTrackRoute = location.pathname.startsWith('/taxi/track') || location.pathname.startsWith('/track');

    const isLocked = Boolean(user && (userData?.biometricLockEnabled || userData?.biometric_lock_enabled) && !isUnlocked);

    return (
        <div className="h-[100dvh] w-full bg-slate-100 flex justify-center overflow-hidden">
            <div className="bg-white w-full max-w-md flex flex-col shadow-2xl h-full relative overflow-hidden">
                {isLocked && <LockScreen />}
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
                <GlobalCallReceiver />
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
