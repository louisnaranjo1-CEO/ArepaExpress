import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { auth } from '../lib/firebase';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await auth.signOut();
        navigate('/');
    };

    if (!user) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[80vh] px-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                    <User className="w-16 h-16 text-primary" />
                </div>
                <h1 className="text-3xl font-black text-slate-900 mb-2">¡Hola, Arepa Lover! 🫓</h1>
                <p className="text-slate-500 mb-8 max-w-[280px]">
                    Ingresa para guardar tus restaurantes favoritos y pedir lo que más te gusta.
                </p>
                <div className="space-y-4 w-full max-w-xs">
                    <button className="w-full bg-primary text-white py-4 rounded-2xl font-bold shadow-lg shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all">
                        Iniciar Sesión
                    </button>
                    <button className="w-full bg-white text-primary border-2 border-primary py-4 rounded-2xl font-bold hover:bg-primary/5 transition-colors">
                        Crear Cuenta
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="pb-24 animate-in fade-in duration-500">
            <div className="bg-gradient-to-br from-primary to-orange-400 p-8 pt-12 pb-16 text-white rounded-b-[40px] shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full border-4 border-white/30 flex items-center justify-center overflow-hidden shadow-inner">
                        {user.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <User className="w-10 h-10 text-white" />
                        )}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black">{user.displayName || 'Arepa Fan'}</h2>
                        <div className="flex items-center gap-1 text-white/80 text-sm">
                            <Mail className="w-3 h-3" />
                            <span>{user.email}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 -mt-8">
                <div className="bg-white rounded-3xl p-6 shadow-xl shadow-slate-200/50 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 p-4 rounded-2xl flex flex-col items-center gap-2 group cursor-pointer hover:bg-orange-100 transition-colors">
                            <ShoppingBag className="w-6 h-6 text-orange-500 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-slate-600">Mis Pedidos</span>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-2xl flex flex-col items-center gap-2 group cursor-pointer hover:bg-blue-100 transition-colors">
                            <MapPin className="w-6 h-6 text-blue-500 group-hover:scale-110 transition-transform" />
                            <span className="text-xs font-bold text-slate-600">Direcciones</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h3 className="text-lg font-black text-slate-900 px-2">Ajustes</h3>
                        <div className="space-y-1">
                            <div className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                                        <CreditCard className="w-5 h-5 text-purple-500" />
                                    </div>
                                    <span className="font-bold text-slate-700">Métodos de Pago</span>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                            </div>
                            <div className="flex items-center justify-between p-4 hover:bg-slate-50 rounded-2xl transition-colors cursor-pointer group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                                        <Settings className="w-5 h-5 text-slate-500" />
                                    </div>
                                    <span className="font-bold text-slate-700">Preferencias</span>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                            </div>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center justify-between p-4 hover:bg-red-50 rounded-2xl transition-colors cursor-pointer group mt-4"
                            >
                                <div className="flex items-center gap-3 text-red-500">
                                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                                        <LogOut className="w-5 h-5" />
                                    </div>
                                    <span className="font-bold">Cerrar Sesión</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 text-center p-6 grayscale opacity-50">
                    <img src="/logo.png" alt="Arepa Express" className="h-8 mx-auto mb-2" onError={(e) => e.currentTarget.style.display = 'none'} />
                    <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">Hecho con ❤️ en Venezuela</p>
                </div>
            </div>
        </div>
    );
}
