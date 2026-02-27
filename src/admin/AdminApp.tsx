import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import AdminAuth from './AdminAuth';
import AdminLayout from './components/AdminLayout';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import ProductManagement from './pages/ProductManagement';
import RestaurantProfile from './pages/RestaurantProfile';

function AdminRoutes() {
    const { user, loading } = useAuth();

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

    return (
        <AdminLayout>
            <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/products" element={<ProductManagement />} />
                <Route path="/profile" element={<RestaurantProfile />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AdminLayout>
    );
}

export default function AdminApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/admin');
    const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');

    const basename = isDevAdminPath && !isAdminSubdomain ? '/admin' : '/';

    return (
        <Router basename={basename}>
            <AuthProvider>
                <AdminRoutes />
            </AuthProvider>
        </Router>
    );
}
