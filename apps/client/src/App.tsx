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

function RedirectHandler({ children }: { children: React.ReactNode }) {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    
    useGlobalAudioAlerts('user', user?.uid);
    usePushCampaigns(userData, user?.uid);

    useEffect(() => {
        // Redirection logic removed to allow users with multiple roles (e.g., driver and customer)
        // to use the client app without being forced to the delivery subdomain.
    }, [user, userData, navigate]);

    return <>{children}</>;
}

function AppContent() {
    const location = useLocation();
    const isTaxiRoute = location.pathname.startsWith('/taxi');

    return (
        <div className="h-[100dvh] w-full bg-slate-100 flex justify-center overflow-hidden">
            <div className={`bg-white w-full max-w-md flex flex-col shadow-2xl h-full relative overflow-hidden ${
                isTaxiRoute ? '' : ''
            }`}>
                <div className={`flex-1 ${isTaxiRoute ? 'h-full overflow-hidden' : 'overflow-y-auto hide-scrollbar'}`}>
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
                {!isTaxiRoute && <BottomNav />}
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
