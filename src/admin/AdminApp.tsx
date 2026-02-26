import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

export default function AdminApp() {
    const isDevAdminPath = window.location.pathname.startsWith('/admin');
    const isAdminSubdomain = window.location.hostname.startsWith('restaurante.');

    const basename = isDevAdminPath && !isAdminSubdomain ? '/admin' : '/';

    return (
        <Router basename={basename}>
            <div className="min-h-screen bg-slate-100 font-sans">
                <div className="p-4 bg-primary text-white font-black text-xl">
                    Panel de Administración
                </div>
                <div className="p-6">
                    <Routes>
                        <Route path="/" element={<h1 className="text-2xl font-bold bg-white p-6 rounded-2xl shadow-sm">Bienvenido al Panel de Restaurantes (En construcción)</h1>} />
                    </Routes>
                </div>
            </div>
        </Router>
    );
}
