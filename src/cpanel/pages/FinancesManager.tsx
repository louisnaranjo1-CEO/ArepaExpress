import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Save, Wallet, Receipt, CreditCard, DollarSign, Activity, Plus, Trash2 } from 'lucide-react';
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
            moto: [
                { from: 0, to: 2, clientPrice: 1.5, driverPrice: 1.0 }
            ],
            carro: [
                { from: 0, to: 2, clientPrice: 3.0, driverPrice: 2.0 }
            ],
            ejecutivo: [
                { from: 0, to: 2, clientPrice: 7.0, driverPrice: 5.0 }
            ]
        }
    });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const docRef = doc(db, 'system_configs', 'finances');
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setConfig(prev => ({
                        paymentMethods: { ...prev.paymentMethods, ...(data.paymentMethods || {}) },
                        transportRates: {
                            moto: Array.isArray(data.transportRates?.moto) ? data.transportRates.moto : prev.transportRates.moto,
                            carro: Array.isArray(data.transportRates?.carro) ? data.transportRates.carro : prev.transportRates.carro,
                            ejecutivo: Array.isArray(data.transportRates?.ejecutivo) ? data.transportRates.ejecutivo : prev.transportRates.ejecutivo
                        }
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

                    <div className="space-y-6 flex-1 pr-2 overflow-y-auto">
                        {(['moto', 'carro', 'ejecutivo'] as const).map(type => (
                            <div key={type} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-slate-700 capitalize">
                                        {type === 'carro' ? 'Taxi Standard' : type === 'ejecutivo' ? 'Taxi Ejecutivo' : 'Mototaxi'}
                                    </h3>
                                    <button
                                        onClick={() => {
                                            const newRanges = [...config.transportRates[type]];
                                            const lastRange = newRanges[newRanges.length - 1];
                                            newRanges.push({
                                                from: lastRange ? lastRange.to + 0.1 : 0,
                                                to: lastRange ? lastRange.to + 2 : 2,
                                                clientPrice: lastRange ? (lastRange.clientPrice || lastRange.price) + 1 : 2,
                                                driverPrice: lastRange ? (lastRange.driverPrice || lastRange.price) + 1 : 1
                                            });
                                            setConfig(prev => ({
                                                ...prev,
                                                transportRates: { ...prev.transportRates, [type]: newRanges }
                                            }));
                                        }}
                                        className="text-indigo-600 hover:bg-white p-1.5 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Rango
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    <div className="grid grid-cols-12 gap-1 text-[8px] font-black text-slate-400 uppercase px-1">
                                        <div className="col-span-2 text-center">Desde</div>
                                        <div className="col-span-2 text-center">Hasta</div>
                                        <div className="col-span-3 text-center">C. Cliente</div>
                                        <div className="col-span-4 text-center">C. Taxi</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                    {config.transportRates[type].map((range: any, idx: number) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 shadow-sm items-center group/range px-1 py-1 rounded-xl bg-white border border-slate-50">
                                            <div className="col-span-2">
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={range.from}
                                                    onChange={e => {
                                                        const newRanges = [...config.transportRates[type]];
                                                        newRanges[idx].from = parseFloat(e.target.value) || 0;
                                                        setConfig(prev => ({ ...prev, transportRates: { ...prev.transportRates, [type]: newRanges } }));
                                                    }}
                                                    className="w-full bg-slate-50 border-none rounded-lg px-1 py-1 text-[9px] font-bold text-center"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <input
                                                    type="number" step="0.1" min="0"
                                                    value={range.to}
                                                    onChange={e => {
                                                        const newRanges = [...config.transportRates[type]];
                                                        newRanges[idx].to = parseFloat(e.target.value) || 0;
                                                        setConfig(prev => ({ ...prev, transportRates: { ...prev.transportRates, [type]: newRanges } }));
                                                    }}
                                                    className="w-full bg-slate-50 border-none rounded-lg px-1 py-1 text-[9px] font-bold text-center"
                                                />
                                            </div>
                                            <div className="col-span-3">
                                                <input
                                                    type="number" step="0.5" min="0"
                                                    value={range.clientPrice || range.price}
                                                    onChange={e => {
                                                        const newRanges = [...config.transportRates[type]];
                                                        newRanges[idx].clientPrice = parseFloat(e.target.value) || 0;
                                                        setConfig(prev => ({ ...prev, transportRates: { ...prev.transportRates, [type]: newRanges } }));
                                                    }}
                                                    placeholder="$ Cliente"
                                                    className="w-full bg-emerald-50 border-none rounded-lg px-1 py-1 text-[9px] font-black text-emerald-600 text-center"
                                                />
                                            </div>
                                            <div className="col-span-4">
                                                <input
                                                    type="number" step="0.5" min="0"
                                                    value={range.driverPrice || range.price}
                                                    onChange={e => {
                                                        const newRanges = [...config.transportRates[type]];
                                                        newRanges[idx].driverPrice = parseFloat(e.target.value) || 0;
                                                        setConfig(prev => ({ ...prev, transportRates: { ...prev.transportRates, [type]: newRanges } }));
                                                    }}
                                                    placeholder="$ Taxi"
                                                    className="w-full bg-indigo-50 border-none rounded-lg px-1 py-1 text-[9px] font-black text-indigo-600 text-center"
                                                />
                                            </div>
                                            <div className="col-span-1 flex justify-end pr-1">
                                                <button
                                                    onClick={() => {
                                                        if (config.transportRates[type].length <= 1) return;
                                                        const newRanges = config.transportRates[type].filter((_: any, i: number) => i !== idx);
                                                        setConfig(prev => ({ ...prev, transportRates: { ...prev.transportRates, [type]: newRanges } }));
                                                    }}
                                                    className="text-slate-200 hover:text-red-500 opacity-0 group-hover/range:opacity-100 transition-colors"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
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
