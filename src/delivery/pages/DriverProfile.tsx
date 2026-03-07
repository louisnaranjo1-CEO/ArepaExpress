import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, User, FileText, Settings, ShieldCheck, ChevronRight, Key, Mail, Trash2, ArrowLeft, Camera, Truck, UploadCloud } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateEmail, updatePassword, deleteUser } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export default function DriverProfile() {
    const { user, profile } = useAuth();
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState<'profile' | 'settings' | 'update_data'>('profile');

    // Forms state
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Update Request State
    const [updateForm, setUpdateForm] = useState({
        cedula: '',
        vehiclePlate: '',
        vehicleType: 'moto',
    });

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/delivery/login');
        } catch (error) {
            console.error(error);
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newEmail) return;
        setLoading(true);
        try {
            await updateEmail(user, newEmail);
            alert('Correo electrónico actualizado con éxito.');
            setNewEmail('');
        } catch (error: any) {
            console.error(error);
            alert('Error al cambiar correo. Es posible que necesites cerrar sesión y volver a entrar por seguridad. Detalles: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newPassword) return;
        setLoading(true);
        try {
            await updatePassword(user, newPassword);
            alert('Contraseña actualizada con éxito.');
            setNewPassword('');
        } catch (error: any) {
            console.error(error);
            alert('Error al cambiar contraseña. Es posible que necesites cerrar sesión y volver a entrar por seguridad. Detalles: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        if (!window.confirm('¿Estás SEGURO de que deseas eliminar tu cuenta permanentemente? Perderás todo tu historial.')) return;

        try {
            await deleteUser(user);
            navigate('/delivery/login');
        } catch (error: any) {
            console.error(error);
            alert('Error al eliminar cuenta. Inicia sesión de nuevo e intenta de nuevo. Detalles: ' + error.message);
        }
    };

    const handleRequestDataUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !profile) return;

        setLoading(true);
        try {
            await addDoc(collection(db, 'delivery_update_requests'), {
                driverId: user.uid,
                driverName: profile.fullName || 'Desconocido',
                requestedAt: serverTimestamp(),
                status: 'pending',
                newData: updateForm
            });
            alert('Solicitud enviada al administrador. Tus datos se actualizarán una vez aprobados.');
            setUpdateForm({ cedula: '', vehiclePlate: '', vehicleType: 'moto' });
            setActiveView('profile');
        } catch (error) {
            console.error(error);
            alert('Error al enviar la solicitud.');
        } finally {
            setLoading(false);
        }
    };

    if (activeView === 'settings') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Opciones de Seguridad</h2>

                <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-6">
                    <form onSubmit={handleChangeEmail} className="space-y-3">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Cambiar Correo Electrónico</label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="Nuevo correo"
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700"
                            />
                            <button disabled={loading} className="bg-indigo-600 text-white p-3 rounded-2xl font-bold flex-shrink-0">
                                <Mail className="w-5 h-5" />
                            </button>
                        </div>
                    </form>

                    <form onSubmit={handleChangePassword} className="space-y-3 pt-4 border-t border-slate-100">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Cambiar Contraseña</label>
                        <div className="flex gap-2">
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Nueva contraseña"
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700"
                            />
                            <button disabled={loading} className="bg-indigo-600 text-white p-3 rounded-2xl font-bold flex-shrink-0">
                                <Key className="w-5 h-5" />
                            </button>
                        </div>
                    </form>

                    <div className="pt-6 border-t border-slate-100">
                        <button
                            onClick={handleDeleteAccount}
                            className="w-full bg-red-50 text-red-600 p-4 rounded-2xl flex items-center justify-center gap-3 font-black active:scale-95 transition-transform"
                        >
                            <Trash2 className="w-5 h-5" /> Eliminar Cuenta Definitivamente
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (activeView === 'update_data') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-6">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Actualizar Datos</h2>
                    <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                        Si necesitas modificar tu vehículo, placa o documento, envíanos la información nueva. Un administrador revisará la solicitud antes de aplicarla.
                    </p>
                </div>

                <form onSubmit={handleRequestDataUpdate} className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-4">
                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Nueva Cédula</label>
                        <input
                            type="text"
                            required
                            value={updateForm.cedula}
                            onChange={e => setUpdateForm({ ...updateForm, cedula: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Nuevo Vehículo</label>
                        <select
                            value={updateForm.vehicleType}
                            onChange={e => setUpdateForm({ ...updateForm, vehicleType: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 mb-2"
                        >
                            <option value="moto">Motocicleta</option>
                            <option value="carro">Automóvil</option>
                            <option value="bicicleta">Bicicleta</option>
                        </select>
                        <input
                            type="text"
                            required
                            placeholder="Placa del nuevo vehículo"
                            value={updateForm.vehiclePlate}
                            onChange={e => setUpdateForm({ ...updateForm, vehiclePlate: e.target.value })}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-indigo-500 px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700 uppercase"
                        />
                    </div>

                    <div className="p-4 bg-indigo-50 rounded-2xl flex items-start gap-3 text-indigo-800 text-xs font-medium mt-4">
                        <UploadCloud className="w-5 h-5 shrink-0" />
                        <p>Por políticas de seguridad, para actualizar tus fotos (selfie o licencia) debes comunicarte directamente con soporte técnico adjuntando esta solicitud.</p>
                    </div>

                    <button disabled={loading} type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-600/30 active:scale-95 transition-all mt-4">
                        {loading ? 'Enviando...' : 'Enviar Solicitud al Admin'}
                    </button>
                </form>
            </div>
        );
    }

    // Default Profile View
    return (
        <div className="space-y-6 animate-fade-in pb-24 px-4">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mi Perfil</h2>

            <div className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-24 bg-indigo-600/10 backdrop-blur-3xl -z-10"></div>
                <div className="w-24 h-24 bg-white p-1 rounded-full mx-auto mb-4 relative shadow-xl shadow-indigo-600/20">
                    <img
                        src={profile?.documents?.selfieUrl || user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}&background=e0e7ff&color=4f46e5`}
                        alt="Profile"
                        className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full"></div>
                </div>

                <h3 className="text-xl font-black text-slate-900">{profile?.fullName || user?.displayName || 'Piloto'}</h3>
                <p className="text-sm font-medium text-slate-500 mb-4">{user?.email}</p>

                <div className="flex flex-col gap-2">
                    <div className="flex w-full items-center justify-center gap-2 text-xs font-bold bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-full capitalize">
                        <ShieldCheck className="w-4 h-4" /> Cuenta Verificada
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <button onClick={() => setActiveView('update_data')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Actualizar Datos</p>
                            <p className="text-xs font-medium text-slate-500">Solicitar cambio de Cédula o Vehículo</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('settings')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Configuración de Seguridad</p>
                            <p className="text-xs font-medium text-slate-500">Correo, Contraseña, Eliminar y Sesión</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 transition-colors" />
                </button>
            </div>

            <button
                onClick={handleLogout}
                className="w-full bg-slate-100 text-slate-600 p-4 rounded-2xl flex items-center justify-center gap-3 font-black active:scale-95 transition-transform mt-6"
            >
                <LogOut className="w-5 h-5" /> Cerrar Sesión
            </button>
            <p className="text-center text-xs font-medium text-slate-400 mt-6">Delivery Express v1.0.0</p>
        </div>
    );
}
