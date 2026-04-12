import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';

export default function CashierLogin() {
    const [cashierEmail, setCashierEmail] = useState('');
    const [cashierPassword, setCashierPassword] = useState('');
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSigningIn(true);
        setError(null);
        try {
            const indexSnap = await getDoc(doc(db, 'cashier_index', cashierEmail.toLowerCase()));

            if (!indexSnap.exists()) {
                setError("Credenciales incorrectas (Usuario).");
                setIsSigningIn(false);
                return;
            }

            const { restaurantId, cashierId } = indexSnap.data();

            const cashierDoc = await getDoc(doc(db, 'restaurants', restaurantId, 'cashiers', cashierId));

            if (!cashierDoc.exists()) {
                setError("No se encontraron los datos de la cajera.");
                setIsSigningIn(false);
                return;
            }

            const data = cashierDoc.data();

            if (data.passcode !== cashierPassword) {
                setError("Credenciales incorrectas (Contraseña).");
                setIsSigningIn(false);
                return;
            }

            if (!data.isActive) {
                setError("Esta cuenta de cajera está inactiva. Contacte al administrador.");
                setIsSigningIn(false);
                return;
            }

            const cashierData = {
                id: cashierDoc.id,
                ...data
            };

            // Sign in anonymously to have a valid auth session for Firestore rules
            try {
                const authResult = await signInAnonymously(auth);
                const currentUid = authResult.user.uid;
                
                // Link this session UID to the cashier document so rules can verify it
                await updateDoc(doc(db, 'restaurants', restaurantId, 'cashiers', cashierId), {
                    currentSessionUid: currentUid,
                    lastLogin: new Date().toISOString()
                });
                
                console.log("Cashier authenticated with UID:", currentUid);
            } catch (authErr) {
                console.error("Auth error during cashier login:", authErr);
                // We continue even if auth fails, but sync might not work if rules are strict
            }

            localStorage.setItem('cashierData', JSON.stringify(cashierData));
            localStorage.setItem('cashierRestaurantId', restaurantId);
            localStorage.setItem('isCashier', 'true');

            navigate('/');
        } catch (err: any) {
            console.error("Failed to sign in as cashier", err);
            setError(err.message || "Error al iniciar sesión. Intenta de nuevo.");
        } finally {
            setIsSigningIn(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center p-6 relative">
            <div className="absolute top-0 left-0 w-full h-80 bg-primary/5 rounded-b-[40px] -z-0"></div>

            <div className="w-full max-w-sm mx-auto z-10">
                <div className="text-center mb-10 mt-safe">
                    <div className="w-20 h-20 bg-white rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-slate-200/50 rotate-3 mb-6 border-2 border-primary/20">
                        <Shield className="w-10 h-10 text-slate-900" />
                    </div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Caja y Cobros</h1>
                    <p className="font-bold text-slate-500 mt-2">Deliexpress Cashier Portal</p>
                </div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-white rounded-[32px] w-full shadow-2xl overflow-hidden border border-slate-100"
                >
                    <div className="p-8 border-b border-slate-50 flex items-center justify-center bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-slate-900" />
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Acceso de Cajera</h3>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 space-y-5">
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
                                value={cashierEmail}
                                onChange={(e) => setCashierEmail(e.target.value)}
                                placeholder="cajera@deliexpress.app"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-bold text-slate-700 transition-all focus:bg-white"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña (PIN)</label>
                            <input
                                type="password"
                                required
                                value={cashierPassword}
                                onChange={(e) => setCashierPassword(e.target.value)}
                                placeholder="••••"
                                className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-4 rounded-2xl outline-none font-black tracking-[0.5em] text-slate-700 transition-all text-center text-xl shadow-inner focus:bg-white"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isSigningIn}
                            className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-6 flex items-center justify-center gap-2"
                        >
                            {isSigningIn ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                "Iniciar Sesión en Caja"
                            )}
                        </button>
                    </form>
                </motion.div>

                <div className="text-center mt-8">
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest mb-1">¿Problemas de Acceso?</p>
                    <p className="text-xs text-slate-500">Comuníquese con el administrador del restaurante</p>
                </div>
            </div>
        </div>
    );
}
