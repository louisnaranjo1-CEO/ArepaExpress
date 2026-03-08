import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Save, Wallet, Receipt, CreditCard, DollarSign, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export default function FinancesManager() {
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Default configuration structure
    const [config, setConfig] = useState({
        paymentMethods: {
            pagoMovil: {
                active: true,
                bank: '',
                phone: '',
                idf: ''
            },
            zelle: {
                active: false,
                email: '',
                name: ''
            },
            transfer: {
                active: false,
                bank: '',
                accountNumber: '',
                name: '',
                idf: ''
            },
            usdt: {
                active: false,
                wallet: '',
                network: 'TRC20'
            },
            cash: {
                active: true
            }
        },
        transportRates: {
            moto: {
                basePrice: 1.0,
                pricePerKm: 0.5
            },
            carro: {
                basePrice: 2.0,
                pricePerKm: 1.0
            },
            ejecutivo: {
                basePrice: 5.0,
                pricePerKm: 2.5
            }
        }
    });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const docRef = doc(db, 'system_configs', 'finances');
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    // Merge existing data with default structure to prevent missing fields
                    setConfig(prev => ({
                        paymentMethods: { ...prev.paymentMethods, ...(docSnap.data().paymentMethods || {}) },
                        transportRates: { ...prev.transportRates, ...(docSnap.data().transportRates || {}) }
                    }));
                }
            } catch (error) {
                console.error("Error fetching finance config:", error);
                toast.error("Error al cargar la configuración.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchConfig();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await setDoc(doc(db, 'system_configs', 'finances'), config);
            toast.success("Configuración guardada correctamente");
        } catch (error) {
            console.error("Error saving finance config:", error);
            toast.error("Error al guardar la configuración");
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                        <Wallet className="w-8 h-8 text-indigo-600" />
                        Finanzas y Tarifas
                    </h1>
                    <p className="text-slate-500 mt-1">Configura métodos de pago y tarifas de transporte.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </header>

            <div className="grid md:grid-cols-2 gap-6">

                {/* Tarifas de Transporte */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                            <Activity className="w-5 h-5 text-orange-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Tarifas de Transporte</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                        {/* Moto */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="font-bold text-slate-700 mb-3 flex justify-between">
                                <span>Mototaxi</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio Base ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.moto.basePrice}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, moto: { ...prev.transportRates.moto, basePrice: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio por KM ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.moto.pricePerKm}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, moto: { ...prev.transportRates.moto, pricePerKm: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Taxi */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="font-bold text-slate-700 mb-3 flex justify-between">
                                <span>Taxi Standard</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio Base ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.carro.basePrice}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, carro: { ...prev.transportRates.carro, basePrice: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio por KM ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.carro.pricePerKm}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, carro: { ...prev.transportRates.carro, pricePerKm: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Ejecutivo */}
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <h3 className="font-bold text-slate-700 mb-3 flex justify-between">
                                <span>Taxi Ejecutivo</span>
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio Base ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.ejecutivo.basePrice}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, ejecutivo: { ...prev.transportRates.ejecutivo, basePrice: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Precio por KM ($)</label>
                                    <input
                                        type="number" step="0.1" min="0"
                                        value={config.transportRates.ejecutivo.pricePerKm}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            transportRates: { ...prev.transportRates, ejecutivo: { ...prev.transportRates.ejecutivo, pricePerKm: parseFloat(e.target.value) || 0 } }
                                        }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-800"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Métodos de Pago */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-full flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                            <Receipt className="w-5 h-5 text-green-600" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Métodos de Pago Globales</h2>
                    </div>

                    <div className="space-y-4 flex-1 overflow-y-auto pr-2">
                        {/* Pago Móvil */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${config.paymentMethods.pagoMovil.active ? 'border-primary/50 bg-primary/5' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <CreditCard className="w-4 h-4" /> Pago Móvil (Bs)
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.paymentMethods.pagoMovil.active}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, active: e.target.checked } }
                                        }))}
                                    />
                                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>

                            {config.paymentMethods.pagoMovil.active && (
                                <div className="space-y-3 mt-4 animate-fade-in">
                                    <input type="text" placeholder="Banco (Ej: Banesco)"
                                        value={config.paymentMethods.pagoMovil.bank}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, bank: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Teléfono"
                                        value={config.paymentMethods.pagoMovil.phone}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, phone: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Cédula/RIF"
                                        value={config.paymentMethods.pagoMovil.idf}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, pagoMovil: { ...prev.paymentMethods.pagoMovil, idf: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* Zelle */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${config.paymentMethods.zelle.active ? 'border-indigo-500/50 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    Zelle ($)
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.paymentMethods.zelle.active}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, active: e.target.checked } }
                                        }))}
                                    />
                                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                                </label>
                            </div>

                            {config.paymentMethods.zelle.active && (
                                <div className="space-y-3 mt-4 animate-fade-in">
                                    <input type="text" placeholder="Correo de Zelle"
                                        value={config.paymentMethods.zelle.email}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, email: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Nombre del titular"
                                        value={config.paymentMethods.zelle.name}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, zelle: { ...prev.paymentMethods.zelle, name: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* Efectivo */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${config.paymentMethods.cash.active ? 'border-emerald-500/50 bg-emerald-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-emerald-600" /> Efectivo
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.paymentMethods.cash.active}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            paymentMethods: { ...prev.paymentMethods, cash: { ...prev.paymentMethods.cash, active: e.target.checked } }
                                        }))}
                                    />
                                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                                </label>
                            </div>
                        </div>

                        {/* Transferencia */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${config.paymentMethods.transfer.active ? 'border-orange-500/50 bg-orange-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    Transferencia (Bs)
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.paymentMethods.transfer.active}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, active: e.target.checked } }
                                        }))}
                                    />
                                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                                </label>
                            </div>

                            {config.paymentMethods.transfer.active && (
                                <div className="space-y-3 mt-4 animate-fade-in">
                                    <input type="text" placeholder="Banco (Ej: Banco de Venezuela)"
                                        value={config.paymentMethods.transfer.bank}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, bank: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Número de Cuenta (20 dígitos)"
                                        value={config.paymentMethods.transfer.accountNumber}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, accountNumber: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Nombre completo"
                                        value={config.paymentMethods.transfer.name}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, name: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Cédula/RIF"
                                        value={config.paymentMethods.transfer.idf}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, transfer: { ...prev.paymentMethods.transfer, idf: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                        {/* USDT */}
                        <div className={`p-4 rounded-2xl border-2 transition-all ${config.paymentMethods.usdt.active ? 'border-yellow-500/50 bg-yellow-50' : 'border-slate-100 bg-slate-50'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                                    USDT (Binance / Wallet)
                                </h3>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={config.paymentMethods.usdt.active}
                                        onChange={e => setConfig(prev => ({
                                            ...prev,
                                            paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, active: e.target.checked } }
                                        }))}
                                    />
                                    <div className="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-500"></div>
                                </label>
                            </div>

                            {config.paymentMethods.usdt.active && (
                                <div className="space-y-3 mt-4 animate-fade-in">
                                    <input type="text" placeholder="Dirección de la Wallet (USDT)"
                                        value={config.paymentMethods.usdt.wallet}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, wallet: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                    <input type="text" placeholder="Red (Ej: TRC20, BEP20)"
                                        value={config.paymentMethods.usdt.network}
                                        onChange={e => setConfig(prev => ({ ...prev, paymentMethods: { ...prev.paymentMethods, usdt: { ...prev.paymentMethods.usdt, network: e.target.value } } }))}
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm" />
                                </div>
                            )}
                        </div>

                    </div>
                </div>

            </div>
        </div>
    );
}
