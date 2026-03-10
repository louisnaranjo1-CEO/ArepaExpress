import React, { useState } from 'react';
import { Shield, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate } from 'react-router-dom';

export default function WaiterLogin() {
    const [waiterEmail, setWaiterEmail] = useState('');
    const [waiterPassword, setWaiterPassword] = useState('');
    const [isWaiterSigningIn, setIsWaiterSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleWaiterLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsWaiterSigningIn(true);
        setError(null);
        try {
            console.log("Attempting waiter login for:", waiterEmail);

            // Look up in the index instead of collectionGroup to avoid missing index error
            const indexSnap = await getDoc(doc(db, 'waiter_index', waiterEmail.toLowerCase()));

            if (!indexSnap.exists()) {
                setError("Credenciales incorrectas (Usuario).");
                setIsWaiterSigningIn(false);
                return;
            }

            const { restaurantId, waiterId } = indexSnap.data();

            // Fetch the actual waiter document
            const waiterDoc = await getDoc(doc(db, 'restaurants', restaurantId, 'waiters', waiterId));

            if (!waiterDoc.exists()) {
                setError("No se encontraron los datos del mesero.");
                setIsWaiterSigningIn(false);
                return;
            }

            const data = waiterDoc.data();
            console.log("Waiter data found:", data.name);

            if (data.password !== waiterPassword) {
                console.log("Password mismatch for waiter:", waiterEmail);
                setError("Credenciales incorrectas (Contraseña).");
                setIsWaiterSigningIn(false);
                return;
            }

            const waiterData = {
                id: waiterDoc.id,
                ...data
            };

            localStorage.setItem('waiterData', JSON.stringify(waiterData));
            localStorage.setItem('waiterRestaurantId', restaurantId);
            localStorage.setItem('isWaiter', 'true');

            // Redirect to Waiter Dashboard
            navigate('/');
        } catch (err: any) {
            console.error("Failed to sign in as waiter", err);
            setError(err.message || "Error al iniciar sesión como mesero. Intenta de nuevo.");
        } finally {
            setIsWaiterSigningIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center p-6 relative">
            <div className="absolute top-0 left-0 w-full h-80 bg-primary/10 rounded-b-[40px] -z-0"></div>

            <div className="w-full max-w-sm mx-auto z-10">
                <div className="text-center mb-10 mt-safe">
                    <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-slate-200/50 rotate-3 mb-6">
                        <img src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media&token=2dd047ea-6c45-4347-8869-1a1edf4253f4" alt="2X3" className="w-16 h-16 object-contain" />
                        {/* Fallback pattern if logo fails */}
                        <div className="absolute inset-0 flex items-center justify-center -rotate-3 -z-10 bg-slate-100 rounded-3xl overflow-hidden">
                            <span className="font-black text-2xl text-slate-300">AE</span>
                        </div>
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Acceso Personal</h1>
                    <p className="font-bold text-slate-500 mt-2">Módulo de toma de pedidos</p>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-white rounded-[32px] w-full shadow-2xl overflow-hidden border border-slate-100"
                >
                    <div className="p-8 border-b border-slate-50 flex items-center justify-center bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-indigo-500" />
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Seguridad</h3>
                        </div>
                    </div>

                    <form onSubmit={handleWaiterLoginSubmit} className="p-8 space-y-5">
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs font-bold"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email / Usuario</label>
                            <input
                                type="email"
                                required
                                value={waiterEmail}
                                onChange={(e) => setWaiterEmail(e.target.value)}
                                placeholder="mesero@restaurante.com"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all focus:bg-white"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña (PIN)</label>
                            <input
                                type="password"
                                required
                                value={waiterPassword}
                                onChange={(e) => setWaiterPassword(e.target.value)}
                                placeholder="••••"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-500 px-4 py-4 rounded-2xl outline-none font-black tracking-[0.5em] text-slate-700 transition-all text-center text-xl shadow-inner focus:bg-white"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isWaiterSigningIn}
                            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold shadow-lg shadow-indigo-600/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-6 flex items-center justify-center gap-2"
                        >
                            {isWaiterSigningIn ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                "Ver mis mesas"
                            )}
                        </button>
                    </form>
                </motion.div>

                <div className="text-center mt-8">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">¿Problemas para acceder?</p>
                    <p className="text-xs text-slate-500">Contacta al administrador del restaurante</p>
                </div>
            </div>
        </div>
    );
}
