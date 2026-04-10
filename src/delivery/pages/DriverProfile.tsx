import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, CheckCircle2, Save, Image as ImageIcon, Key, Trash2, ArrowLeft, Camera, Truck, ShieldCheck, Smartphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateEmail, updatePassword, deleteUser } from 'firebase/auth';
import { auth, db, storage } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { requestNotificationPermission, disableNotifications } from '../../lib/notifications';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import AddressPicker from '../../components/AddressPicker';

export default function DriverProfile() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState<'profile' | 'settings' | 'update_data' | 'location'>('profile');
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);

    // Fetch driver-specific profile
    React.useEffect(() => {
        if (!user) return;
        const unsub = onSnapshot(doc(db, 'delivery_drivers', user.uid), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setDriverProfile(data);
                if (data.homeLocation) {
                    setLocationForm({
                        state: data.homeLocation.state || '',
                        city: data.homeLocation.city || '',
                        coords: data.homeLocation.coords || null
                    });
                }
                setUpdateForm(prev => ({
                    ...prev,
                    phone: data.phone || prev.phone,
                    vehiclePlate: prev.vehiclePlate || data.vehiclePlate || '',
                    vehicleType: prev.vehicleType === 'moto' && data.vehicleType ? data.vehicleType : prev.vehicleType,
                    paymentMobile: data.paymentMobile || prev.paymentMobile
                }));
            }
        });
        return () => unsub();
    }, [user]);

    // Forms state
    const [newEmail, setNewEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Update Request State
    const [updateForm, setUpdateForm] = useState({
        phone: '',
        vehiclePlate: '',
        vehicleType: 'moto',
        paymentMobile: {
            bank: '',
            cedula: '',
            phone: ''
        }
    });

    const [locationForm, setLocationForm] = useState({
        state: '',
        city: '',
        coords: null as { lat: number; lng: number } | null
    });
    const [showMap, setShowMap] = useState(false);

    // New Visual States
    const [selfieFile, setSelfieFile] = useState<File | null>(null);
    const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
    const [licenseFile, setLicenseFile] = useState<File | null>(null);
    const [licensePreview, setLicensePreview] = useState<string | null>(null);
    const [vehicleFile, setVehicleFile] = useState<File | null>(null);
    const [vehiclePreview, setVehiclePreview] = useState<string | null>(null);

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

    const handleToggleNotifications = async () => {
        if (!user) return;
        setUpdatingNotifications(true);
        try {
            const isEnabled = userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0);
            if (isEnabled) {
                await disableNotifications(user.uid);
                alert("Notificaciones desactivadas.");
            } else {
                const result = await requestNotificationPermission(user.uid);
                if (result.success) {
                    alert("Notificaciones activadas con éxito! 🎉");
                } else if (result.error) {
                    alert(result.error);
                }
            }
        } catch (err) {
            console.error("Error toggling notifications", err);
            alert("Ocurrió un error al procesar tu solicitud.");
        } finally {
            setUpdatingNotifications(false);
        }
    };

    const handleRequestDataUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !driverProfile) return;

        setLoading(true);
        try {
            let documents = { ...driverProfile.documents };

            // Upload Selfie
            if (selfieFile) {
                const sRef = ref(storage, `delivery_docs/${user.uid}/selfie_${Date.now()}`);
                const snap = await uploadBytes(sRef, selfieFile);
                documents.selfieUrl = await getDownloadURL(snap.ref);
            }

            // Upload License
            if (licenseFile) {
                const lRef = ref(storage, `delivery_docs/${user.uid}/license_${Date.now()}`);
                const snap = await uploadBytes(lRef, licenseFile);
                documents.licenseUrl = await getDownloadURL(snap.ref);
            }

            // Upload Vehicle Photo
            if (vehicleFile) {
                const vRef = ref(storage, `delivery_docs/${user.uid}/vehicle_${Date.now()}`);
                const snap = await uploadBytes(vRef, vehicleFile);
                documents.vehicleUrl = await getDownloadURL(snap.ref);
            }

            const requestData = {
                driverId: user.uid,
                driverName: driverProfile.fullName || 'Desconocido',
                requestedAt: serverTimestamp(),
                status: 'pending',
                newData: {
                    ...updateForm,
                    documents
                }
            };

            await addDoc(collection(db, 'delivery_update_requests'), requestData);

            // Update phone immediately for quicker communication
            if (updateForm.phone && updateForm.phone !== driverProfile.phone) {
                await updateDoc(doc(db, 'delivery_drivers', user.uid), {
                    phone: updateForm.phone
                });
                await updateDoc(doc(db, 'users', user.uid), {
                    phone: updateForm.phone
                });
            }

            alert('Solicitud enviada. Tu número de teléfono se actualizó. Otros datos se actualizarán una vez aprobados.');
            setUpdateForm(prev => ({ ...prev, vehiclePlate: '', vehicleType: 'moto' }));
            setSelfieFile(null);
            setSelfiePreview(null);
            setLicenseFile(null);
            setLicensePreview(null);
            setVehicleFile(null);
            setVehiclePreview(null);
            setActiveView('profile');
        } catch (error) {
            console.error(error);
            alert('Error al enviar la solicitud.');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateLocation = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !locationForm.state || !locationForm.city) {
            alert('Debes seleccionar Estado y Ciudad para continuar.');
            return;
        }

        setLoading(true);
        try {
            await setDoc(doc(db, 'delivery_drivers', user.uid), {
                homeLocation: {
                    state: locationForm.state,
                    city: locationForm.city,
                    coords: locationForm.coords || null
                },
                updatedAt: serverTimestamp()
            }, { merge: true });

            alert('Ubicación base actualizada con éxito.');
            setActiveView('profile');
        } catch (error) {
            console.error(error);
            alert('Error al actualizar la ubicación.');
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
                    {/* Notifications Toggle */}
                    <div className="space-y-3 pb-6 border-b border-slate-100">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Notificaciones</label>
                        <div
                            onClick={handleToggleNotifications}
                            className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingNotifications ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Bell className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Recibir Alertas</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Pedidos y avisos importantes</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0) ? 'bg-primary' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingNotifications ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0) ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Audio Alerts Toggle */}
                    <div className="space-y-3 pb-6 border-b border-slate-100">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Alertas Sonoras</label>
                        <div
                            onClick={async () => {
                                if (!user) return;
                                setUpdatingNotifications(true);
                                try {
                                    const newValue = !(driverProfile?.audioAlertsEnabled ?? true);
                                    await updateDoc(doc(db, 'delivery_drivers', user.uid), {
                                        audioAlertsEnabled: newValue
                                    });
                                } catch (err) {
                                    console.error("Error toggling audio alerts", err);
                                } finally {
                                    setUpdatingNotifications(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingNotifications ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Smartphone className="w-5 h-5 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Sonido de Notificación</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Reproducir alerta al recibir pedidos</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${(driverProfile?.audioAlertsEnabled ?? true) ? 'bg-primary' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingNotifications ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(driverProfile?.audioAlertsEnabled ?? true) ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleChangeEmail} className="space-y-3">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Cambiar Correo Electrónico</label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="Nuevo correo"
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700"
                            />
                            <button disabled={loading} className="bg-primary text-slate-900 p-3 rounded-2xl font-bold flex-shrink-0">
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
                                className="w-full bg-slate-50 border-2 border-transparent focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700"
                            />
                            <button disabled={loading} className="bg-primary text-slate-900 p-3 rounded-2xl font-bold flex-shrink-0">
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
            <div className="space-y-6 animate-fade-in pb-24 px-4 overflow-y-auto">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-6">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Editar Perfil de Piloto</h2>
                    <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                        Actualiza tu información personal y documentos. Un administrador revisará los cambios antes de activarlos.
                    </p>
                </div>

                <form onSubmit={handleRequestDataUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Basic & Vehicle Info */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-6">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <User className="w-4 h-4" /> Información Básica
                            </h3>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Nombre Completo</label>
                                <input
                                    type="text"
                                    defaultValue={driverProfile?.fullName}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                    disabled
                                />
                                <p className="text-[9px] text-slate-400 font-medium italic ml-4">El nombre no es editable directamente por seguridad.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Número de WhatsApp / Teléfono</label>
                                <input
                                    type="tel"
                                    value={updateForm.phone}
                                    onChange={e => setUpdateForm({ ...updateForm, phone: e.target.value })}
                                    className="w-full bg-white border border-slate-200 rounded-2xl p-4 font-bold text-slate-700 focus:border-primary transition-all outline-none"
                                    placeholder="Ej: 04141234567"
                                />
                                <p className="text-[9px] text-primary font-bold italic ml-4">Al guardar, tu teléfono se actualizará inmediatamente.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Tipo de Vehículo</label>
                                <select
                                    value={updateForm.vehicleType}
                                    onChange={e => setUpdateForm({ ...updateForm, vehicleType: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none appearance-none"
                                >
                                    <option value="moto">Motocicleta / MotoTaxi</option>
                                    <option value="carro">Automóvil / Taxi</option>
                                    <option value="carro_ejecutivo">Vehículo Ejecutivo</option>
                                    <option value="bicicleta">Bicicleta</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Placa del Vehículo</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        placeholder="Ej: AB123CD"
                                        value={updateForm.vehiclePlate}
                                        onChange={e => setUpdateForm({ ...updateForm, vehiclePlate: e.target.value })}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 pl-12 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none uppercase"
                                    />
                                    <Truck className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                                </div>
                            </div>
                        </div>

                        {/* Datos para Liquidación (Pago Móvil) */}
                        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-6">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <CreditCard className="w-4 h-4" /> Datos Bancarios (Pago Móvil)
                            </h3>
                            <p className="text-[10px] text-primary font-bold bg-primary/10 p-3 rounded-xl">
                                Carga tus datos para recibir la liquidación de cobros automáticamente.
                            </p>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Banco</label>
                                <select
                                    required
                                    value={updateForm.paymentMobile.bank}
                                    onChange={e => setUpdateForm({ ...updateForm, paymentMobile: { ...updateForm.paymentMobile, bank: e.target.value }})}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                >
                                    <option value="">Selecciona un Banco</option>
                                    <option value="0102">0102 - Banco de Venezuela</option>
                                    <option value="0104">0104 - Banco Venezolano de Crédito</option>
                                    <option value="0105">0105 - Banco Mercantil</option>
                                    <option value="0108">0108 - Banco Provincial</option>
                                    <option value="0114">0114 - Bancaribe</option>
                                    <option value="0115">0115 - Banco Exterior</option>
                                    <option value="0128">0128 - Banco Caroní</option>
                                    <option value="0134">0134 - Banesco</option>
                                    <option value="0138">0138 - Banco Plaza</option>
                                    <option value="0151">0151 - BFC Banco Fondo Común</option>
                                    <option value="0156">0156 - 100% Banco</option>
                                    <option value="0157">0157 - Banco del Sur</option>
                                    <option value="0163">0163 - Bancamiga</option>
                                    <option value="0168">0168 - Bancrecer</option>
                                    <option value="0169">0169 - Mi Banco</option>
                                    <option value="0171">0171 - Banco Activo</option>
                                    <option value="0172">0172 - Bancamiga</option>
                                    <option value="0174">0174 - Banplus</option>
                                    <option value="0175">0175 - Bicentenario</option>
                                    <option value="0177">0177 - Banfanb</option>
                                    <option value="0191">0191 - BNC Nacional de Crédito</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Cédula del Titular</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: V-12345678"
                                    value={updateForm.paymentMobile.cedula}
                                    onChange={e => setUpdateForm({ ...updateForm, paymentMobile: { ...updateForm.paymentMobile, cedula: e.target.value }})}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Teléfono Afiliado</label>
                                <input
                                    type="tel"
                                    required
                                    placeholder="Ej: 04141234567"
                                    value={updateForm.paymentMobile.phone}
                                    onChange={e => setUpdateForm({ ...updateForm, paymentMobile: { ...updateForm.paymentMobile, phone: e.target.value }})}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Enhanced Visual Info */}
                    <div className="space-y-6">
                        <div className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-6">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                <Camera className="w-4 h-4" /> Información Visual
                            </h3>

                            {/* Selfie Upload */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Foto Personal (Selfie)</p>
                                    <UploadCloud className="w-4 h-4 text-primary" />
                                </div>
                                <div className="relative group/selfie h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/selfie:border-primary/50">
                                    {(selfiePreview || driverProfile?.documents?.selfieUrl) ? (
                                        <img src={selfiePreview || driverProfile.documents.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-slate-400">
                                            <ImageIcon className="w-6 h-6" />
                                            <span className="text-[9px] font-bold uppercase tracking-widest">Subir Selfie</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) { setSelfieFile(file); setSelfiePreview(URL.createObjectURL(file)); }
                                    }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/selfie:opacity-100 transition-opacity flex items-center justify-center">
                                        <Camera className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                            </div>

                            {/* License Upload */}
                            <div className="space-y-3 pt-4 border-t border-slate-50">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Licencia de Conducir</p>
                                    <CreditCard className="w-4 h-4 text-primary" />
                                </div>
                                <div className="relative group/license h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/license:border-primary/50">
                                    {(licensePreview || driverProfile?.documents?.licenseUrl) ? (
                                        <img src={licensePreview || driverProfile.documents.licenseUrl} alt="License" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-slate-400">
                                            <ImageIcon className="w-6 h-6" />
                                            <span className="text-[9px] font-bold uppercase tracking-widest">Subir Licencia</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) { setLicenseFile(file); setLicensePreview(URL.createObjectURL(file)); }
                                    }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                </div>
                            </div>

                            {/* Vehicle Image Upload */}
                            <div className="space-y-3 pt-4 border-t border-slate-50">
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Foto del Vehículo</p>
                                    <Truck className="w-4 h-4 text-primary" />
                                </div>
                                <div className="relative group/vehicle h-32 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center overflow-hidden transition-all group-hover/vehicle:border-primary/50">
                                    {(vehiclePreview || driverProfile?.documents?.vehicleUrl) ? (
                                        <img src={vehiclePreview || driverProfile.documents.vehicleUrl} alt="Vehicle" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center gap-1 text-slate-400">
                                            <ImageIcon className="w-6 h-6" />
                                            <span className="text-[9px] font-bold uppercase tracking-widest">Subir Foto Vehículo</span>
                                        </div>
                                    )}
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) { setVehicleFile(file); setVehiclePreview(URL.createObjectURL(file)); }
                                    }} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-2 pt-4">
                        <button disabled={loading} type="submit" className="w-full bg-primary hover:bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all">
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            ) : (
                                <>
                                    <Save className="w-5 h-5" /> Enviar Solicitud de Actualización
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    if (activeView === 'location') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-6">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Ubicación Base</h2>
                    <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                        Actualiza la zona donde te encuentras. Solo recibirás pedidos de restaurantes en tu misma ciudad y a máximo 10km de esta ubicación.
                    </p>
                </div>

                <form onSubmit={handleUpdateLocation} className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-5">
                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Estado</label>
                        <select
                            value={locationForm.state}
                            onChange={e => {
                                const newState = e.target.value;
                                const firstCity = VENEZUELA_DATA[newState]?.[0] || '';
                                setLocationForm({ ...locationForm, state: newState, city: firstCity });
                            }}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700"
                        >
                            <option value="">Selecciona...</option>
                            {VENEZUELA_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1 mb-2">Ciudad</label>
                        <select
                            value={locationForm.city}
                            onChange={e => setLocationForm({ ...locationForm, city: e.target.value })}
                            disabled={!locationForm.state}
                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary px-4 py-3 rounded-2xl outline-none transition-all font-bold text-slate-700 disabled:opacity-50"
                        >
                            <option value="">Selecciona...</option>
                            {locationForm.state && VENEZUELA_DATA[locationForm.state]?.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="pt-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ubicación Exacta (Opcional)</label>
                        {!showMap ? (
                            <button
                                type="button"
                                onClick={() => setShowMap(true)}
                                className="w-full py-4 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-primary hover:bg-indigo-50 transition-colors"
                            >
                                {locationForm.coords ? (
                                    <>
                                        <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                            <CheckCircle2 className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="font-bold text-sm">Ubicación guardada - Toca para cambiar</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                                            <MapPin className="w-5 h-5 text-primary" />
                                        </div>
                                        <span className="font-bold text-sm">Fijar ubicación en el mapa</span>
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="rounded-2xl overflow-hidden border-2 border-indigo-100 h-[300px]">
                                <AddressPicker
                                    onClose={() => setShowMap(false)}
                                    onSave={(data) => {
                                        setLocationForm({ ...locationForm, coords: { lat: data.lat, lng: data.lng } });
                                        setShowMap(false);
                                    }}
                                    initialData={locationForm.coords ? { lat: locationForm.coords.lat, lng: locationForm.coords.lng, name: 'Mi Ubicación', reference: '' } : undefined}
                                />
                            </div>
                        )}
                    </div>

                    <button disabled={loading} type="submit" className="w-full bg-primary hover:bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 active:scale-95 transition-all mt-4">
                        {loading ? 'Guardando...' : 'Guardar Ubicación'}
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
                <div className="absolute top-0 left-0 w-full h-24 bg-primary/10 backdrop-blur-3xl -z-10"></div>
                <div className="w-24 h-24 bg-white p-1 rounded-full mx-auto mb-4 relative shadow-xl shadow-primary/20">
                    <img
                        src={driverProfile?.documents?.selfieUrl || user?.photoURL || `https://ui-avatars.com/api/?name=${user?.email}&background=e0e7ff&color=4f46e5`}
                        alt="Profile"
                        className="w-full h-full rounded-full object-cover"
                    />
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-4 border-white rounded-full"></div>
                </div>

                <h3 className="text-xl font-black text-slate-900">{driverProfile?.fullName || user?.displayName || 'Piloto'}</h3>
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
                        <div className="w-10 h-10 bg-indigo-50 text-primary rounded-xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Editar Perfil</p>
                            <p className="text-xs font-medium text-slate-500">Solicitar cambio de Vehículo</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                </button>

                <button onClick={() => setActiveView('location')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900">Ubicación Base</p>
                            <p className="text-xs font-medium text-slate-500">Cambiar zona de trabajo actual</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-600 transition-colors" />
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
