import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import CashierLogin from './pages/CashierLogin';
import CashierDashboard from './pages/CashierDashboard';
import CashierPOS from './pages/CashierPOS';
import { Toaster } from 'react-hot-toast';

export default function CashierApp() {
    const isCashierSubdomain = window.location.hostname.startsWith('caja.');
    const basename = isCashierSubdomain ? '/' : '/caja';

    return (
        <>
            <Toaster position="top-right" reverseOrder={false} />
            <Router basename={basename}>
                <Routes>
                    <Route path="/login" element={<CashierLogin />} />
                    <Route path="/" element={
                        <RequireCashierAuth>
                            <CashierDashboard />
                        </RequireCashierAuth>
                    } />
                    <Route path="/pos/:orderId?" element={
                        <RequireCashierAuth>
                            <CashierPOS />
                        </RequireCashierAuth>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Router>
        </>
    );
}

function RequireCashierAuth({ children }: { children: React.ReactNode }) {
    const isCashier = localStorage.getItem('isCashier');
    const cashierData = localStorage.getItem('cashierData');
    
    if (!isCashier || !cashierData) {
        return <Navigate to="/login" replace />;
    }
    
    return <>{children}</>;
}
