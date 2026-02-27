import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import BottomNav from './components/BottomNav';
import Home from './pages/Home';
import Search from './pages/Search';
import Cart from './pages/Cart';
import Favorites from './pages/Favorites';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Restaurant from './pages/Restaurant';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

export default function ClientApp() {
    return (
        <Router>
            <AuthProvider>
                <CartProvider>
                    <div className="min-h-screen bg-white font-sans flex flex-col">
                        <div className="flex-1 overflow-y-auto hide-scrollbar">
                            <Routes>
                                <Route path="/" element={<Home />} />
                                <Route path="/search" element={<Search />} />
                                <Route path="/restaurant/:id" element={<Restaurant />} />
                                <Route path="/cart" element={<Cart />} />
                                <Route path="/favorites" element={<Favorites />} />
                                <Route path="/profile" element={<Profile />} />
                                <Route path="/notifications" element={<Notifications />} />
                            </Routes>
                        </div>
                        <BottomNav />
                    </div>
                </CartProvider>
            </AuthProvider>
        </Router>
    );
}
