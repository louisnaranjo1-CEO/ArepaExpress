import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import WaiterDashboard from './pages/WaiterDashboard';
import WaiterLogin from './pages/WaiterLogin';

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
                <div className="min-h-screen bg-slate-50 font-sans w-full max-w-lg mx-auto shadow-2xl relative overflow-hidden flex flex-col">
                    <Routes>
                        <Route path="/login" element={<WaiterLogin />} />
                        <Route element={<WaiterProtectedRoute />}>
                            <Route path="/" element={<WaiterDashboard />} />
                            {/* More routes like /orders, /menu, /profile will be added */}
                        </Route>
                    </Routes>
                </div>
            </AuthProvider>
        </Router>
    );
}
