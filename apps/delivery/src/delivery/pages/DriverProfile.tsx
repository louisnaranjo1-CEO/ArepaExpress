import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, MapPin, CreditCard, LogOut, ShoppingBag, Settings, ChevronRight, Clock, FileText, Bell, Navigation, X, Shield, UploadCloud, CheckCircle2, Save, Image as ImageIcon, Key, Trash2, ArrowLeft, Camera, Truck, ShieldCheck, Smartphone, Fingerprint, Car, Bike, Star, Calendar, Sparkles, AlertTriangle, Wifi, Music, Wind, Check, Lock, Plus, Radio } from 'lucide-react';
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
    const [activeView, setActiveView] = useState<'profile' | 'settings' | 'update_data' | 'location' | 'payment_method' | 'guidelines' | 'payout_frequency' | 'comfort_features' | 'my_vehicles'>('profile');
    const [driverProfile, setDriverProfile] = useState<any>(null);
    const [updatingNotifications, setUpdatingNotifications] = useState(false);
    const [updatingBiometrics, setUpdatingBiometrics] = useState(false);
    const [updatingLocation, setUpdatingLocation] = useState(false);

    // Multi-vehicle Fleet & Thermal Bag states
    const [registeredVehicles, setRegisteredVehicles] = useState<any[]>([]);
    const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
    const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
    const [uploadingNewVehPhoto, setUploadingNewVehPhoto] = useState(false);
    const [newVehicleForm, setNewVehicleForm] = useState({
        type: 'moto' as 'moto' | 'carro' | 'camioneta',
        brand: '',
        model: '',
        year: '',
        color: '',
        plate: '',
        hasAc: false,
        hasThermalBag: false,
        photoUrl: ''
    });

    // Fetch driver-specific profile
    React.useEffect(() => {
        if (!user) return;
        
        let isMounted = true;

        const fetchProfile = async () => {
            try {
                const data = await driversApi.getDriver(user.uid);
                if (!isMounted) return;

                // Query real orders & transport requests to calculate genuine dynamic metrics
                const [ordersRes, transportRes] = await Promise.all([
                    supabase.from('orders').select('id, rating, status').eq('delivery_driver_id', user.uid),
                    supabase.from('transport_requests').select('id, rating, status').eq('driver_id', user.uid)
                ]);

                const ordersData = ordersRes.data || [];
                const transportData = transportRes.data || [];

                const completedOrders = ordersData.filter((o: any) => o.status === 'completed' || o.status === 'delivered');
                const completedTransport = transportData.filter((t: any) => t.status === 'completed');
                const realTotalTrips = completedOrders.length + completedTransport.length;

                const ratedOrders = ordersData.filter((o: any) => typeof o.rating === 'number' && o.rating > 0).map((o: any) => Number(o.rating));
                const ratedTransport = transportData.filter((t: any) => typeof t.rating === 'number' && t.rating > 0).map((t: any) => Number(t.rating));
                const allRatings = [...ratedOrders, ...ratedTransport];

                // Starts strictly at 5.0 stars, and averages dynamically as ratings are submitted
                const realRating = allRatings.length > 0
                    ? Number((allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1))
                    : 5.0;

                // Acceptance starts strictly at 100% and calculates based on completed vs cancelled
                const driverCancelled = transportData.filter((t: any) => t.status === 'cancelled_by_driver').length;
                const totalEngaged = realTotalTrips + driverCancelled;
                const realAcceptance = totalEngaged > 0
                    ? Math.max(0, Math.min(100, Math.round((realTotalTrips / totalEngaged) * 100)))
                    : 100;

                const mergedProfile = {
                    ...data,
                    rating: realRating,
                    acceptance_rate: realAcceptance,
                    acceptanceRate: realAcceptance,
                    total_trips: realTotalTrips,
                    totalTrips: realTotalTrips
                };

                setDriverProfile(mergedProfile);

                // Auto sync metrics into drivers row if needed
                if (data.rating !== realRating || data.acceptance_rate !== realAcceptance || data.total_trips !== realTotalTrips) {
                    supabase.from('drivers').update({
                        rating: realRating,
                        acceptance_rate: realAcceptance,
                        total_trips: realTotalTrips,
                        updated_at: new Date().toISOString()
                    }).eq('id', user.uid).then();
                }

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

                if (data.payout_frequency || data.payoutFrequency) {
                    setPayoutFrequency(data.payout_frequency || data.payoutFrequency);
                }
                if (data.payout_frequency_set_at || data.payoutFrequencySetAt) {
                    setPayoutFrequencySetAt(data.payout_frequency_set_at || data.payoutFrequencySetAt);
                }

                const cf = data.comfort_features || data.comfortFeatures;
                if (cf) {
                    setComfortForm({
                        hasAc: cf.hasAc ?? cf.ac ?? Boolean(data.has_ac),
                        hasMusic: cf.hasMusic ?? cf.music ?? true,
                        hasWifi: cf.hasWifi ?? cf.wifi ?? false,
                        upholstery: cf.upholstery || 'excelente'
                    });
                } else if (data.has_ac !== undefined) {
                    setComfortForm(prev => ({ ...prev, hasAc: Boolean(data.has_ac) }));
                }

                const vList = data.registered_vehicles || [];
                setRegisteredVehicles(vList);
                setActiveVehicleId(data.active_vehicle_id || (vList[0]?.id) || null);

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
        
        const channel = supabase.channel(`driver_profile_realtime_${user.uid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers', filter: `id=eq.${user.uid}` }, async () => {
                if (!isMounted) return;
                try {
                    const data = await driversApi.getDriver(user.uid);
                    setDriverProfile(prev => ({ ...prev, ...data }));
                } catch(e) {}
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `driver_id=eq.${user.uid}` }, () => {
                if (isMounted) fetchProfile();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `delivery_driver_id=eq.${user.uid}` }, () => {
                if (isMounted) fetchProfile();
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [user]);

    // Payout frequency state (Semanal o Quincenal, con bloqueo de 120 días)
    const [payoutFrequency, setPayoutFrequency] = useState<'weekly_friday' | 'weekly_monday' | 'biweekly'>('weekly_friday');
    const [payoutFrequencySetAt, setPayoutFrequencySetAt] = useState<string | null>(null);

    // Comfort features state (aire, musica, wifi, tapiceria)
    const [comfortForm, setComfortForm] = useState({
        hasAc: false,
        hasMusic: true,
        hasWifi: false,
        upholstery: 'excelente' as 'excelente' | 'regular'
    });

    // Check if payout frequency is locked (120 days)
    const isFrequencyLocked = React.useMemo(() => {
        if (!payoutFrequencySetAt) return false;
        const setDate = new Date(payoutFrequencySetAt).getTime();
        const now = Date.now();
        const diffDays = (now - setDate) / (1000 * 60 * 60 * 24);
        return diffDays < 120;
    }, [payoutFrequencySetAt]);

    const daysRemainingLock = React.useMemo(() => {
        if (!payoutFrequencySetAt) return 0;
        const setDate = new Date(payoutFrequencySetAt).getTime();
        const now = Date.now();
        const diffDays = Math.ceil(120 - (now - setDate) / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    }, [payoutFrequencySetAt]);

    const handleSavePayoutFrequency = async (freq: 'weekly_friday' | 'weekly_monday' | 'biweekly') => {
        if (isFrequencyLocked) {
            alert(`No puedes cambiar tu frecuencia de liquidación aún. Quedan ${daysRemainingLock} días de bloqueo.`);
            return;
        }
        setLoading(true);
        try {
            const nowIso = new Date().toISOString();
            // Calculate next deadline (max 15 days)
            const deadline = new Date(Date.now() + (freq === 'biweekly' ? 15 : 7) * 24 * 60 * 60 * 1000).toISOString();
            const { error } = await supabase.from('drivers').update({
                payout_frequency: freq,
                payout_frequency_set_at: nowIso,
                next_commission_deadline: deadline,
                updated_at: nowIso
            }).eq('id', user!.uid);

            if (error) throw error;
            setPayoutFrequency(freq);
            setPayoutFrequencySetAt(nowIso);
            alert('¡Frecuencia de liquidación guardada! Recuerda que el plazo máximo para liquidar comisiones es de 15 días antes de la suspensión preventiva.');
            setActiveView('profile');
        } catch (err: any) {
            console.error('Error saving frequency:', err);
            alert('Error al guardar frecuencia: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveComfortFeatures = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formattedComfort = {
                ...comfortForm,
                ac: comfortForm.hasAc,
                music: comfortForm.hasMusic,
                wifi: comfortForm.hasWifi
            };
            const { error } = await supabase.from('drivers').update({
                comfort_features: formattedComfort,
                has_ac: comfortForm.hasAc,
                hasAc: comfortForm.hasAc,
                updated_at: new Date().toISOString()
            }).eq('id', user!.uid);

            if (error) throw error;
            setDriverProfile((prev: any) => ({
                ...prev,
                comfort_features: formattedComfort,
                comfortFeatures: formattedComfort,
                has_ac: comfortForm.hasAc,
                hasAc: comfortForm.hasAc
            }));
            alert('¡Equipamiento y confort actualizados con éxito!');
            setActiveView('profile');
        } catch (err: any) {
            console.error('Error saving comfort:', err);
            alert('Error al guardar equipamiento: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const [uploadingVehicle, setUploadingVehicle] = useState(false);

    const handleDirectVehicleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        setUploadingVehicle(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const filePath = `delivery_docs/${user.uid}/vehicle_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;

            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            const publicUrl = pubData.publicUrl;

            const currentDocs = driverProfile?.documents || {};
            const updatedDocs = {
                ...currentDocs,
                vehicleUrl: publicUrl,
                vehicle_photo_url: publicUrl
            };

            const { error: dbErr } = await supabase.from('drivers').update({
                vehicle_image_url: publicUrl,
                vehicle_photo_url: publicUrl,
                documents: updatedDocs,
                updated_at: new Date().toISOString()
            }).eq('id', user.uid);

            if (dbErr) throw dbErr;

            setDriverProfile((prev: any) => ({
                ...prev,
                vehicle_image_url: publicUrl,
                vehicleImageUrl: publicUrl,
                vehicle_photo_url: publicUrl,
                documents: updatedDocs
            }));

            alert('¡Foto del vehículo guardada exitosamente! Tus clientes podrán verla al solicitar viajes.');
        } catch (err: any) {
            console.error('Error uploading vehicle image:', err);
            alert('Error al subir la foto del vehículo: ' + (err.message || 'Error'));
        } finally {
            setUploadingVehicle(false);
        }
    };

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

    // Switch Active Vehicle unit with 1-click
    const handleSwitchActiveVehicle = async (veh: any) => {
        if (!user) return;
        setLoading(true);
        try {
            const isComfort = veh.type !== 'moto' && Boolean(veh.has_ac) && Number(veh.year) >= 2009;
            const currentList = registeredVehicles.length > 0 ? registeredVehicles : (driverProfile?.registered_vehicles || []);
            const updatedList = currentList.map((v: any) => ({
                ...v,
                is_active: v.id === veh.id
            }));

            const updatePayload = {
                active_vehicle_id: veh.id,
                registered_vehicles: updatedList,
                vehicle_type: veh.type,
                vehicle_brand: veh.brand,
                vehicle_model: veh.model,
                vehicle_year: veh.year,
                vehicle_color: veh.color,
                vehicle_plate: veh.plate,
                has_ac: Boolean(veh.has_ac),
                has_thermal_bag: Boolean(veh.has_thermal_bag),
                vehicle_image_url: veh.photo_url || driverProfile?.vehicle_image_url,
                is_comfort_eligible: isComfort,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase.from('drivers').update(updatePayload).eq('id', user.uid);
            if (error) throw error;

            setActiveVehicleId(veh.id);
            setRegisteredVehicles(updatedList);
            setDriverProfile((prev: any) => ({
                ...prev,
                ...updatePayload,
                vehicleType: veh.type,
                vehicleBrand: veh.brand,
                vehicleModel: veh.model,
                vehicleYear: veh.year,
                vehicleColor: veh.color,
                vehiclePlate: veh.plate,
                hasAc: Boolean(veh.has_ac)
            }));

            alert(`¡Unidad activada con éxito! Ahora estás operando con: ${veh.brand} ${veh.model} (${veh.plate || 'Sin placa'}). Tus categorías y tarifas se actualizaron automáticamente.`);
        } catch (err: any) {
            console.error("Error switching vehicle:", err);
            alert("No se pudo cambiar de vehículo: " + (err.message || 'Error'));
        } finally {
            setLoading(false);
        }
    };

    // Toggle Thermal Delivery Bag for Motorcyclists
    const handleToggleThermalBag = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const newValue = !(driverProfile?.has_thermal_bag ?? false);
            const currentList = registeredVehicles.length > 0 ? registeredVehicles : (driverProfile?.registered_vehicles || []);
            const updatedList = currentList.map((v: any) => {
                if (v.id === activeVehicleId || v.is_active) {
                    return { ...v, has_thermal_bag: newValue };
                }
                return v;
            });

            const { error } = await supabase.from('drivers').update({
                has_thermal_bag: newValue,
                registered_vehicles: updatedList,
                updated_at: new Date().toISOString()
            }).eq('id', user.uid);

            if (error) throw error;

            setDriverProfile((prev: any) => ({ ...prev, has_thermal_bag: newValue }));
            setRegisteredVehicles(updatedList);
            alert(newValue
                ? '¡Bolso Térmico activado! Ahora recibirás el distintivo especial 🎒 Bolso Térmico en las solicitudes de restaurantes y mandados.'
                : 'Bolso Térmico desactivado.');
        } catch (err: any) {
            console.error("Error toggling thermal bag:", err);
            alert("Error al actualizar bolso térmico: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Upload Photo for new vehicle registration
    const handleNewVehPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;
        setUploadingNewVehPhoto(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const filePath = `delivery_docs/${user.uid}/new_vehicle_${Date.now()}.${ext}`;
            const { error: upErr } = await supabase.storage.from('store_assets').upload(filePath, file, { upsert: true });
            if (upErr) throw upErr;

            const { data: pubData } = supabase.storage.from('store_assets').getPublicUrl(filePath);
            setNewVehicleForm(prev => ({ ...prev, photoUrl: pubData.publicUrl }));
            alert('Foto cargada correctamente.');
        } catch (err: any) {
            console.error("Error uploading new vehicle photo:", err);
            alert("Error subiendo foto: " + (err.message || 'Error'));
        } finally {
            setUploadingNewVehPhoto(false);
        }
    };

    // Register a new vehicle to the fleet
    const handleRegisterNewVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        if (!newVehicleForm.brand.trim() || !newVehicleForm.model.trim() || !newVehicleForm.plate.trim()) {
            alert('Por favor indica Marca, Modelo y Placa del vehículo.');
            return;
        }

        setLoading(true);
        try {
            const newId = `veh_${Date.now().toString(36)}`;
            const isComfort = newVehicleForm.type !== 'moto' && Boolean(newVehicleForm.hasAc) && Number(newVehicleForm.year) >= 2009;
            const newEntry = {
                id: newId,
                type: newVehicleForm.type,
                brand: newVehicleForm.brand.trim(),
                model: newVehicleForm.model.trim(),
                year: newVehicleForm.year.trim(),
                color: newVehicleForm.color.trim(),
                plate: newVehicleForm.plate.trim().toUpperCase(),
                has_ac: Boolean(newVehicleForm.hasAc),
                has_thermal_bag: Boolean(newVehicleForm.hasThermalBag),
                photo_url: newVehicleForm.photoUrl || '',
                is_comfort: isComfort,
                is_active: false,
                created_at: new Date().toISOString()
            };

            const existingList = registeredVehicles.length > 0 ? registeredVehicles : (driverProfile?.registered_vehicles || []);
            const updatedList = [...existingList, newEntry];

            const { error } = await supabase.from('drivers').update({
                registered_vehicles: updatedList,
                updated_at: new Date().toISOString()
            }).eq('id', user.uid);

            if (error) throw error;

            setRegisteredVehicles(updatedList);
            setDriverProfile((prev: any) => ({ ...prev, registered_vehicles: updatedList }));
            setShowAddVehicleModal(false);
            setNewVehicleForm({
                type: 'moto',
                brand: '',
                model: '',
                year: '',
                color: '',
                plate: '',
                hasAc: false,
                hasThermalBag: false,
                photoUrl: ''
            });
            alert('¡Vehículo registrado exitosamente! Puedes activarlo en tu lista cuando desees usarlo.');
        } catch (err: any) {
            console.error("Error registering new vehicle:", err);
            alert("Error al registrar vehículo: " + (err.message || 'Error'));
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

    if (activeView === 'my_vehicles') {
        const vehiclesList = registeredVehicles.length > 0 ? registeredVehicles : (driverProfile?.registered_vehicles || []);
        const activeVeh = vehiclesList.find((v: any) => v.id === activeVehicleId || v.is_active) || vehiclesList[0] || null;

        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4 max-w-lg mx-auto">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-slate-800 tracking-tight">Mis Vehículos</h2>
                        <p className="text-xs text-slate-500 mt-1 font-medium">
                            Gestiona tu flota y selecciona la unidad con la que estás trabajando hoy.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAddVehicleModal(true)}
                        className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-yellow-400 font-black text-xs uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 transition-all active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Agregar</span>
                    </button>
                </div>

                {/* Active Unit Highlight Banner */}
                {activeVeh && (
                    <div className="p-4 bg-gradient-to-r from-amber-500 to-yellow-400 rounded-3xl text-slate-950 shadow-lg border border-yellow-200 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-wider bg-slate-950 text-amber-400 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Unidad Activa en Ruta
                            </span>
                            {activeVeh.plate && (
                                <span className="font-mono font-black text-xs bg-slate-950 text-white px-2 py-0.5 rounded-lg">
                                    {activeVeh.plate}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-slate-950 text-amber-400 rounded-2xl flex items-center justify-center shrink-0">
                                {activeVeh.type === 'moto' ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}
                            </div>
                            <div className="min-w-0">
                                <h4 className="font-black text-base text-slate-950 leading-tight">
                                    {activeVeh.brand} {activeVeh.model} {activeVeh.year ? `(${activeVeh.year})` : ''}
                                </h4>
                                <p className="text-xs font-bold text-slate-800">
                                    Color: {activeVeh.color || 'No especificado'} • {activeVeh.type === 'moto' ? 'Mototaxi' : 'Automóvil'}
                                </p>
                            </div>
                        </div>

                        {/* Badges */}
                        <div className="flex items-center gap-2 pt-1 flex-wrap">
                            {activeVeh.has_ac && (
                                <span className="text-[10px] font-bold bg-slate-950/80 text-cyan-300 px-2 py-0.5 rounded-md">
                                    ❄️ Aire Acondicionado (A/A)
                                </span>
                            )}
                            {activeVeh.is_comfort && (
                                <span className="text-[10px] font-black bg-slate-950 text-yellow-300 px-2 py-0.5 rounded-md">
                                    ✨ Taxi Confort
                                </span>
                            )}
                            {activeVeh.has_thermal_bag && (
                                <span className="text-[10px] font-bold bg-slate-950/80 text-emerald-300 px-2 py-0.5 rounded-md">
                                    🎒 Bolso Térmico
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* If active vehicle is a moto: Equipamiento de Reparto (Bolso Térmico Switch) */}
                {activeVeh?.type === 'moto' && (
                    <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 text-lg">
                                🎒
                            </div>
                            <div>
                                <h4 className="text-xs font-black text-slate-800">Bolso Térmico para Envíos / Comida</h4>
                                <p className="text-[10px] text-slate-500">
                                    {driverProfile?.has_thermal_bag
                                        ? '✓ Activo: Los restaurantes y clientes ven tu distintivo térmico'
                                        : 'Inactivo: Actívalo si llevas bolso térmico para repartos'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleThermalBag}
                            className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all ${
                                driverProfile?.has_thermal_bag
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {driverProfile?.has_thermal_bag ? 'Activado' : 'Activar'}
                        </button>
                    </div>
                )}

                {/* List of Registered Vehicles */}
                <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 ml-1">
                        Todos tus vehículos ({vehiclesList.length})
                    </h3>

                    {vehiclesList.length === 0 ? (
                        <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-sm">
                            <Car className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-600">No tienes vehículos registrados</p>
                            <button
                                onClick={() => setShowAddVehicleModal(true)}
                                className="mt-3 px-4 py-2 bg-primary text-slate-950 font-black text-xs rounded-xl shadow"
                            >
                                Registrar Primer Vehículo
                            </button>
                        </div>
                    ) : (
                        vehiclesList.map((veh: any) => {
                            const isCurrent = veh.id === (activeVehicleId || activeVeh?.id) || veh.is_active;
                            const isComfortEligible = veh.type !== 'moto' && Boolean(veh.has_ac) && Number(veh.year) >= 2009;

                            return (
                                <div
                                    key={veh.id}
                                    className={`bg-white rounded-3xl p-4 border-2 transition-all shadow-sm flex items-center justify-between gap-3 ${
                                        isCurrent ? 'border-primary shadow-md bg-amber-50/20' : 'border-slate-100 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="relative shrink-0">
                                            {veh.photo_url ? (
                                                <img
                                                    src={veh.photo_url}
                                                    alt="Vehículo"
                                                    className="w-14 h-14 rounded-2xl object-cover border border-slate-200"
                                                />
                                            ) : (
                                                <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
                                                    {veh.type === 'moto' ? <Bike className="w-6 h-6" /> : <Car className="w-6 h-6" />}
                                                </div>
                                            )}
                                            {isCurrent && (
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-black">
                                                    ✓
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <h4 className="text-sm font-black text-slate-900 truncate">
                                                    {veh.brand} {veh.model}
                                                </h4>
                                                {veh.year && (
                                                    <span className="text-[11px] font-bold text-slate-400">
                                                        ({veh.year})
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-500 font-medium">
                                                {veh.color ? `Color ${veh.color} • ` : ''}
                                                <span className="font-mono font-bold text-slate-700">{veh.plate}</span>
                                            </p>

                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                {veh.has_ac && (
                                                    <span className="text-[9px] font-bold bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">
                                                        ❄️ A/A
                                                    </span>
                                                )}
                                                {isComfortEligible && (
                                                    <span className="text-[9px] font-black bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">
                                                        ✨ Confort
                                                    </span>
                                                )}
                                                {veh.has_thermal_bag && (
                                                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">
                                                        🎒 Bolso
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="shrink-0">
                                        {isCurrent ? (
                                            <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 font-black text-[11px] rounded-xl border border-emerald-200">
                                                Activo
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleSwitchActiveVehicle(veh)}
                                                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-yellow-400 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm"
                                            >
                                                Activar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Modal Agregar Vehículo */}
                {showAddVehicleModal && (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl p-5 w-full max-w-md shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto space-y-4">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                <h3 className="text-base font-black text-slate-800">Registrar Nuevo Vehículo</h3>
                                <button
                                    onClick={() => setShowAddVehicleModal(false)}
                                    className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <form onSubmit={handleRegisterNewVehicle} className="space-y-3.5">
                                <div>
                                    <label className="text-[11px] font-black uppercase text-slate-400 ml-1">Tipo de Vehículo</label>
                                    <div className="grid grid-cols-3 gap-2 mt-1">
                                        {(['moto', 'carro', 'camioneta'] as const).map(t => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setNewVehicleForm({ ...newVehicleForm, type: t })}
                                                className={`py-2 px-2 rounded-xl text-xs font-black capitalize border transition-all ${
                                                    newVehicleForm.type === t
                                                        ? 'bg-slate-900 text-yellow-400 border-slate-900 shadow-sm'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 ml-1">Marca</label>
                                        <input
                                            required
                                            type="text"
                                            value={newVehicleForm.brand}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, brand: e.target.value })}
                                            placeholder={newVehicleForm.type === 'moto' ? 'Ej: Bera / Empire' : 'Ej: Chevrolet'}
                                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 ml-1">Modelo</label>
                                        <input
                                            required
                                            type="text"
                                            value={newVehicleForm.model}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })}
                                            placeholder={newVehicleForm.type === 'moto' ? 'Ej: SBR 150' : 'Ej: Aveo / Spark'}
                                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 ml-1">Año</label>
                                        <input
                                            required
                                            type="text"
                                            value={newVehicleForm.year}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, year: e.target.value })}
                                            placeholder="2015"
                                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 ml-1">Color</label>
                                        <input
                                            required
                                            type="text"
                                            value={newVehicleForm.color}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, color: e.target.value })}
                                            placeholder="Gris"
                                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:border-amber-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[11px] font-bold text-slate-600 ml-1">Placa</label>
                                        <input
                                            required
                                            type="text"
                                            value={newVehicleForm.plate}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, plate: e.target.value.toUpperCase() })}
                                            placeholder="AB123CD"
                                            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 outline-none focus:border-amber-400"
                                        />
                                    </div>
                                </div>

                                {newVehicleForm.type !== 'moto' ? (
                                    <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newVehicleForm.hasAc}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, hasAc: e.target.checked })}
                                            className="w-4 h-4 rounded text-amber-500"
                                        />
                                        <div className="text-xs font-bold text-slate-800">
                                            ❄️ Cuenta con Aire Acondicionado (A/A) operativo
                                        </div>
                                    </label>
                                ) : (
                                    <label className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newVehicleForm.hasThermalBag}
                                            onChange={e => setNewVehicleForm({ ...newVehicleForm, hasThermalBag: e.target.checked })}
                                            className="w-4 h-4 rounded text-emerald-500"
                                        />
                                        <div className="text-xs font-bold text-slate-800">
                                            🎒 Cuento con Bolso Térmico de Reparto
                                        </div>
                                    </label>
                                )}

                                {/* Foto del vehículo */}
                                <div>
                                    <label className="text-[11px] font-bold text-slate-600 ml-1 block mb-1">
                                        Foto del Vehículo
                                    </label>
                                    <div className="p-3 border-2 border-dashed border-slate-200 rounded-xl text-center">
                                        {newVehicleForm.photoUrl ? (
                                            <div className="relative inline-block">
                                                <img src={newVehicleForm.photoUrl} alt="Vehículo" className="h-24 rounded-lg object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => setNewVehicleForm({ ...newVehicleForm, photoUrl: '' })}
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white rounded-full text-xs"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer flex flex-col items-center">
                                                <Camera className="w-6 h-6 text-slate-400 mb-1" />
                                                <span className="text-xs font-bold text-slate-600">Subir Foto</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    disabled={uploadingNewVehPhoto}
                                                    onChange={handleNewVehPhotoUpload}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                        {uploadingNewVehPhoto && (
                                            <p className="text-[10px] font-bold text-amber-600 mt-1 animate-pulse">Subiendo foto...</p>
                                        )}
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || uploadingNewVehPhoto}
                                    className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-yellow-400 font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95"
                                >
                                    Guardar y Registrar Vehículo
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

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
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${
                                    userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0)
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-white text-slate-400'
                                }`}>
                                    <Bell className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Recibir Alertas</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Pedidos y avisos importantes</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none ${
                                    userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0)
                                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                                        : 'bg-slate-300'
                                }`}
                            >
                                {updatingNotifications ? (
                                    <div className="ml-1.5 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                            userData?.notificationsEnabled || (userData?.fcmTokens && userData.fcmTokens.length > 0)
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
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
                                    setDriverProfile((prev: any) => ({ ...prev, audioAlertsEnabled: newValue, audio_alerts_enabled: newValue }));
                                } catch (err) {
                                    console.error("Error toggling audio alerts", err);
                                } finally {
                                    setUpdatingNotifications(false);
                                }
                            }}
                            className={`w-full flex items-center justify-between p-4 bg-slate-50 rounded-2xl transition-all cursor-pointer hover:bg-slate-100 ${updatingNotifications ? 'opacity-70 pointer-events-none' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${
                                    (driverProfile?.audioAlertsEnabled ?? true)
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-white text-slate-400'
                                }`}>
                                    <Smartphone className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Sonido de Notificación</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Reproducir alerta al recibir pedidos</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none ${
                                    (driverProfile?.audioAlertsEnabled ?? true)
                                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                                        : 'bg-slate-300'
                                }`}
                            >
                                {updatingNotifications ? (
                                    <div className="ml-1.5 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                            (driverProfile?.audioAlertsEnabled ?? true)
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
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
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${
                                    userData?.biometricLockEnabled
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-white text-slate-400'
                                }`}>
                                    <Fingerprint className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Bloqueo de App</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Usar huella para ingresar</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none ${
                                    userData?.biometricLockEnabled
                                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                                        : 'bg-slate-300'
                                }`}
                            >
                                {updatingBiometrics ? (
                                    <div className="ml-1.5 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                            userData?.biometricLockEnabled
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
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
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-colors duration-300 ${
                                    userData?.locationPermissionsAllowed
                                        ? 'bg-emerald-100 text-emerald-600'
                                        : 'bg-white text-slate-400'
                                }`}>
                                    <Navigation className="w-5 h-5" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-bold text-slate-700">Ubicación en Tiempo Real</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Necesario para rastreo y entregas</span>
                                </div>
                            </div>
                            <div
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 ease-in-out focus:outline-none ${
                                    userData?.locationPermissionsAllowed
                                        ? 'bg-emerald-500 shadow-md shadow-emerald-500/30'
                                        : 'bg-slate-300'
                                }`}
                            >
                                {updatingLocation ? (
                                    <div className="ml-1.5 w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <span
                                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                            userData?.locationPermissionsAllowed
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
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

    if (activeView === 'guidelines') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-3 py-1 bg-amber-100 text-amber-800 text-[10px] font-black rounded-full uppercase tracking-wider">
                            Seguridad y Calidad
                        </span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Consejos y Normativas Un 2x3</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Conoce los lineamientos obligatorios para brindar el mejor servicio y maximizar tus ingresos.
                    </p>
                </div>

                <div className="space-y-4">
                    {/* Card 1: Delivery & Muchacho e' Mandado */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-black">
                                <Truck className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm">Delivery y Muchacho e' Mandado</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Protección de Carga</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                            Para prestar servicios de delivery o mandados, debes contar con <strong>bolso o caja térmica adecuada</strong> para proteger los productos. Nunca aceptes pedidos que superen la capacidad de carga o la seguridad de tu vehículo.
                        </p>
                    </div>

                    {/* Card 2: Seguridad Vial */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-black">
                                <Shield className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm">Seguridad Vial Obligatoria</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cero Excusas</p>
                            </div>
                        </div>
                        <ul className="space-y-2 text-xs text-slate-600 font-medium leading-relaxed">
                            <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                <span><strong>Motos:</strong> El uso de casco es <strong>obligatorio</strong> para ti y para tu pasajero en todo momento.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                <span><strong>Carros:</strong> Uso <strong>obligatorio</strong> del cinturón de seguridad para conductor y acompañantes.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-amber-500 font-bold shrink-0">⚠</span>
                                <span>Si un usuario se queja por tu trato o experiencia de viaje, puedes ser <strong>sancionado</strong> o suspendido.</span>
                            </li>
                            <li className="flex items-start gap-2">
                                <span className="text-emerald-500 font-bold shrink-0">✓</span>
                                <span>No superar los límites de velocidad establecidos. Conduce siempre con prudencia.</span>
                            </li>
                        </ul>
                    </div>

                    {/* Card 3: Presencia y Trato */}
                    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-900 text-sm">Presencia, Trato y Uniforme</h3>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Beneficios Un 2x3</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-600 font-medium leading-relaxed">
                            Tu presencia y trato definen tus propinas y calificación. Mantén tu unidad limpia y una presentación impecable.
                        </p>
                        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-3.5 rounded-2xl border border-amber-200/60">
                            <p className="text-xs font-black text-amber-900 mb-0.5">👕 ¿Quieres lucir el uniforme oficial de Un 2x3?</p>
                            <p className="text-[11px] text-amber-800 font-medium">
                                Solicítalo directamente en soporte/oficina. Si has completado tus <strong>primeros 50 viajes</strong>, ¡lo recibirás <strong>completamente gratis</strong>!
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (activeView === 'payout_frequency') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-4">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Frecuencia de Pago de Comisiones</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Elige cada cuánto tiempo liquidarás las comisiones de la plataforma acumuladas en tu balance.
                    </p>
                </div>

                {isFrequencyLocked && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3">
                        <Lock className="w-5 h-5 text-amber-600 shrink-0" />
                        <div>
                            <p className="text-xs font-black text-amber-900">Frecuencia fijada</p>
                            <p className="text-[11px] text-amber-700">
                                Tu modalidad está bloqueada por política de estabilidad. Quedan <strong>{daysRemainingLock} días</strong> antes de poder cambiarla nuevamente.
                            </p>
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {/* Opción Semanal - Viernes */}
                    <div
                        onClick={() => !isFrequencyLocked && handleSavePayoutFrequency('weekly_friday')}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                            payoutFrequency === 'weekly_friday' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 bg-white'
                        } ${isFrequencyLocked ? 'opacity-75 cursor-not-allowed' : 'active:scale-95'}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-xs">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900">Semanal (Viernes)</p>
                                    <p className="text-[11px] text-slate-500">Liquidas comisiones cada viernes</p>
                                </div>
                            </div>
                            {payoutFrequency === 'weekly_friday' && <Check className="w-5 h-5 text-primary" />}
                        </div>
                    </div>

                    {/* Opción Semanal - Lunes */}
                    <div
                        onClick={() => !isFrequencyLocked && handleSavePayoutFrequency('weekly_monday')}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                            payoutFrequency === 'weekly_monday' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 bg-white'
                        } ${isFrequencyLocked ? 'opacity-75 cursor-not-allowed' : 'active:scale-95'}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-black text-xs">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900">Semanal (Lunes)</p>
                                    <p className="text-[11px] text-slate-500">Liquidas comisiones cada lunes</p>
                                </div>
                            </div>
                            {payoutFrequency === 'weekly_monday' && <Check className="w-5 h-5 text-primary" />}
                        </div>
                    </div>

                    {/* Opción Quincenal */}
                    <div
                        onClick={() => !isFrequencyLocked && handleSavePayoutFrequency('biweekly')}
                        className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                            payoutFrequency === 'biweekly' ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 bg-white'
                        } ${isFrequencyLocked ? 'opacity-75 cursor-not-allowed' : 'active:scale-95'}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black text-xs">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900">Quincenal (Cada 15 días)</p>
                                    <p className="text-[11px] text-slate-500">Plazo máximo permitido</p>
                                </div>
                            </div>
                            {payoutFrequency === 'biweekly' && <Check className="w-5 h-5 text-primary" />}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-100 rounded-2xl text-xs text-slate-600 space-y-1.5 font-medium">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        Límite estricto de liquidación:
                    </p>
                    <p>
                        El plazo máximo no negociable es de <strong>15 días</strong>. Si alcanzas este límite sin registrar tu comprobante de pago, la cuenta se suspenderá automáticamente impidiendo recibir nuevos viajes hasta que se reporte el pago.
                    </p>
                    <p className="text-[11px] text-slate-500">
                        * Al configurar tu frecuencia, quedará bloqueada durante 120 días.
                    </p>
                </div>
            </div>
        );
    }

    if (activeView === 'comfort_features') {
        return (
            <div className="space-y-6 animate-fade-in pb-24 px-4">
                <button onClick={() => setActiveView('profile')} className="flex items-center gap-2 text-slate-500 font-bold mb-4">
                    <ArrowLeft className="w-5 h-5" /> Volver al Perfil
                </button>
                <div className="mb-4">
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Equipamiento y Confort</h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        Informa a los clientes sobre las comodidades de tu vehículo para mejorar tu calificación y asignación.
                    </p>
                </div>

                <form onSubmit={handleSaveComfortFeatures} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
                    {/* Foto del Vehículo (Visible para tus Clientes) */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/70 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                                    <Camera className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-black text-slate-900">Foto del Vehículo</p>
                                    <p className="text-[10px] text-slate-500">Visible para tus clientes al solicitar viajes</p>
                                </div>
                            </div>
                            {(driverProfile?.vehicle_image_url || driverProfile?.documents?.vehicleUrl) && (
                                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                                    ✓ Activa
                                </span>
                            )}
                        </div>

                        {/* Preview / Upload Area */}
                        <div className="relative group/veh h-40 rounded-2xl bg-white border-2 border-dashed border-slate-300 flex flex-col items-center justify-center overflow-hidden transition-all hover:border-emerald-500">
                            {(driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl || (driverProfile?.documents as any)?.vehicle_photo_url) ? (
                                <>
                                    <img
                                        src={driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl || (driverProfile?.documents as any)?.vehicle_photo_url}
                                        alt="Vehículo"
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/veh:opacity-100 transition-opacity flex flex-col items-center justify-center text-white gap-1">
                                        <Camera className="w-6 h-6" />
                                        <span className="text-[10px] font-bold">Cambiar foto</span>
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-1.5 text-slate-400 p-4 text-center">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                        <Car className="w-5 h-5" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700">Toca para subir foto de tu vehículo</span>
                                    <span className="text-[10px] text-slate-400">Los clientes podrán reconocer tu vehículo al llegar</span>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                disabled={uploadingVehicle}
                                onChange={handleDirectVehicleUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            />
                            {uploadingVehicle && (
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center gap-2 text-xs font-bold text-slate-800 z-20">
                                    <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span>Subiendo foto...</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Aire Acondicionado */}
                    <div
                        onClick={() => setComfortForm(prev => ({ ...prev, hasAc: !prev.hasAc }))}
                        className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                                comfortForm.hasAc ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                            }`}>
                                <Wind className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900">Aire Acondicionado (A/C)</p>
                                <p className="text-[10px] text-slate-500">
                                    {comfortForm.hasAc ? '❄️ Climatización activa' : 'Sin aire acondicionado'}
                                </p>
                            </div>
                        </div>
                        <div
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 ease-in-out ${
                                comfortForm.hasAc ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-300'
                            }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                    comfortForm.hasAc ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </div>
                    </div>

                    {/* Buena Música */}
                    <div
                        onClick={() => setComfortForm(prev => ({ ...prev, hasMusic: !prev.hasMusic }))}
                        className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                                comfortForm.hasMusic ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                            }`}>
                                <Music className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900">Buena Música</p>
                                <p className="text-[10px] text-slate-500">
                                    {comfortForm.hasMusic ? '🎵 Ambiente musical agradable' : 'Sin música'}
                                </p>
                            </div>
                        </div>
                        <div
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 ease-in-out ${
                                comfortForm.hasMusic ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-300'
                            }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                    comfortForm.hasMusic ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </div>
                    </div>

                    {/* Wifi */}
                    <div
                        onClick={() => setComfortForm(prev => ({ ...prev, hasWifi: !prev.hasWifi }))}
                        className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-300 ${
                                comfortForm.hasWifi ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-400'
                            }`}>
                                <Wifi className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900">Conexión Wi-Fi</p>
                                <p className="text-[10px] text-slate-500">
                                    {comfortForm.hasWifi ? '📶 Internet compartido para pasajeros' : 'Sin conexión Wi-Fi'}
                                </p>
                            </div>
                        </div>
                        <div
                            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-all duration-300 ease-in-out ${
                                comfortForm.hasWifi ? 'bg-emerald-500 shadow-md shadow-emerald-500/30' : 'bg-slate-300'
                            }`}
                        >
                            <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ease-in-out ${
                                    comfortForm.hasWifi ? 'translate-x-6' : 'translate-x-1'
                                }`}
                            />
                        </div>
                    </div>

                    {/* Tapicería */}
                    <div className="p-3.5 bg-slate-50 rounded-2xl space-y-2">
                        <label className="text-xs font-black text-slate-900 block">Calidad y Estado de Tapicería</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setComfortForm({ ...comfortForm, upholstery: 'excelente' })}
                                className={`py-2.5 rounded-xl font-bold text-xs transition-all ${
                                    comfortForm.upholstery === 'excelente'
                                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                }`}
                            >
                                ✨ Excelente
                            </button>
                            <button
                                type="button"
                                onClick={() => setComfortForm({ ...comfortForm, upholstery: 'regular' })}
                                className={`py-2.5 rounded-xl font-bold text-xs transition-all ${
                                    comfortForm.upholstery === 'regular'
                                        ? 'bg-slate-700 text-white shadow-md'
                                        : 'bg-white text-slate-600 border border-slate-200'
                                }`}
                            >
                                Regular
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary text-slate-900 font-black py-3.5 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all text-xs uppercase tracking-wider flex items-center justify-center gap-2 mt-2"
                    >
                        <Save className="w-4 h-4" /> Guardar Equipamiento
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

            {/* Active Vehicle Card with Direct Vehicle Photo */}
            <div className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-100 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                        <div className="relative">
                            {(driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl || (driverProfile?.documents as any)?.vehicle_photo_url) ? (
                                <img
                                    src={driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl || (driverProfile?.documents as any)?.vehicle_photo_url}
                                    alt="Vehículo"
                                    className="w-14 h-14 bg-slate-100 rounded-2xl object-cover border-2 border-emerald-400/60 shadow-sm"
                                />
                            ) : (
                                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-800 shadow-inner">
                                    {driverProfile?.vehicleType === 'moto' ? <Bike className="w-7 h-7" /> : <Car className="w-7 h-7" />}
                                </div>
                            )}
                            <label className="absolute -bottom-1 -right-1 w-6 h-6 bg-slate-900 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center cursor-pointer shadow border-2 border-white transition-colors" title="Cambiar foto del vehículo">
                                <Camera className="w-3 h-3" />
                                <input
                                    type="file"
                                    accept="image/*"
                                    disabled={uploadingVehicle}
                                    onChange={handleDirectVehicleUpload}
                                    className="hidden"
                                />
                            </label>
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
                            <p className="text-[10px] font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                                {(driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl) ? '✓ Foto visible para tus clientes' : '⚠️ Sin foto de vehículo'}
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

                {uploadingVehicle && (
                    <div className="p-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                        Subiendo foto del vehículo...
                    </div>
                )}

                {/* If no vehicle photo, prompt to upload one */}
                {!(driverProfile?.vehicle_image_url || driverProfile?.vehicleImageUrl || driverProfile?.documents?.vehicleUrl || (driverProfile?.documents as any)?.vehicle_photo_url) && !uploadingVehicle && (
                    <label className="w-full py-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-xl flex items-center justify-between cursor-pointer transition-colors">
                        <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
                            <Camera className="w-4 h-4 text-amber-600" />
                            <span>Añadir foto del vehículo para tus clientes</span>
                        </div>
                        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-200/60 px-2 py-0.5 rounded-lg">Subir</span>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleDirectVehicleUpload}
                            className="hidden"
                        />
                    </label>
                )}

                {/* Vehicle Badges */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap text-xs">
                    {driverProfile?.hasAc && (
                        <span className="bg-cyan-50 text-cyan-700 font-bold px-2 py-1 rounded-lg border border-cyan-200">
                            ❄️ Aire Acondicionado (A/A)
                        </span>
                    )}
                    {(driverProfile?.is_comfort_eligible || (driverProfile?.vehicleType !== 'moto' && driverProfile?.hasAc && Number(driverProfile?.vehicleYear || driverProfile?.vehicle_year) >= 2009)) && (
                        <span className="bg-amber-100 text-amber-900 font-black px-2 py-1 rounded-lg border border-amber-300">
                            ✨ Taxi Confort Elegible
                        </span>
                    )}
                    {driverProfile?.has_thermal_bag && (
                        <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-lg border border-emerald-200">
                            🎒 Bolso Térmico
                        </span>
                    )}
                </div>

                {/* Thermal bag quick toggle for moto */}
                {driverProfile?.vehicleType === 'moto' && (
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-base">🎒</span>
                            <div>
                                <p className="text-xs font-black text-slate-800">Bolso Térmico</p>
                                <p className="text-[10px] text-slate-400">Prioridad en órdenes de comida</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleThermalBag}
                            className={`px-3 py-1 rounded-xl text-xs font-black transition-all ${
                                driverProfile?.has_thermal_bag
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {driverProfile?.has_thermal_bag ? 'Activado' : 'Activar'}
                        </button>
                    </div>
                )}

                {/* Manage Vehicles Button */}
                <div className="pt-2 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={() => setActiveView('my_vehicles')}
                        className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-yellow-400 font-black text-xs uppercase tracking-wider rounded-xl shadow transition-all active:scale-98 flex items-center justify-center gap-2"
                    >
                        <Car className="w-4 h-4" />
                        <span>Gestionar Mis Vehículos ({registeredVehicles.length || 1})</span>
                    </button>
                </div>
            </div>

            {/* Quick Action Navigation */}
            <div className="space-y-3">
                <button onClick={() => setActiveView('my_vehicles')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                            <Car className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Mis Vehículos / Flota ({registeredVehicles.length || 1})</p>
                            <p className="text-xs font-medium text-slate-500">Cambiar unidad activa o registrar otro vehículo</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600 transition-colors" />
                </button>

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

                <button onClick={() => setActiveView('payout_frequency')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Frecuencia de Pago de Comisiones</p>
                            <p className="text-xs font-medium text-slate-500">
                                {payoutFrequency === 'weekly_friday' ? 'Semanal (Viernes)' : payoutFrequency === 'weekly_monday' ? 'Semanal (Lunes)' : 'Quincenal (Cada 15 días)'}
                            </p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-amber-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('comfort_features')} className="w-full bg-white p-4 rounded-2xl flex items-center justify-between border border-slate-100 shadow-sm active:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center shrink-0">
                            <Wind className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-slate-900 text-sm">Foto del Vehículo y Confort</p>
                            <p className="text-xs font-medium text-slate-500">Foto para clientes, Aire A/C, música y Wi-Fi</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-cyan-600 transition-colors" />
                </button>

                <button onClick={() => setActiveView('guidelines')} className="w-full bg-gradient-to-r from-amber-500/10 to-yellow-500/10 p-4 rounded-2xl flex items-center justify-between border border-amber-300/40 shadow-sm active:scale-[0.99] transition-all group">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-amber-500 text-slate-950 rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div className="text-left">
                            <div className="flex items-center gap-2">
                                <p className="font-black text-slate-900 text-sm">Consejos y Normativas Un 2x3</p>
                                <span className="bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">Reglas</span>
                            </div>
                            <p className="text-xs font-medium text-slate-600">Seguridad vial, bolsos térmicos y uniforme gratis</p>
                        </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-amber-600 group-hover:translate-x-0.5 transition-transform" />
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
