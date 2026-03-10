import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { signInWithGoogle } from '../../lib/auth-service';

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleGoogleLogin = async () => {
        try {
            setLoading(true);
            setError('');
            await signInWithGoogle();
            navigate('/delivery');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Error al iniciar sesión');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] bg-slate-900 flex flex-col justify-center items-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500 rounded-full blur-[100px] opacity-30 animate-pulse"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500 rounded-full blur-[100px] opacity-30 animate-pulse delay-700"></div>

            <div className="w-full max-w-sm z-10 flex flex-col items-center">
                <div className="w-24 h-24 bg-white rounded-[2rem] shadow-2xl flex items-center justify-center mb-8 transform hover:scale-105 transition-transform duration-300">
                    <img
                        src="https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20oficial.png?alt=media&token=2dd047ea-6c45-4347-8869-1a1edf4253f4"
                        alt="2X3"
                        className="w-16 h-16 object-contain"
                    />
                </div>

                <h1 className="text-4xl font-black text-white text-center mb-2 tracking-tighter">
                    Delivery <span className="text-indigo-400">Express</span>
                </h1>
                <p className="text-slate-400 text-center mb-10 font-medium px-4">
                    Conduce, entrega y gana dinero a tu propio ritmo con 2X3.
                </p>

                {error && (
                    <div className="w-full bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-2xl mb-6 text-sm text-center font-medium backdrop-blur-sm">
                        {error}
                    </div>
                )}

                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full bg-white text-slate-900 py-4 px-6 rounded-2xl font-black text-lg shadow-xl shadow-white/10 hover:shadow-white/20 hover:-translate-y-1 transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:hover:translate-y-0"
                >
                    {loading ? (
                        <div className="w-6 h-6 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <>
                            <svg className="w-6 h-6" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                />
                                <path
                                    fill="currentColor"
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                />
                            </svg>
                            Continuar con Google
                        </>
                    )}
                </button>
            </div>

            <p className="absolute bottom-6 text-xs text-slate-500 font-medium text-center max-w-[280px]">
                Al iniciar sesión, aceptas nuestros <a href="#" className="underline text-slate-400">Términos y Condiciones</a>
            </p>
        </div>
    );
}
