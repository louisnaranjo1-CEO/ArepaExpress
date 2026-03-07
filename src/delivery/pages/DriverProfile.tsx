import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, FileText, Settings, ShieldCheck, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function DriverProfile() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/delivery/login');
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight px-2">Mi Perfil</h2>

            <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-indigo-600/10 backdrop-blur-3xl -z-10"></div>
                <div className="w-24 h-24 bg-white p-1 rounded-full mx-auto mb-4 relative shadow-xl shadow-indigo-600/20">
                    <img
                        src={user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}&background=e0e7ff&color=4f46e5`}
                        alt="Profile"
                        className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full"></div>
                </div>

                <h3 className="text-xl font-black text-slate-900">{profile?.fullName || user?.displayName || 'Piloto'}</h3>
                <p className="text-sm font-medium text-slate-500 mb-4">{user?.email}</p>

                <div className="flex items-center justify-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-600 w-max mx-auto px-3 py-1.5 rounded-full capitalize">
                    <ShieldCheck className="w-4 h-4" /> Cuenta Verificada
                </div>
            </div>

            <div className="space-y-3">
                <button className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Datos Personales</p>
                            <p className="text-xs font-medium text-slate-500">Info legal y de contacto</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>

                <button className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Documentos del Vehículo</p>
                            <p className="text-xs font-medium text-slate-500">Moto, Placa y Licencias</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>
            </div>

            <button
                onClick={handleLogout}
                className="w-full bg-red-50 text-red-600 p-4 rounded-2xl flex items-center justify-center gap-3 font-black active:scale-95 transition-transform mt-4"
            >
                <LogOut className="w-5 h-5" /> Cerrar Sesión
            </button>

            <p className="text-center text-xs font-medium text-slate-400 mt-8">Delivery Express v1.0.0</p>
        </div>
    );
}
