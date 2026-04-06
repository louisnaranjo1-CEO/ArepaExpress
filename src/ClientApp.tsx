import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Search from './pages/Search';
import Cart from './pages/Cart';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Restaurant from './pages/Restaurant';
import TrackOrder from './pages/TrackOrder';
import TransportTracker from './pages/TransportTracker';
import Taxi from './pages/Taxi';
import Rewards from './pages/Rewards';
import Orders from './pages/Orders';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';
import { CartProvider } from './context/CartContext';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGlobalAudioAlerts } from './hooks/useGlobalAudioAlerts';

function RedirectHandler({ children }: { children: React.ReactNode }) {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    
    useGlobalAudioAlerts('user', user?.uid);

    useEffect(() => {
        // Redirection logic removed to allow users with multiple roles (e.g., driver and customer)
        // to use the client app without being forced to the delivery subdomain.
    }, [user, userData, navigate]);

    return <>{children}</>;
}

export default function ClientApp() {
    return (
        <Router>
            <AuthProvider>
                <Toaster position="top-center" reverseOrder={false} />
                <RedirectHandler>
                    <CartProvider>
                        <div className="h-screen bg-slate-100 flex justify-center overflow-hidden">
                            <div className="bg-white w-full max-w-md flex flex-col shadow-2xl h-full relative overflow-hidden">
                                <div className="flex-1 overflow-y-auto hide-scrollbar">
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
                                    </Routes>
                                </div>
                                <BottomNav />
                            </div>
                        </div>
                    </CartProvider>
                </RedirectHandler>
            </AuthProvider>
        </Router>
    );
}
