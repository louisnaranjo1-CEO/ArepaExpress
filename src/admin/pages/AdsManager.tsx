import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { Megaphone, Briefcase, Plus, Trash2, Image as ImageIcon, Save, Loader2, Target, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface JobPosition {
    id: string;
    title: string;
    description: string;
}

const BANNER_PLANS = [
    { id: 'start', name: 'Banner Start', price: 15, duration: '1 Mes', features: ['Aparición en Home general', 'Diseño estándar'] },
    { id: 'pro', name: 'Banner Pro', price: 30, duration: '1 Mes', features: ['Aparición principal (Top)', 'Diseño destacado', 'Link directo'] },
];

export default function AdsManager() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Jobs State
    const [jobsActive, setJobsActive] = useState(false);
    const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
    const [newJob, setNewJob] = useState({ title: '', description: '' });
    const [isAddingJob, setIsAddingJob] = useState(false);

    // Banners State
    const [bannerRequesting, setBannerRequesting] = useState<string | null>(null); // plan id
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [bannerPreview, setBannerPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;
        const fetchSettings = async () => {
            try {
                const docSnap = await getDoc(doc(db, 'restaurants', user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.jobOpportunities) {
                        setJobsActive(data.jobOpportunities.active || false);
                        setJobPositions(data.jobOpportunities.positions || []);
                    }
                }
            } catch (error) {
                console.error("Error fetching ads data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, [user]);

    const saveJobsSettings = async (newActiveState: boolean, newPositions: JobPosition[]) => {
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'restaurants', user.uid), {
                'jobOpportunities.active': newActiveState,
                'jobOpportunities.positions': newPositions
            });
            setJobsActive(newActiveState);
            setJobPositions(newPositions);
        } catch (error) {
            console.error("Error saving job settings:", error);
            alert("Error al guardar la configuración de empleos.");
        } finally {
            setSaving(false);
        }
    };

    const handleToggleJobs = () => {
        saveJobsSettings(!jobsActive, jobPositions);
    };

    const handleAddJob = () => {
        if (!newJob.title.trim() || !newJob.description.trim()) return;
        const updatedPositions = [...jobPositions, { id: Date.now().toString(), ...newJob }];
        saveJobsSettings(jobsActive, updatedPositions);
        setNewJob({ title: '', description: '' });
        setIsAddingJob(false);
    };

    const handleRemoveJob = (id: string) => {
        const updatedPositions = jobPositions.filter(j => j.id !== id);
        saveJobsSettings(jobsActive, updatedPositions);
    };

    const handleBannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setBannerPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRequestBanner = async (plan: any) => {
        if (!user || !bannerFile) {
            alert("Por favor selecciona una imagen para el banner.");
            return;
        }

        setSaving(true);
        try {
            // Get Restaurant Name
            const restSnap = await getDoc(doc(db, 'restaurants', user.uid));
            const restName = restSnap.exists() ? restSnap.data().name : 'Restaurante Desconocido';

            // Upload Image
            const fileRef = ref(storage, `banner_requests/${user.uid}_${Date.now()}`);
            await uploadBytes(fileRef, bannerFile);
            const imageUrl = await getDownloadURL(fileRef);

            // Save Request
            await addDoc(collection(db, 'banner_requests'), {
                restaurantId: user.uid,
                restaurantName: restName,
                planId: plan.id,
                planName: plan.name,
                price: plan.price,
                imageUrl,
                status: 'pending',
                createdAt: new Date()
            });

            alert(`¡Solicitud enviada! Nuestro equipo revisará su pago de $${plan.price} y activará su banner pronto.`);
            setBannerRequesting(null);
            setBannerFile(null);
            setBannerPreview(null);

        } catch (error) {
            console.error("Error requesting banner:", error);
            alert("Error al procesar la solicitud del banner.");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10 mb-20">
            <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                    <Megaphone className="w-8 h-8 text-slate-900" />
                    Anuncios y Promociones
                </h1>
                <p className="text-slate-500 font-medium mt-2">Gestiona oportunidades de empleo y solicita banners publicitarios para destacar tu negocio.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Job Opportunities Section */}
                <section className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-8 space-y-8 flex flex-col">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                                <Briefcase className="w-6 h-6 text-slate-900" />
                                Empleos (Gratis)
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">Atrae talento publicando vacantes en tu perfil público.</p>
                        </div>
                        <div
                            className="flex items-center justify-between p-2 bg-slate-50 rounded-full cursor-pointer group"
                            onClick={handleToggleJobs}
                        >
                            <div className={`w-12 h-6 rounded-full relative transition-colors ${jobsActive ? 'bg-primary' : 'bg-slate-200'}`}>
                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${jobsActive ? 'left-7' : 'left-1'}`}></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-slate-700">Vacantes Actuales</h3>
                            {jobsActive && (
                                <button
                                    onClick={() => setIsAddingJob(!isAddingJob)}
                                    className="text-xs font-bold text-slate-900 flex items-center gap-1 hover:underline underline-offset-4"
                                >
                                    <Plus className="w-4 h-4" /> Añadir Vacante
                                </button>
                            )}
                        </div>

                        {!jobsActive ? (
                            <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-8 text-center">
                                <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                                <p className="text-slate-500 font-medium">Activa esta sección para empezar a publicar ofertas de empleo.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <AnimatePresence>
                                    {isAddingJob && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                            className="bg-primary/5 border border-primary/20 rounded-3xl p-5 space-y-4 overflow-hidden"
                                        >
                                            <input
                                                type="text"
                                                placeholder="Título del Cargo (Ej. Cocinero, Mesero)"
                                                value={newJob.title}
                                                onChange={e => setNewJob({ ...newJob, title: e.target.value })}
                                                className="w-full bg-white border border-primary/20 p-3 rounded-xl text-sm font-bold outline-none focus:border-primary"
                                            />
                                            <textarea
                                                placeholder="Descripción y Requisitos breves..."
                                                value={newJob.description}
                                                onChange={e => setNewJob({ ...newJob, description: e.target.value })}
                                                className="w-full bg-white border border-primary/20 p-3 rounded-xl text-sm outline-none focus:border-primary resize-none h-24"
                                            />
                                            <div className="flex justify-end gap-2">
                                                <button onClick={() => setIsAddingJob(false)} className="px-4 py-2 text-xs font-bold text-slate-500">Cancelar</button>
                                                <button onClick={handleAddJob} disabled={saving} className="px-4 py-2 bg-primary text-slate-900 text-xs font-black rounded-xl">Guardar</button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {jobPositions.length === 0 && !isAddingJob && (
                                    <p className="text-center text-sm text-slate-400 italic">No hay vacantes publicadas.</p>
                                )}

                                {jobPositions.map(pos => (
                                    <div key={pos.id} className="bg-white border border-slate-100 shadow-sm rounded-2xl p-4 flex justify-between items-start group">
                                        <div>
                                            <h4 className="font-black text-slate-800 text-sm">{pos.title}</h4>
                                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{pos.description}</p>
                                        </div>
                                        <button onClick={() => handleRemoveJob(pos.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>

                {/* Banner Promotion Section */}
                <section className="bg-white rounded-[40px] shadow-sm border border-slate-100 p-8 space-y-8 flex flex-col">
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                            <Target className="w-6 h-6 text-slate-900" />
                            Banners Publicitarios
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">Destaca tu negocio en la pantalla de inicio principal de la app.</p>
                    </div>

                    <div className="flex-1 space-y-6">
                        {BANNER_PLANS.map(plan => (
                            <div key={plan.id} className="border-2 border-slate-100 rounded-3xl p-6 relative overflow-hidden group hover:border-primary/30 transition-colors">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800">{plan.name}</h3>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{plan.duration}</p>
                                    </div>
                                    <div className="bg-primary/10 text-slate-900 px-3 py-1.5 rounded-xl font-black">
                                        ${plan.price}
                                    </div>
                                </div>
                                <ul className="space-y-2 mb-6">
                                    {plan.features.map((feat, i) => (
                                        <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                            {feat}
                                        </li>
                                    ))}
                                </ul>

                                {bannerRequesting === plan.id ? (
                                    <div className="space-y-4 border-t border-dashed border-slate-200 pt-4 animate-in slide-in-from-top-4">
                                        <div
                                            className="w-full h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden"
                                            onClick={() => document.getElementById(`banner-upload-${plan.id}`)?.click()}
                                        >
                                            {bannerPreview ? (
                                                <img src={bannerPreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <>
                                                    <ImageIcon className="w-8 h-8 text-slate-300 mb-2" />
                                                    <span className="text-xs font-bold text-slate-400">Clic para subir diseño</span>
                                                    <span className="text-[10px] text-slate-400 mt-1">Prop. recomendada: 16:9</span>
                                                </>
                                            )}
                                            <input type="file" id={`banner-upload-${plan.id}`} hidden accept="image/*" onChange={handleBannerFileChange} />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => { setBannerRequesting(null); setBannerPreview(null); setBannerFile(null); }}
                                                className="flex-1 py-2 text-xs font-bold text-slate-500 bg-slate-100 rounded-xl"
                                                disabled={saving}
                                            >Cancelar</button>
                                            <button
                                                onClick={() => handleRequestBanner(plan)}
                                                className="flex-1 py-2 text-xs font-black text-slate-900 bg-primary rounded-xl flex items-center justify-center gap-2 shadow-md"
                                                disabled={saving}
                                            >
                                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solicitar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setBannerRequesting(plan.id)}
                                        className="w-full py-3 bg-slate-50 group-hover:bg-primary group-hover:text-slate-900 text-slate-700 font-black rounded-2xl transition-all"
                                    >
                                        Adquirir Plan
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
