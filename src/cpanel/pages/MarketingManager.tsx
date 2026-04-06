import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Megaphone, Settings, CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MarketingManager() {
    const [activeTab, setActiveTab] = useState<'campaigns' | 'settings'>('campaigns');
    const [campaigns, setCampaigns] = useState<any[]>([]);
    
    // Settings state
    const [priceCity, setPriceCity] = useState(5);
    const [priceState, setPriceState] = useState(10);
    const [priceNational, setPriceNational] = useState(20);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    useEffect(() => {
        // Load settings
        const loadSettings = async () => {
            try {
                const settingsDoc = await getDoc(doc(db, 'system_settings', 'marketing'));
                if (settingsDoc.exists()) {
                    const data = settingsDoc.data();
                    if (data.pushPriceCity !== undefined) setPriceCity(data.pushPriceCity);
                    if (data.pushPriceState !== undefined) setPriceState(data.pushPriceState);
                    if (data.pushPriceNational !== undefined) setPriceNational(data.pushPriceNational);
                }
            } catch (err) {
                console.error("Error loading settings", err);
            }
        };
        loadSettings();

        // Listen to campaigns
        const q = query(collection(db, 'push_campaigns'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const data: any[] = [];
            snap.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
            // Order by nearest to furthest or just status
            data.sort((a, b) => {
                if (a.status === 'verifying_payment' && b.status !== 'verifying_payment') return -1;
                if (a.status !== 'verifying_payment' && b.status === 'verifying_payment') return 1;
                return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
            });
            setCampaigns(data);
        });

        return () => unsubscribe();
    }, []);

    const saveSettings = async () => {
        setIsSavingSettings(true);
        try {
            await setDoc(doc(db, 'system_settings', 'marketing'), {
                pushPriceCity: priceCity,
                pushPriceState: priceState,
                pushPriceNational: priceNational,
                updatedAt: new Date()
            }, { merge: true });
            toast.success("Tarifas de Marketing actualizadas correctamente");
        } catch (error) {
            toast.error("Error al guardar tarifas");
        }
        setIsSavingSettings(false);
    };

    const handleApproveCampaign = async (campaignId: string) => {
        if (!confirm("¿Estás seguro de que deseas APROBAR y enviar esta campaña masiva a los usuarios? Esto generará notificaciones y sonidos que llegarán a los dispositivos elegibles al instante conforme su diseño.")) return;
        
        try {
            // First we approve the payment and set status to active.
            // When we do this, the ClientApp listeners will catch it and reproduce the push notification.
            await updateDoc(doc(db, 'push_campaigns', campaignId), {
                status: 'active',
                activatedAt: new Date()
            });
            toast.success("¡Campaña validada y Activada!");
        } catch(error) {
            toast.error("Error al activar");
        }
    };

    const handleRejectCampaign = async (campaignId: string) => {
        if (!confirm("¿Rechazar esta campaña por pago inválido?")) return;
        try {
            await updateDoc(doc(db, 'push_campaigns', campaignId), {
                status: 'rejected_payment'
            });
            toast.success("Campaña rechazada");
        } catch(error) {
            toast.error("Error al rechazar");
        }
    };

    return (
        <div className="p-6">
            <h1 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-3">
                <Megaphone className="w-8 h-8 text-primary" />
                Marketing & Push Notifications
            </h1>

            <div className="flex gap-2 mb-8 border-b border-slate-200 pb-4">
                <button 
                    className={`px-6 py-3 rounded-2xl font-black transition-all duration-300 ${activeTab === 'campaigns' ? 'bg-slate-900 text-primary shadow-2xl shadow-slate-900/20 scale-105' : 'text-slate-500 hover:bg-slate-100'}`}
                    onClick={() => setActiveTab('campaigns')}
                >
                    Auditar Campañas
                </button>
                <button 
                    className={`px-6 py-3 rounded-2xl font-black transition-all duration-300 ${activeTab === 'settings' ? 'bg-slate-900 text-primary shadow-2xl shadow-slate-900/20 scale-105' : 'text-slate-500 hover:bg-slate-100'}`}
                    onClick={() => setActiveTab('settings')}
                >
                    Tarifas & Configuración
                </button>
            </div>

            {activeTab === 'settings' && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-2xl">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                        <Settings className="w-5 h-5 text-primary" />
                        Ajuste de Tarifas: Campañas Push
                    </h2>
                    
                    <div className="space-y-6">
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Ciudad ($)</label>
                           <input type="number" value={priceCity} onChange={e => setPriceCity(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Coste al enviar notificación solo a usuarios de una ciudad específica.</p>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Estado/Provincia ($)</label>
                           <input type="number" value={priceState} onChange={e => setPriceState(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Coste al enviar a todo un estado.</p>
                        </div>
                        <div>
                           <label className="block text-sm font-bold text-slate-700 mb-1">Precio Alcance Nacional ($)</label>
                           <input type="number" value={priceNational} onChange={e => setPriceNational(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3" />
                           <p className="text-xs text-slate-500 mt-1">Costo Master para notificaciones Push en todo el país sin restricciones geográficas de la aplicación.</p>
                        </div>

                        <button 
                            className="bg-primary text-slate-900 font-bold py-3 px-8 rounded-xl w-full"
                            onClick={saveSettings}
                            disabled={isSavingSettings}
                        >
                            {isSavingSettings ? 'Guardando...' : 'Guardar Configuraciones Globales'}
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'campaigns' && (
                <div className="space-y-4">
                    {campaigns.length === 0 && <p className="text-slate-500">No hay campañas publicadas ni en revisión.</p>}
                    
                    {campaigns.map(camp => (
                        <div key={camp.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-6">
                            {/* Creatividad */}
                            <div className="md:w-1/3 bg-slate-50 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                                {camp.imageUrl ? (
                                    <img src={camp.imageUrl} alt="Push Creativo" className="w-full h-32 object-cover rounded-lg mb-3" />
                                ) : (
                                    <div className="w-full h-32 bg-slate-200 rounded-lg mb-3 flex items-center justify-center"><ImageIcon className="w-8 h-8 text-slate-400" /></div>
                                )}
                                <h3 className="font-bold text-slate-900">{camp.title}</h3>
                                <p className="text-xs text-slate-500">{camp.subtitle}</p>
                            </div>

                            {/* Info */}
                            <div className="md:w-1/3 flex flex-col justify-center gap-2">
                                <p className="font-bold text-slate-800">Restaurante: <span className="font-normal">{camp.restaurantName}</span></p>
                                 <p className="font-bold text-slate-800">
                                    Alcance: <span className="font-normal capitalize">
                                        {camp.location} 
                                        {camp.location === 'city' && ` (${camp.cities?.length || 0} ciudades)`}
                                        {camp.location === 'state' && ` (${camp.states?.length || 0} estados)`}
                                    </span>
                                </p>
                                
                                {(camp.cities?.length > 0 || camp.states?.length > 0) && (
                                    <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto pr-2 custom-scrollbar">
                                        {(camp.cities || []).map((c: string, idx: number) => (
                                            <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md border border-slate-200">
                                                {c}
                                            </span>
                                        ))}
                                        {(camp.states || []).map((s: string, idx: number) => (
                                            <span key={idx} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md border border-primary/20">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="font-bold text-slate-800">Inversión: <span className="font-normal text-green-600">${camp.price}</span></p>
                                
                                {camp.scheduledAt && (
                                    <p className="font-bold text-slate-800 flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded-md self-start text-xs mt-1">
                                        Programado: <span className="font-normal">{camp.scheduledAt.toDate().toLocaleString('es-VE')}</span>
                                    </p>
                                )}

                                <p className="font-bold text-slate-800">Clics: <span className="font-normal px-2 bg-slate-100 rounded-md">{camp.clicks || 0}</span></p>
                                
                                {camp.status === 'verifying_payment' && (
                                    <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-bold self-start mt-2">Revisión de Pago Requerida</span>
                                )}
                                {camp.status === 'active' && (
                                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold self-start mt-2">Campaña Activa</span>
                                )}
                                {camp.status === 'rejected_payment' && (
                                    <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold self-start mt-2">Pago Rechazado</span>
                                )}
                            </div>

                            {/* Acciones de Pago */}
                            <div className="md:w-1/3 flex flex-col justify-center border-l pl-6 border-slate-100">
                                <h4 className="font-bold text-slate-700 text-sm mb-3">Auditoría de Pago</h4>
                                {camp.paymentRef ? (
                                    <div className="space-y-3">
                                        <div className="bg-slate-900 text-primary text-center py-2 px-4 rounded-xl font-mono text-sm shadow-md">
                                            REF: {camp.paymentRef}
                                        </div>
                                        
                                        {camp.paymentImage ? (
                                            <a href={camp.paymentImage} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl transition-colors">
                                                <ImageIcon className="w-4 h-4"/> Ver Comprobante
                                            </a>
                                        ) : (
                                            <p className="text-xs text-slate-400 text-center">Sin imagen adjunta</p>
                                        )}
                                        
                                        {camp.status === 'verifying_payment' && (
                                            <div className="flex gap-2 pt-2">
                                                <button onClick={() => handleApproveCampaign(camp.id)} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-green-500/20 active:scale-95 transition-all">
                                                    <CheckCircle className="w-4 h-4" /> Aprobar
                                                </button>
                                                <button onClick={() => handleRejectCampaign(camp.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/20 active:scale-95 transition-all">
                                                    <XCircle className="w-4 h-4" /> Rechazar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-slate-400 text-sm italic">Sin detalles de pago provistos.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
