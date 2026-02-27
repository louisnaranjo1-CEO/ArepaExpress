import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import WaiterDashboard from './pages/WaiterDashboard';

export default function WaiterApp() {
    return (
        <Router>
            <AuthProvider>
                <div className="min-h-screen bg-slate-50 font-sans w-full max-w-lg mx-auto shadow-2xl relative overflow-hidden flex flex-col">
                    <Routes>
                        <Route path="/" element={<WaiterDashboard />} />
                        {/* More routes like /orders, /menu, /profile will be added */}
                    </Routes>
                </div>
            </AuthProvider>
        </Router>
    );
}
