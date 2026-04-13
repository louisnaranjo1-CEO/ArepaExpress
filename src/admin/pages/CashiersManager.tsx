// v1.0.2 - Fixed catch syntax error
import React, { useState, useEffect } from 'react';
import { Shield, Plus, X, Search, User, Key, Building2, Eye, Edit2, Trash2, CheckCircle, Loader2, Upload, ImageIcon } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';

interface Cashier {
    id: string;
    name: string;
    email: string;
    phone: string;
    isActive: boolean;
    passcode: string;
    permissions: string[];
    createdAt: number;
    photo?: string;
}

export default function CashiersManager() {
    const { user, userData } = useAuth();
    const rid = userData?.managedRestaurantId || user?.uid;
    const [cashiers, setCashiers] = useState<Cashier[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        passcode: '',
        isActive: true
    });

    useEffect(() => {
        if (!user || !rid) return;
        const q = query(collection(db, 'restaurants', rid, 'cashiers'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Cashier));
            setCashiers(data);
        });
        return unsubscribe;
    }, [user, rid]);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setIsSubmitting(true);

        try {
            // Check if email is already in use
            const emailKey = formData.email.toLowerCase();
            const indexDoc = await getDoc(doc(db, 'cashier_index', emailKey));
            if (indexDoc.exists()) {
                alert("Este correo ya está registrado en el sistema.");
                setIsSubmitting(false);
                return;
            }
            let photoUrl = '';
            if (photoFile) {
                const storageRef = ref(getStorage(), `restaurants/${rid}/cashiers/${Date.now()}_photo`);
                const snapshot = await uploadBytes(storageRef, photoFile);
                photoUrl = await getDownloadURL(snapshot.ref);
            }

            const cashierData = {
                ...formData,
                photo: photoUrl || '',
                createdAt: Date.now(),
                permissions: ['pos', 'orders', 'tables'] // Default permissions
            };

            await setDoc(doc(db, 'restaurants', rid, 'cashiers', formData.email.toLowerCase()), cashierData);
            
            // Add to cashier index for global login
            await setDoc(doc(db, 'cashier_index', formData.email.toLowerCase()), {
                restaurantId: rid,
                cashierId: formData.email.toLowerCase(),
                email: formData.email.toLowerCase()
            });

            setIsAddModalOpen(false);
            setFormData({ name: '', email: '', phone: '', passcode: '', isActive: true });
            setPhotoFile(null);
            setPhotoPreview(null);
            alert("Cajera creada exitosamente");
        } catch (error) {
            console.error("Error adding cashier:", error);
            alert("Error al crear la cajera");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (email: string) => {
        if (!rid || !window.confirm('¿Estás seguro de eliminar este cajero?')) return;
        try {
            await deleteDoc(doc(db, 'restaurants', rid, 'cashiers', email));
            await deleteDoc(doc(db, 'cashier_index', email));
        } catch (error) {
            console.error("Error deleting cashier:", error);
            alert("Error al eliminar");
        }
    };

    const filteredCashiers = cashiers.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
                        <Shield className="w-8 h-8 text-slate-900" />
                        Cajeras / Cobranza
                    </h1>
                    <p className="text-slate-500 font-medium">Gestiona los accesos de tus cajeras para el sistema de cobro.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-primary text-slate-900 px-6 py-3 rounded-2xl font-black hover:bg-primary/90 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                    <Plus className="w-5 h-5" /> Nueva Cajera
                </button>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
                <Search className="w-5 h-5 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar cajera por nombre o email..." 
                    className="w-full bg-transparent outline-none font-medium text-slate-700 placeholder:text-slate-400"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCashiers.map(cashier => (
                    <div key={cashier.id} className="bg-white rounded-[32px] p-6 border border-slate-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 flex gap-2">
                            <button onClick={() => handleDelete(cashier)} className="w-8 h-8 bg-red-50 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        
                        <div className="flex flex-col items-center text-center mt-4">
                            <div className="relative mb-4">
                                <div className="w-24 h-24 rounded-full border-4 border-slate-50 overflow-hidden bg-slate-100 shadow-md">
                                    {cashier.photo ? (
                                        <img src={cashier.photo} alt={cashier.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                                            <User className="w-10 h-10 mb-1" />
                                        </div>
                                    )}
                                </div>
                                <div className={`absolute bottom-1 right-1 w-5 h-5 rounded-full border-2 border-white ${cashier.isActive ? 'bg-green-500' : 'bg-slate-300'}`}></div>
                            </div>
                            
                            <h3 className="text-xl font-black text-slate-900">{cashier.name}</h3>
                            <p className="text-slate-500 font-bold text-sm bg-slate-50 px-3 py-1 rounded-full mt-2 inline-flex items-center gap-1">
                                <Shield className="w-3 h-3 text-slate-900" /> Cajera
                            </p>

                            <div className="w-full mt-6 space-y-3 bg-slate-50 p-4 rounded-2xl text-left">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm">@</div>
                                    <div className="flex-1 truncate">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email</p>
                                        <p className="text-sm font-bold text-slate-700 truncate">{cashier.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm"><Key className="w-4 h-4" /></div>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">PIN de Acceso</p>
                                        <p className="text-sm font-black text-slate-900 tracking-widest">{cashier.passcode}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                
                {filteredCashiers.length === 0 && (
                    <div className="col-span-full py-12 text-center text-slate-400 font-medium">
                        No hay cajeras registradas.
                    </div>
                )}
            </div>

            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] w-full max-w-lg shadow-2xl p-6 md:p-8 animate-in zoom-in-95 duration-200 text-left">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-slate-900">Nueva Cajera</h2>
                            <button onClick={() => setIsAddModalOpen(false)} className="w-10 h-10 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="flex justify-center mb-6">
                                <div className="relative group cursor-pointer">
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        onChange={handlePhotoChange} 
                                        className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                                    />
                                    <div className="w-24 h-24 rounded-[28px] border-2 border-dashed border-slate-300 flex flex-col items-center justify-center bg-slate-50 overflow-hidden relative group-hover:border-primary transition-colors">
                                        {photoPreview ? (
                                            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <>
                                                <Upload className="w-6 h-6 text-slate-400 mb-1 group-hover:text-slate-900 transition-colors" />
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Foto</span>
                                            </>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 items-center justify-center hidden group-hover:flex">
                                            <ImageIcon className="w-6 h-6 text-white" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Nombre Completo</label>
                                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-primary font-bold text-slate-700" placeholder="Ej: Ana Rojas" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email (Usuario)</label>
                                <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-primary font-bold text-slate-700" placeholder="ana@deliexpress.app" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Teléfono</label>
                                    <input type="tel" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-primary font-bold text-slate-700" placeholder="0414-1234567" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">PIN / Clave</label>
                                    <input type="text" required value={formData.passcode} onChange={e => setFormData({...formData, passcode: e.target.value})} className="w-full bg-slate-50 border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-primary font-black tracking-widest text-slate-700" placeholder="1234" maxLength={8} />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 mt-6 hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar Cajera"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
