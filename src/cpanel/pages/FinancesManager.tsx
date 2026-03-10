import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, onSnapshot, orderBy, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { Save, Wallet, Receipt, CreditCard, DollarSign, Activity, Image as ImageIcon, UploadCloud, Trash2, Globe, Layout, CheckCircle, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FinancesManager() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'payments' | 'subscriptions' | 'banners'>('payments');
    const [bannerRequests, setBannerRequests] = useState<any[]>([]);

    // Default configuration structure
    const [config, setConfig] = useState<any>({
        paymentMethods: {
            pagoMovil: {
                active: true,
                bank: '',
                phone: '',
                idf: '',
                logoUrl: ''
            },
            zelle: {
                active: false,
                email: '',
                name: '',
                logoUrl: ''
            },
            transfer: {
                active: false,
                bank: '',
                accountNumber: '',
                name: '',
                idf: '',
                logoUrl: ''
            },
            usdt: {
                active: false,
                wallet: '',
                network: 'TRC20',
                logoUrl: ''
            },
            cash: {
                active: true,
                logoUrl: ''
            }
        }
    });

    const [subscriptionConfig, setSubscriptionConfig] = useState<any>({
        plans: {
            national: {
                id: 'national',
                name: 'Plan Nacional',
                price: 0,
                updateLimit: 3,
                scope: 'national'
            },
            state: {
                id: 'state',
                name: 'Plan Estadal',
                price: 0,
                updateLimit: 3,
                scope: 'state'
            },
            city: {
                id: 'city',
                name: 'Plan Municipal',
                price: 0,
                updateLimit: 3,
                scope: 'city'
            }
        },
        bannerUpdateLimit: 3
    });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // Fetch Finance Config
                const financeRef = doc(db, 'system_configs', 'finances');
                const financeSnap = await getDoc(financeRef);
                if (financeSnap.exists()) {
                    const data = financeSnap.data();
                    const mergedPaymentMethods = { ...config.paymentMethods };
                    if (data.paymentMethods) {
                        Object.keys(data.paymentMethods).forEach(key => {
                            mergedPaymentMethods[key] = {
                                ...mergedPaymentMethods[key],
                                ...data.paymentMethods[key]
                            };
                        });
                    }
                    setConfig({ paymentMethods: mergedPaymentMethods });
                }

                // Fetch Subscription Config
                const subRef = doc(db, 'system_configs', 'subscriptions');
                const subSnap = await getDoc(subRef);
                if (subSnap.exists()) {
                    setSubscriptionConfig(subSnap.data());
                }
            } catch (error) {
                console.error("Error fetching configs:", error);
                toast.error("Error al cargar la configuración.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchConfig();

        // Fetch Banner Requests realtime
        const bannerQuery = query(collection(db, 'banner_requests'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(bannerQuery, (snap) => {
            const requests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setBannerRequests(requests);
        }, (error) => {
            console.error("Error fetching banner requests:", error);
        });

        return () => unsubscribe();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await Promise.all([
                setDoc(doc(db, 'system_configs', 'finances'), config),
                setDoc(doc(db, 'system_configs', 'subscriptions'), subscriptionConfig)
            ]);
            toast.success("Configuración guardada correctamente");
        } catch (error) {
            console.error("Error saving configs:", error);
            toast.error("Error al guardar la configuración");
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateBannerStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
        try {
            await updateDoc(doc(db, 'banner_requests', id), { status: newStatus });
            toast.success(`Solicitud ${newStatus === 'approved' ? 'aprobada' : 'rechazada'}`);
        } catch (error) {
            console.error(error);
            toast.error("Error al actualizar el estado");
        }
    };

    const handleLogoUpload = async (methodId: string, file: File) => {
        setUploadingLogo(methodId);
        try {
            const timestamp = Date.now();
            const storageRef = ref(storage, `payment_logos/${methodId}_${timestamp}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            // 1. Update local state
            setConfig((prev: any) => ({
                ...prev,
                paymentMethods: {
                    ...prev.paymentMethods,
                    [methodId]: {
                        ...prev.paymentMethods[methodId],
                        logoUrl: downloadURL
                    }
                }
            }));

            // 2. Perform atomic update in Firestore so it's saved immediately
            const financeRef = doc(db, 'system_configs', 'finances');
            await updateDoc(financeRef, {
                [`paymentMethods.${methodId}.logoUrl`]: downloadURL
            });

            toast.success("Logo guardado correctamente");
        } catch (error: any) {
            console.error("Error uploading logo:", error);
            if (error.code === 'storage/unauthorized') {
                toast.error("Permiso denegado. Las reglas de Storage están siendo actualizadas.");
            } else {
                toast.error("Error al procesar el logo.");
            }
        } finally {
            setUploadingLogo(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    const LogoSection = ({ methodId }: { methodId: string }) => (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-4">
            <div className="relative group">
                <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
                    {config.paymentMethods[methodId].logoUrl ? (
                        <img src={config.paymentMethods[methodId].logoUrl} alt="Logo" className="w-full h-full object-contain" />
                    ) : (
                        <ImageIcon className="w-6 h-6 text-slate-400" />
                    )}
                </div>
                {uploadingLogo === methodId && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl">
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
            </div>
            <div className="flex-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Logo del Método</label>
                <div className="flex gap-2">
                    <label className="flex-1 cursor-pointer">
                        <div className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                            <UploadCloud className="w-4 h-4" />
                            {config.paymentMethods[methodId].logoUrl ? 'Cambiar Logo' : 'Subir Logo'}
                        </div>
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleLogoUpload(methodId, file);
                            }}
                        />
                    </label>
                    <button
                        onClick={async () => {
                            if (!window.confirm("¿Seguro que quieres eliminar este logo?")) return;
                            setConfig((prev: any) => ({
                                ...prev,
                                paymentMethods: {
                                    ...prev.paymentMethods,
                                    [methodId]: { ...prev.paymentMethods[methodId], logoUrl: '' }
                                }
                            }));
                            try {
                                const financeRef = doc(db, 'system_configs', 'finances');
                                await updateDoc(financeRef, {
                                    [`paymentMethods.${methodId}.logoUrl`]: ''
                                });
                                toast.success("Logo eliminado");
                            } catch (err) {
                                console.error(err);
                                toast.error("Error al actualizar la base de datos");
                            }
                        }}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <header className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
                        {activeTab === 'payments' ? <Wallet className="w-6 h-6 text-white" /> : <Layout className="w-6 h-6 text-white" />}
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">
                            {activeTab === 'payments' ? 'Finanzas y Pagos' : activeTab === 'subscriptions' ? 'Planes de Suscripción' : 'Solicitudes de Banners'}
                        </h1>
                        <p className="text-sm font-medium text-slate-500 mt-0.5">
                            {activeTab === 'payments'
                                ? 'Configura cómo tus clientes te pagan'
                                : activeTab === 'subscriptions'
                                    ? 'Gestiona los planes de suscripción para restaurantes'
                                    : 'Aprueba o rechaza banners pagados por restaurantes'
                            }
                        </p>
                    </div>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3.5 rounded-2xl font-black hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-600/20 disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </header>

            {/* Tabs */}
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mb-8">
                <button
                    onClick={() => setActiveTab('payments')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'payments'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Wallet className="w-4 h-4" />
                    Métodos de Pago
                </button>
                <button
                    onClick={() => setActiveTab('subscriptions')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'subscriptions'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <Layout className="w-4 h-4" />
                    Suscripciones
                </button>
                <button
                    onClick={() => setActiveTab('banners')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === 'banners'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <ImageIcon className="w-4 h-4" />
                    Banners
                </button>
            </div>

            {activeTab === 'payments' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                    {/* Pago Móvil */}
                    <div className={`p-6 bg-white rounded-[32px] border-2 transition-all flex flex-col ${config.paymentMethods.pagoMovil.active ? 'border-primary shadow-lg shadow-primary/5' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Pago Móvil</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.paymentMethods.pagoMovil.active}
                                    onChange={e => setConfig((prev: any) => ({
                                        ...prev,
                                        paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, active: e.target.checked } }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">Banco</label>
                                <input type="text" placeholder="Ej: Banesco"
                                    value={config.paymentMethods.pagoMovil.bank}
                                    onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, bank: e.target.value } } }))}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 transition-all outline-none" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase px-1">Teléfono</label>
                                    <input type="text" placeholder="0412..."
                                        value={config.paymentMethods.pagoMovil.phone}
                                        onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, phone: e.target.value } } }))}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase px-1">Cédula</label>
                                    <input type="text" placeholder="V-123..."
                                        value={config.paymentMethods.pagoMovil.idf}
                                        onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, idf: e.target.value } } }))}
                                        className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                                </div>
                            </div>
                        </div>
                        <LogoSection methodId="pagoMovil" />
                    </div>

                    {/* Zelle */}
                    <div className={`p-6 bg-white rounded-[32px] border-2 transition-all flex flex-col ${config.paymentMethods.zelle.active ? 'border-indigo-600 shadow-lg shadow-indigo-600/5' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                    <Globe className="w-5 h-5" />
                                </div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Zelle</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.paymentMethods.zelle.active}
                                    onChange={e => setConfig((prev: any) => ({
                                        ...prev,
                                        paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, active: e.target.checked } }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">Correo Electrónico</label>
                                <input type="email" placeholder="email@zelle.com"
                                    value={config.paymentMethods.zelle.email}
                                    onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, email: e.target.value } } }))}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">Nombre Completo</label>
                                <input type="text" placeholder="Titular de cuenta"
                                    value={config.paymentMethods.zelle.name}
                                    onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, name: e.target.value } } }))}
                                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                            </div>
                        </div>
                        <LogoSection methodId="zelle" />
                    </div>

                    {/* Transferencia */}
                    <div className={`p-6 bg-white rounded-[32px] border-2 transition-all flex flex-col ${config.paymentMethods.transfer.active ? 'border-orange-500 shadow-lg shadow-orange-500/5' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                                    <Activity className="w-5 h-5" />
                                </div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Transferencia</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.paymentMethods.transfer.active}
                                    onChange={e => setConfig((prev: any) => ({
                                        ...prev,
                                        paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, active: e.target.checked } }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <input type="text" placeholder="Banco"
                                value={config.paymentMethods.transfer.bank}
                                onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, bank: e.target.value } } }))}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                            <input type="text" placeholder="Número de Cuenta"
                                value={config.paymentMethods.transfer.accountNumber}
                                onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, accountNumber: e.target.value } } }))}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                            <input type="text" placeholder="Nombre"
                                value={config.paymentMethods.transfer.name}
                                onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, name: e.target.value } } }))}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                        </div>
                        <LogoSection methodId="transfer" />
                    </div>

                    {/* USDT */}
                    <div className={`p-6 bg-white rounded-[32px] border-2 transition-all flex flex-col ${config.paymentMethods.usdt.active ? 'border-yellow-500 shadow-lg shadow-yellow-500/5' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center text-yellow-600">
                                    <ImageIcon className="w-5 h-5" />
                                </div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">USDT</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.paymentMethods.usdt.active}
                                    onChange={e => setConfig((prev: any) => ({
                                        ...prev,
                                        paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, active: e.target.checked } }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                            </label>
                        </div>

                        <div className="space-y-4">
                            <input type="text" placeholder="Wallet Address"
                                value={config.paymentMethods.usdt.wallet}
                                onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, wallet: e.target.value } } }))}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none font-mono" />
                            <input type="text" placeholder="Red (Ej: TRC20)"
                                value={config.paymentMethods.usdt.network}
                                onChange={e => setConfig((prev: any) => ({ ...prev, paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, network: e.target.value } } }))}
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                        </div>
                        <LogoSection methodId="usdt" />
                    </div>

                    {/* Efectivo */}
                    <div className={`p-6 bg-white rounded-[32px] border-2 transition-all flex flex-col ${config.paymentMethods.cash.active ? 'border-emerald-500 shadow-lg shadow-emerald-500/5' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Efectivo</h3>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={config.paymentMethods.cash.active}
                                    onChange={e => setConfig((prev: any) => ({
                                        ...prev,
                                        paymentMethods: { ...prev.paymentMethods, cash: { ...prev.paymentMethods.cash, active: e.target.checked } }
                                    }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>

                        <div className="flex-1 flex items-center justify-center p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100 line-dashed">
                            <p className="text-xs font-bold text-emerald-700 text-center">Sin campos adicionales requeridos para pago en efectivo.</p>
                        </div>
                        <LogoSection methodId="cash" />
                    </div>
                </div>
            ) : activeTab === 'subscriptions' ? (
                <div className="space-y-6 pb-20">
                    <div className="bg-white rounded-[32px] border-2 border-slate-100 p-8">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                <Activity className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Configuración de Planes</h3>
                                <p className="text-sm text-slate-500">Define los costos y límites para cada nivel de suscripción</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {Object.values(subscriptionConfig.plans).map((plan: any) => (
                                <div key={plan.id} className="p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-black text-slate-900 capitalize">{plan.name}</h4>
                                        <div className="px-3 py-1 bg-indigo-100 text-indigo-600 rounded-full text-[10px] font-black uppercase">
                                            {plan.scope === 'national' ? 'Todo el País' : plan.scope === 'state' ? 'Por Estado' : 'Por Ciudad'}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Precio Mensual ($)</label>
                                            <input
                                                type="number"
                                                value={plan.price}
                                                onChange={e => {
                                                    const newPlans = { ...subscriptionConfig.plans };
                                                    newPlans[plan.id] = { ...plan, price: Number(e.target.value) };
                                                    setSubscriptionConfig({ ...subscriptionConfig, plans: newPlans });
                                                }}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-600/20"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase px-1">Límite de Banners</label>
                                            <input
                                                type="number"
                                                value={plan.updateLimit}
                                                onChange={e => {
                                                    const newPlans = { ...subscriptionConfig.plans };
                                                    newPlans[plan.id] = { ...plan, updateLimit: Number(e.target.value) };
                                                    setSubscriptionConfig({ ...subscriptionConfig, plans: newPlans });
                                                }}
                                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-600/20"
                                            />
                                            <p className="text-[10px] text-slate-500 mt-1 px-1">Cambios de banners permitidos al mes</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-100">
                            <div className="flex items-start gap-4 p-6 bg-amber-50 rounded-3xl border border-amber-100">
                                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 flex-shrink-0">
                                    <Receipt className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-black text-amber-900">Nota sobre el Límite Global</h4>
                                    <p className="text-sm text-amber-800/70 mt-1">
                                        El límite de actualizaciones de banners se aplica mensualmente. Por defecto, hemos establecido un límite de 3 cambios para todos los planes, pero puedes ajustarlo individualmente arriba.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 pb-20">
                    <div className="bg-white rounded-[32px] border-2 border-slate-100 p-8">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                                <ImageIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 tracking-tight text-lg">Solicitudes de Banners</h3>
                                <p className="text-sm text-slate-500">Revisa las solicitudes de publicidad de los restaurantes.</p>
                            </div>
                        </div>

                        {bannerRequests.length === 0 ? (
                            <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                                <ImageIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-bold">No hay solicitudes de banners.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {bannerRequests.map(req => (
                                    <div key={req.id} className="bg-white border rounded-2xl overflow-hidden shadow-sm flex flex-col group transition-all hover:shadow-md">
                                        <div className="h-32 bg-slate-100 relative group cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500" tabIndex={0} onClick={() => window.open(req.imageUrl, '_blank')}>
                                            <img src={req.imageUrl} alt="Banner request" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <span className="text-white text-xs font-bold uppercase tracking-widest bg-black/50 px-3 py-1.5 rounded-full backdrop-blur-sm">Ampliar Imagen</span>
                                            </div>
                                        </div>
                                        <div className="p-5 flex-1 flex flex-col">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-black text-slate-800 text-lg leading-tight">{req.restaurantName}</h4>
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${req.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                                    req.status === 'rejected' ? 'bg-red-100 text-red-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {req.status === 'approved' ? 'Aprobado' : req.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-500 font-medium mb-1">Plan: <span className="text-indigo-600 font-bold">{req.planName}</span></p>
                                            <p className="text-sm text-slate-500 font-medium mb-4">Precio: <span className="font-bold">${req.price}</span></p>

                                            <div className="mt-auto space-y-2">
                                                <span className="text-xs text-slate-400 font-medium opacity-80 mb-3 block text-center">
                                                    {req.createdAt?.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                                                </span>
                                                {req.status === 'pending' && (
                                                    <div className="grid grid-cols-2 gap-2 mt-2 pt-4 border-t border-slate-100">
                                                        <button
                                                            onClick={() => handleUpdateBannerStatus(req.id, 'rejected')}
                                                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                                                        >
                                                            <XCircle className="w-4 h-4" /> Rechazar
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateBannerStatus(req.id, 'approved')}
                                                            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                                                        >
                                                            <CheckCircle className="w-4 h-4" /> Aprobar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )
            }
        </div >
    );
}
