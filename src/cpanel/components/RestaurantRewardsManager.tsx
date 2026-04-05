import React, { useState, useEffect } from 'react';
import { Gift, Plus, Trash2, Edit2, Save, X, Image as ImageIcon, Upload, Tag } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { toast } from 'react-hot-toast';

interface RestaurantReward {
    id: string;
    title: string;
    description: string;
    pointsCost: number;
    imageUrl?: string;
    isActive: boolean;
    createdAt?: any;
}

interface RestaurantRewardsManagerProps {
    restaurantId: string;
}

export default function RestaurantRewardsManager({ restaurantId }: RestaurantRewardsManagerProps) {
    const [rewards, setRewards] = useState<RestaurantReward[]>([]);
    const [pointsProducts, setPointsProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    
    const [newReward, setNewReward] = useState<Partial<RestaurantReward>>({
        title: '',
        description: '',
        pointsCost: 100,
        isActive: true
    });

    useEffect(() => {
        if (restaurantId) {
            fetchRewards();
        }
    }, [restaurantId]);

    const fetchRewards = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, `restaurants/${restaurantId}/rewards`));
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RestaurantReward));
            
            // Fetch products configured with points price
            const prodSnap = await getDocs(query(collection(db, `restaurants/${restaurantId}/products`), where('pointsPrice', '>', 0)));
            const pData = prodSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            setRewards(data);
            setPointsProducts(pData);
        } catch (error) {
            console.error("Error fetching restaurant rewards:", error);
            toast.error("Error al cargar recompensas");
        } finally {
            setLoading(false);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleAddReward = async () => {
        if (!newReward.title || !newReward.pointsCost) {
            toast.error("Completa Título y Costo en Puntos");
            return;
        }

        try {
            setIsUploading(true);
            let imageUrl = '';

            if (imageFile) {
                const storageRef = ref(storage, `restaurants/${restaurantId}/rewards/${Date.now()}_${imageFile.name}`);
                const snapshot = await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(snapshot.ref);
            }

            await addDoc(collection(db, `restaurants/${restaurantId}/rewards`), {
                ...newReward,
                imageUrl,
                createdAt: serverTimestamp()
            });

            toast.success("Recompensa creada exitosamente");
            setShowAddModal(false);
            resetForm();
            fetchRewards();
        } catch (error) {
            console.error("Error creating reward:", error);
            toast.error("Error al crear la recompensa");
        } finally {
            setIsUploading(false);
        }
    };

    const resetForm = () => {
        setNewReward({
            title: '',
            description: '',
            pointsCost: 100,
            isActive: true
        });
        setImageFile(null);
        setImagePreview('');
    };

    const handleDeleteReward = async (id: string, currentImageUrl?: string) => {
        if (!window.confirm("¿Seguro que quieres eliminar esta recompensa?")) return;
        try {
            await deleteDoc(doc(db, `restaurants/${restaurantId}/rewards`, id));
            // Optional: delete image from storage if needed
            toast.success("Recompensa eliminada");
            fetchRewards();
        } catch (error) {
            console.error("Error deleting reward:", error);
            toast.error("Error al eliminar");
        }
    };

    const toggleStatus = async (reward: RestaurantReward) => {
        try {
            await updateDoc(doc(db, `restaurants/${restaurantId}/rewards`, reward.id), {
                isActive: !reward.isActive
            });
            fetchRewards();
        } catch (error) {
            console.error("Error updating reward status:", error);
            toast.error("Error al actualizar estado");
        }
    };

    return (
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-widest text-sm flex items-center gap-2">
                        <Gift className="w-5 h-5 text-slate-900" />
                        Catálogo de Canje del Restaurante
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mt-1">Los clientes podrán canjear sus puntos acumulados en este restaurante.</p>
                </div>
                <button
                    onClick={() => { resetForm(); setShowAddModal(true); }}
                    className="bg-primary text-slate-900 px-4 py-2 rounded-xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 text-xs"
                >
                    <Plus className="w-4 h-4" /> Nueva Recompensa
                </button>
            </div>

            {!loading && pointsProducts.length > 0 && (
                <div className="mx-6 mt-6 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                        <h4 className="font-black text-amber-800 flex items-center gap-2">
                            <Tag className="w-4 h-4" /> Productos del Menú Canjeables
                        </h4>
                        <p className="text-xs text-amber-700 font-medium">Tienes {pointsProducts.length} producto(s) en tu menú configurado(s) para ser canjeados con puntos.</p>
                    </div>
                    <div className="bg-amber-100 text-amber-600 font-black px-4 py-2 rounded-xl text-lg shadow-sm border border-amber-200 whitespace-nowrap">
                        {pointsProducts.length}
                    </div>
                </div>
            )}

            {loading ? (
                <div className="p-12 flex justify-center">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            ) : rewards.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <Gift className="w-10 h-10 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-bold">No hay recompensas configuradas</p>
                    <p className="text-slate-400 text-xs font-medium mt-1 mb-4">Añade productos o promociones para canjear con puntos del restaurante.</p>
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {rewards.map((reward) => (
                        <div key={reward.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                                    {reward.imageUrl ? (
                                        <img src={reward.imageUrl} alt={reward.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <Gift className="w-8 h-8 text-slate-300" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800">{reward.title}</h4>
                                    <p className="text-xs text-slate-500 font-medium mb-2 max-w-sm line-clamp-2">{reward.description}</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-primary/10 text-slate-900 px-2 py-0.5 rounded-full font-black uppercase">
                                            {reward.pointsCost} Puntos
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => toggleStatus(reward)}
                                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${reward.isActive ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}
                                >
                                    {reward.isActive ? 'Activo' : 'Inactivo'}
                                </button>
                                <button onClick={() => handleDeleteReward(reward.id, reward.imageUrl)} className="p-2 text-red-400 hover:bg-red-50 rounded-xl transition-all">
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
                        <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                                <Gift className="w-6 h-6 text-slate-900" />
                                Nueva Recompensa
                            </h3>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-all">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="flex justify-center mb-6">
                                <div className="relative group/image">
                                    <div className={`w-32 h-32 rounded-3xl overflow-hidden border-2 border-dashed ${imagePreview ? 'border-primary' : 'border-slate-200'} flex items-center justify-center bg-slate-50 transition-all group-hover/image:border-primary`}>
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-2 text-slate-400">
                                                <ImageIcon className="w-8 h-8" />
                                                <span className="text-[10px] font-bold uppercase">Subir Foto</span>
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                        />
                                        {imagePreview && (
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/image:opacity-100 transition-opacity flex items-center justify-center">
                                                <Upload className="w-6 h-6 text-white" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Título de la Recompensa</label>
                                <input
                                    type="text"
                                    value={newReward.title}
                                    onChange={(e) => setNewReward({ ...newReward, title: e.target.value })}
                                    placeholder="Ej: Hamburguesa Sencilla Gratis"
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Descripción</label>
                                <textarea
                                    value={newReward.description}
                                    onChange={(e) => setNewReward({ ...newReward, description: e.target.value })}
                                    placeholder="Detalles sobre qué incluye o condiciones..."
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm min-h-[80px]"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Costo en Puntos</label>
                                <input
                                    type="number"
                                    value={newReward.pointsCost}
                                    onChange={(e) => setNewReward({ ...newReward, pointsCost: Number(e.target.value) })}
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary px-4 py-3 rounded-2xl outline-none font-bold text-slate-700 transition-all text-sm"
                                />
                                <p className="text-[10px] text-slate-400 mt-1 font-medium ml-1">Puntos requeridos del saldo de este restaurante para canjear.</p>
                            </div>

                            <button
                                onClick={handleAddReward}
                                disabled={isUploading}
                                className="w-full bg-primary text-slate-900 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:bg-orange-600 transition-all flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
                            >
                                {isUploading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                ) : (
                                    <><Save className="w-5 h-5" /> Guardar Recompensa</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
