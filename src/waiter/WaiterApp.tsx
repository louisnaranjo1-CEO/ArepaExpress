import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import WaiterDashboard from './pages/WaiterDashboard';
import WaiterLogin from './pages/WaiterLogin';
import WaiterOrders from './pages/WaiterOrders';
import WaiterMenu from './pages/WaiterMenu';
import WaiterProfile from './pages/WaiterProfile';
import Cart from '../pages/Cart';

const WaiterProtectedRoute = () => {
    const isWaiter = localStorage.getItem('isWaiter') === 'true';
    const waiterData = localStorage.getItem('waiterData');

    if (!isWaiter || !waiterData) {
        return <Navigate to="/login" replace />;
    }
    return <Outlet />;
};

export default function WaiterApp() {
    return (
        <Router>
            <AuthProvider>
                <CartProvider>
                    <div className="min-h-screen bg-slate-50 font-sans w-full max-w-lg mx-auto shadow-2xl relative overflow-hidden flex flex-col">
                        <Routes>
                            <Route path="/login" element={<WaiterLogin />} />
                            <Route element={<WaiterProtectedRoute />}>
                                <Route path="/" element={<WaiterDashboard />} />
                                <Route path="/orders" element={<WaiterOrders />} />
                                <Route path="/menu" element={<WaiterMenu />} />
                                <Route path="/profile" element={<WaiterProfile />} />
                                <Route path="/cart" element={<Cart />} />
                            </Route>
                        </Routes>
                    </div>
                </CartProvider>
            </AuthProvider>
        </Router>
    );
}
