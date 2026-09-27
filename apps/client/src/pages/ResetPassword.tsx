import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        if (password !== confirmPassword) {
            toast.error("Las contraseñas no coinciden");
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            toast.success("¡Contraseña actualizada con éxito!", { icon: '🔑' });
            navigate('/profile');
        } catch (err: any) {
            toast.error(err.message || "Error al restablecer la contraseña");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-full bg-slate-50 flex flex-col justify-center px-6 py-12">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <button
                    onClick={() => navigate(-1)}
                    className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Volver</span>
                </button>

                <div className="w-12 h-12 rounded-2xl bg-primary/20 text-slate-900 flex items-center justify-center mx-auto mb-3 font-black">
                    <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-center text-xl font-black text-slate-900">
                    Restablecer Contraseña
                </h2>
                <p className="mt-1 text-center text-xs text-slate-500">
                    Ingresa tu nueva contraseña para acceder a Un 2x3
                </p>
            </div>

            <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
                <form onSubmit={handleReset} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-700">Nueva Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-900"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-700">Confirmar Nueva Contraseña</label>
                        <input
                            type="password"
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repite tu contraseña"
                            className="mt-1 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-900"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-primary hover:bg-emerald-600 active:scale-95 text-slate-900 font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Actualizar Contraseña</span>}
                    </button>
                </form>
            </div>
        </div>
    );
}
