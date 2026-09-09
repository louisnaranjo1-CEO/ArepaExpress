import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, CheckCircle2, Save, Image as ImageIcon, Key, Trash2, ArrowLeft, Camera, Truck, ShieldCheck, Smartphone, Fingerprint, Car, Bike, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';
import { requestNotificationPermission, disableNotifications } from '../../lib/notifications';
import { VENEZUELA_DATA, VENEZUELA_STATES } from '../../lib/venezuelaData';
import AddressPicker from '../../components/AddressPicker';
import { registerBiometric } from '../../utils/security';
import { driversApi } from '../../lib/api';
import { supabase } from '../../lib/supabase';

export default function DriverProfile() {
    const { user, userData } = useAuth();
    const navigate = useNavigate();
    const [activeView, setActiveView] = useState<'profile' | 'settings' | 'update_data' | 'location' | 'payment_method'>('profile');
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);
    const [updatingBiometrics, setUpdatingBiometrics] = useState(false);
    const [updatingLocation, setUpdatingLocation] = useState(false);

    // Fetch driver-specific profile
    React.useEffect(() => {
        if (!user) return;
        
        let isMounted = true;

        const fetchProfile = async () => {
            try {
                const data = await driversApi.getDriver(user.uid);
                if (!isMounted) return;
                
                setDriverProfile(data);
                const hl = data.home_location || data.homeLocation;
                if (hl) {
                    setLocationForm({
                        state: hl.state || '',
                        city: hl.city || '',
                        coords: hl.coords || null
                    });
                }
                
                const pm = data.payment_mobile || data.paymentMobile;
                if (pm) {
                    setPaymentMobileForm(pm);
                }

                setUpdateForm(prev => ({
                    ...prev,
                    phone: data.phone || prev.phone,
                    vehiclePlate: data.vehicle_plate || data.vehiclePlate || prev.vehiclePlate || '',
                    vehicleType: data.vehicle_type || data.vehicleType || prev.vehicleType || 'moto',
                    vehicleColor: data.vehicle_color || data.vehicleColor || prev.vehicleColor || '',
                    hasAc: data.has_ac ?? data.hasAc ?? prev.hasAc ?? false,
                }));
            } catch (err) {
                console.error("Error fetching driver profile from Supabase:", err);
            }
        };
        
        fetchProfile();
        
        const channel = supabase.channel(`public:drivers:${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.uid}` }, async () => {
                if (!isMounted) return;
                try {
                    const data = await driversApi.getDriver(user.uid);
                    setDriverProfile(prev => ({ ...prev, ...data }));
                } catch(e) {}
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
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
        vehicleColor: '',
        hasAc: false
    });

    // Payment Mobile State
    const [paymentMobileForm, setPaymentMobileForm] = useState({
        bank: '',
        cedula: '',
        phone: ''
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

    const handleSavePaymentMobile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !paymentMobileForm.bank || !paymentMobileForm.cedula || !paymentMobileForm.phone) {
            alert('Por favor completa todos los campos del método de pago.');
            return;
        }

        setLoading(true);
        try {
            const { error } = await supabase.from('drivers').update({
                payment_mobile: paymentMobileForm
            }).eq('id', user.uid);
            if (error) throw error;
            
            alert('Método de pago guardado exitosamente. Ahora podrás recibir liquidaciones automáticamente.');
            setActiveView('profile');
        } catch (error) {
            console.error(error);
            alert('Error al guardar método de pago.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            navigate('/login');
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newEmail) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ email: newEmail });
            if (error) throw error;
            alert('Se ha enviado un enlace de confirmación a tu nuevo correo electrónico.');
            setNewEmail('');
        } catch (error: any) {
            console.error(error);
            alert('Error al cambiar correo: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newPassword) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            alert('Contraseña actualizada con éxito.');
            setNewPassword('');
        } catch (error: any) {
            console.error(error);
            alert('Error al cambiar contraseña: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!user) return;
        const confirmDelete = window.confirm(
            '¿Estás seguro de que deseas eliminar tu cuenta permanentemente? Se borrarán todos tus datos de conductor, vehículos, registros y acceso al sistema.'
        );
        if (!confirmDelete) return;

        try {
            setLoading(true);
            const { error } = await supabase.rpc('delete_user_account');
            if (error) throw error;
            await supabase.auth.signOut();
            alert('Tu cuenta ha sido eliminada exitosamente.');
            navigate('/login');
        } catch (error: any) {
            console.error("Error al eliminar cuenta:", error);
            alert('Error al eliminar cuenta: ' + (error.message || 'Ocurrió un error inesperado'));
        } finally {
            setLoading(false);
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
                const ext = selfieFile.name.split('.').pop() || 'jpg';
                const filePath = `delivery_docs/${user.uid}/selfie_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, selfieFile, { upsert: true });
                if (!upErr) {
                    const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    documents.selfieUrl = pubData.publicUrl;
                }
            }

            // Upload License
            if (licenseFile) {
                const ext = licenseFile.name.split('.').pop() || 'jpg';
                const filePath = `delivery_docs/${user.uid}/license_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, licenseFile, { upsert: true });
                if (!upErr) {
                    const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    documents.licenseUrl = pubData.publicUrl;
                }
            }

            // Upload Vehicle Photo
            if (vehicleFile) {
                const ext = vehicleFile.name.split('.').pop() || 'jpg';
                const filePath = `delivery_docs/${user.uid}/vehicle_${Date.now()}.${ext}`;
                const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, vehicleFile, { upsert: true });
                if (!upErr) {
                    const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
                    documents.vehicleUrl = pubData.publicUrl;
                }
            }

            const requestData = {
                driver_id: user.uid,
                driver_name: driverProfile?.fullName || 'Desconocido',
                phone: updateForm.phone,
                vehicle_type: updateForm.vehicleType,
                vehicle_plate: updateForm.vehiclePlate,
                vehicle_color: updateForm.vehicleColor,
                has_ac: updateForm.hasAc,
                selfie_url: documents.selfieUrl || null,
                license_url: documents.licenseUrl || null,
                vehicle_photo_url: documents.vehicleUrl || null,
                status: 'pending',
                created_at: new Date().toISOString()
            };

            await supabase.from('delivery_update_requests').insert(requestData);

            // Update phone immediately for quicker communication and vehicle specs directly
            if (updateForm.phone && updateForm.phone !== driverProfile?.phone) {
                await supabase.from('profiles').update({ phone: updateForm.phone }).eq('id', user.uid);
            }

            await supabase.from('drivers').update({
                vehicle_color: updateForm.vehicleColor,
                vehicleColor: updateForm.vehicleColor,
                has_ac: updateForm.hasAc,
                hasAc: updateForm.hasAc,
                updated_at: new Date().toISOString()
            }).eq('id', user.uid);

            alert('Datos del vehículo actualizados correctamente.');
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
            const { error } = await supabase.from('drivers').update({
                home_location: {
                    state: locationForm.state,
                    city: locationForm.city,
                    coords: locationForm.coords || null
                },
                updated_at: new Date().toISOString()
            }).eq('id', user.uid);
            
            if (error) throw error;

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
                                    const { error } = await supabase.from('drivers').update({
                                        audio_alerts_enabled: newValue
                                    }).eq('id', user.uid);
                                    if (error) throw error;
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

                    {/* Biometric Toggle */}
                    <div className="space-y-3 pb-6 border-b border-slate-100">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Seguridad Biométrica</label>
                        <div
                            onClick={async () => {
                                if (!user) return;
                                setUpdatingBiometrics(true);
                                try {
                                    if (userData?.biometricLockEnabled) {
                                        // Disable
                                        await supabase.from('profiles').update({
                                            biometric_lock_enabled: false
                                        }).eq('id', user.uid);
                                        alert('Bloqueo biométrico desactivado');
                                    } else {
                                        // Enable
                                        const biometricData = await registerBiometric(user.uid, user.email || '');
                                        if (biometricData) {
                                            await supabase.from('profiles').update({
                                                biometric_lock_enabled: true,
                                                biometric_credential_id: biometricData.id
                                            }).eq('id', user.uid);
                                            alert('Bloqueo biométrico activado');
                                        } else {
                                            alert('No se pudo activar la biometría');
                                        }
                                    }
                                } catch (err: any) {
                                    console.error(err);
                                    alert(`Error: ${err.message || 'Error al configurar biometría'}`);
                                } finally {
                                    setUpdatingBiometrics(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingBiometrics ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Fingerprint className="w-5 h-5 text-indigo-500" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Bloqueo de App</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Usar huella para ingresar</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.biometricLockEnabled ? 'bg-indigo-500' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingBiometrics ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.biometricLockEnabled ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Location Toggle */}
                    <div className="space-y-3 pb-6 border-b border-slate-100">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Geolocalización</label>
                        <div
                            onClick={async () => {
                                if (!user) return;
                                setUpdatingLocation(true);
                                try {
                                    if (userData?.locationPermissionsAllowed) {
                                        // Disable
                                        await supabase.from('profiles').update({
                                            location_permissions_allowed: false
                                        }).eq('id', user.uid);
                                        alert('Ubicación en tiempo real desactivada');
                                    } else {
                                        // Enable
                                        let granted = false;
                                        if (Capacitor.isNativePlatform()) {
                                            try {
                                                const permission = await Geolocation.requestPermissions();
                                                granted = permission.location === 'granted';
                                            } catch (capErr) {
                                                console.warn('Capacitor geolocation permission error:', capErr);
                                            }
                                        } else {
                                            if (!navigator.geolocation) {
                                                alert('Tu navegador no soporta geolocalización');
                                                return;
                                            }
                                            granted = await new Promise<boolean>((resolve) => {
                                                navigator.geolocation.getCurrentPosition(
                                                    () => resolve(true),
                                                    (geoErr) => {
                                                        console.warn('Web geolocation error:', geoErr);
                                                        resolve(false);
                                                    },
                                                    { enableHighAccuracy: true, timeout: 10000 }
                                                );
                                            });
                                        }

                                        if (granted) {
                                            await supabase.from('profiles').update({
                                                location_permissions_allowed: true
                                            }).eq('id', user.uid);
                                            alert('Ubicación en tiempo real activada');
                                        } else {
                                            alert('Se requiere permiso de ubicación para activar esta función');
                                        }
                                    }
                                } catch (err) {
                                    console.error(err);
                                    alert('Error al configurar ubicación');
                                } finally {
                                    setUpdatingLocation(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingLocation ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Navigation className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Ubicación en Tiempo Real</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Necesario para rastreo y entregas</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${userData?.locationPermissionsAllowed ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                            >
                                {updatingLocation ? (
                                    <div className="ml-1 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${userData?.locationPermissionsAllowed ? 'translate-x-6' : 'translate-x-1'
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

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Color del Vehículo o Moto</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Blanco, Negro, Rojo, Azul..."
                                    value={updateForm.vehicleColor}
                                    onChange={e => setUpdateForm({ ...updateForm, vehicleColor: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                                />
                            </div>

                            {(updateForm.vehicleType === 'carro' || updateForm.vehicleType === 'carro_ejecutivo') && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Aire Acondicionado (A/C)</label>
                                    <div
                                        onClick={() => setUpdateForm(prev => ({ ...prev, hasAc: !prev.hasAc }))}
                                        className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${updateForm.hasAc ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-200 text-slate-400'}`}>
                                                ❄️
                                            </div>
                                            <span className="font-bold text-sm text-slate-700">
                                                {updateForm.hasAc ? 'Cuenta con A/C operativo' : 'Sin aire acondicionado'}
                                            </span>
                                        </div>
                                        <div className={`px-3 py-1 rounded-xl text-xs font-black transition-colors ${updateForm.hasAc ? 'bg-cyan-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                            {updateForm.hasAc ? 'Sí ✓' : 'No'}
                                        </div>
                                    </div>
                                </div>
                            )}
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

    if (activeView === 'payment_method') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-6">
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Método de Pago</h2>
                    <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                        Configura tus datos de Pago Móvil para recibir tus ganancias directamente.
                    </p>
                </div>

                <form onSubmit={handleSavePaymentMobile} className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm space-y-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <CreditCard className="w-4 h-4" /> Datos Bancarios
                    </h3>
                    
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Banco</label>
                        <select
                            required
                            value={paymentMobileForm.bank}
                            onChange={e => setPaymentMobileForm({ ...paymentMobileForm, bank: e.target.value })}
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
                            value={paymentMobileForm.cedula}
                            onChange={e => setPaymentMobileForm({ ...paymentMobileForm, cedula: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Teléfono Afiliado</label>
                        <input
                            type="tel"
                            required
                            placeholder="Ej: 04141234567"
                            value={paymentMobileForm.phone}
                            onChange={e => setPaymentMobileForm({ ...paymentMobileForm, phone: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 font-bold text-slate-700 focus:bg-white focus:border-primary transition-all outline-none"
                        />
                    </div>

                    <button disabled={loading} type="submit" className="w-full bg-primary hover:bg-primary text-slate-900 font-black py-4 rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all mt-4">
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></div>
                        ) : (
                            <>
                                <Save className="w-5 h-5" /> Guardar Método de Pago
                            </>
                        )}
                    </button>
                </form>
            </div>
        );
    }

    // Default Profile View
    return (
        <div className="space-y-5 animate-fade-in pb-24 px-4">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mi Perfil</h2>

            {/* Header YANGO Pro */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 rounded-[32px] p-6 text-white text-center relative overflow-hidden shadow-xl shadow-slate-900/10">
                <div className="absolute top-0 right-0 w-36 h-36 bg-primary/10 rounded-full blur-2xl pointer-events-none"></div>
                <div className="relative w-24 h-24 mx-auto mb-3">
                    <img
                        src={(userData?.photoURL && userData.photoURL.trim() !== "") ? userData.photoURL : (driverProfile?.documents?.selfieUrl && driverProfile.documents.selfieUrl.trim() !== "") ? driverProfile.documents.selfieUrl : (user?.photoURL && user.photoURL.trim() !== "") ? user.photoURL : `https://ui-avatars.com/api/?name=${encodeURIComponent(driverProfile?.fullName || user?.displayName || user?.email || 'Conductor')}&background=FACC15&color=000&bold=true`}
                        alt="Foto Conductor"
                        className="w-full h-full rounded-full object-cover border-4 border-primary/40 shadow-lg"
                    />
                    <div className="absolute bottom-0 right-1 w-6 h-6 bg-emerald-500 border-2 border-slate-900 rounded-full flex items-center justify-center shadow">
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    </div>
                </div>

                <h3 className="text-xl font-black text-white tracking-tight">{driverProfile?.fullName || user?.displayName || 'Conductor Pro'}</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{user?.email}</p>

                <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[11px] font-bold text-primary">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Conductor Activo & Verificado
                </div>

                {/* Yango Metrics Bar */}
                <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/10 text-center">
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-2.5">
                        <div className="flex items-center justify-center gap-1 text-amber-400 font-black text-sm">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            <span>{Number(driverProfile?.rating || 5.0).toFixed(1)}</span>
                        </div>
                        <p className="text-[10px] text-slate-300 font-semibold mt-0.5">Calificación</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-2.5">
                        <p className="text-emerald-400 font-black text-sm">{driverProfile?.acceptance_rate || 100}%</p>
                        <p className="text-[10px] text-slate-300 font-semibold mt-0.5">Aceptación</p>
                    </div>
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-2.5">
                        <p className="text-primary font-black text-sm">{driverProfile?.total_trips || 0}</p>
                        <p className="text-[10px] text-slate-300 font-semibold mt-0.5">Viajes</p>
                    </div>
                </div>
            </div>

            {/* Active Vehicle Card */}
            <div className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-800 shadow-inner">
                            {driverProfile?.vehicleType === 'moto' ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}
                        </div>
                        <div>
                            <p className="text-xs font-black text-slate-900 capitalize">
                                {driverProfile?.vehicleType === 'moto' ? 'Motocicleta / MotoTaxi' : driverProfile?.vehicleType === 'carro_ejecutivo' ? 'Vehículo Ejecutivo' : 'Automóvil / Taxi'}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                                {driverProfile?.vehicleBrand ? `${driverProfile.vehicleBrand} ` : ''}
                                {driverProfile?.vehicleModel ? `${driverProfile.vehicleModel} ` : ''}
                                {driverProfile?.vehicleColor ? `• ${driverProfile.vehicleColor}` : ''}
                            </p>
                        </div>
                    </div>
                    {driverProfile?.vehiclePlate ? (
                        <div className="px-3 py-1 bg-slate-900 text-yellow-400 rounded-xl font-mono font-black text-xs tracking-wider border border-yellow-400/30 shadow-sm">
                            {driverProfile.vehiclePlate.toUpperCase()}
                        </div>
                    ) : (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">Sin Placa</span>
                    )}
                </div>
                {driverProfile?.hasAc && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs font-bold text-cyan-600">
                        <span>❄️ Equipado con Aire Acondicionado (A/C)</span>
                    </div>
                )}
            </div>

            {/* Quick Action Navigation */}
            <div className="space-y-3">
                <button onClick={() => setActiveView('update_data')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                            <User className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Editar Vehículo y Documentos</p>
                            <p className="text-xs font-medium text-slate-500">Actualizar placa, fotos y tipo de servicio</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('location')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                            <MapPin className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Zona Base de Trabajo</p>
                            <p className="text-xs font-medium text-slate-500">
                                {locationForm.city ? `${locationForm.city}, ${locationForm.state}` : 'Configurar Estado y Ciudad'}
                            </p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('payment_method')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center shrink-0">
                            <CreditCard className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Cobros y Pago Móvil</p>
                            <p className="text-xs font-medium text-slate-500">
                                {paymentMobileForm.bank ? `Banco ${paymentMobileForm.bank} · ${paymentMobileForm.phone}` : 'Configurar cuenta de liquidación'}
                            </p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-orange-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('settings')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center shrink-0">
                            <Settings className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Seguridad y Cuenta</p>
                            <p className="text-xs font-medium text-slate-500">Contraseña, Correo y Eliminar cuenta</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 transition-colors" />
                </button>
            </div>

            <button
                onClick={handleLogout}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 p-4 rounded-2xl flex items-center justify-center gap-3 font-black active:scale-95 transition-all mt-6 shadow-sm"
            >
                <LogOut className="w-5 h-5 text-slate-500" /> Cerrar Sesión
            </button>
            <p className="text-center text-xs font-medium text-slate-400 mt-4">Deliexpress Driver v2.0 · Estilo Yango</p>
        </div>
    );
}
