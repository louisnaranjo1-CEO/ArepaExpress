import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Plus, Search, Filter, Edit2, Trash2, Image as ImageIcon, Check, ChevronDown, X, Loader2, DollarSign, Tag, TrendingUp } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    image: string;
    isActive: boolean;
    investment?: number;
}

export default function ProductManagement() {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('Todos');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: 'Comida',
        image: '',
        isActive: true,
        investment: ''
    });

    useEffect(() => {
        if (!user) return;
        fetchProducts();
    }, [user]);

    const fetchProducts = async () => {
        try {
            const productsRef = collection(db, 'restaurants', user!.uid, 'products');
            const q = query(productsRef);
            const querySnapshot = await getDocs(q);
            const items: Product[] = [];
            querySnapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Product);
            });
            setProducts(items);
        } catch (error) {
            console.error("Error fetching products:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setFormData({
                name: product.name,
                description: product.description,
                price: product.price.toString(),
                category: product.category,
                image: product.image,
                isActive: product.isActive,
                investment: product.investment?.toString() || ''
            });
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                category: 'Comida',
                image: '',
                isActive: true,
                investment: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSubmitting(true);

        try {
            const productData = {
                ...formData,
                price: parseFloat(formData.price),
                investment: formData.investment ? parseFloat(formData.investment) : 0,
                updatedAt: new Date()
            };

            if (editingProduct) {
                const productRef = doc(db, 'restaurants', user.uid, 'products', editingProduct.id);
                await updateDoc(productRef, productData);
            } else {
                const productsRef = collection(db, 'restaurants', user.uid, 'products');
                await addDoc(productsRef, {
                    ...productData,
                    createdAt: new Date()
                });
            }

            setIsModalOpen(false);
            setEditingProduct(null);
            setFormData({ name: '', description: '', price: '', category: 'Comida', image: '', investment: '', isActive: true });
            fetchProducts();
        } catch (error) {
            console.error("Error saving product:", error);
            alert("Error al guardar el producto");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!user || !window.confirm('¿Estás seguro de eliminar este producto?')) return;
        try {
            await deleteDoc(doc(db, 'restaurants', user.uid, 'products', id));
            fetchProducts();
        } catch (error) {
            console.error("Error deleting product:", error);
        }
    };

    const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="mt-4 text-slate-500 font-bold">Cargando productos...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900">Carta de Productos</h1>
                    <p className="text-slate-500 font-medium">Gestiona tu menú, precios y disponibilidad.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-primary text-white px-6 py-4 rounded-2xl font-black shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all group"
                >
                    <Plus className="w-5 h-5 transition-transform group-hover:rotate-90" />
                    <span>Añadir Producto</span>
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar en el menú..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                    />
                </div>

                {/* Categories Tabs */}
                <div className="flex overflow-x-auto gap-2 pb-2 md:pb-0 scrollbar-hide">
                    {categories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-6 py-4 rounded-2xl font-bold whitespace-nowrap transition-all border ${activeCategory === cat
                                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {filteredProducts.length === 0 ? (
                <div className="p-20 text-center border-2 border-dashed border-slate-100 rounded-[40px] grayscale opacity-50 bg-white/50">
                    <UtensilsCrossed className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold text-xl">No se encontraron productos</p>
                    <p className="text-slate-300 font-medium max-w-xs mx-auto mt-2 italic">Empieza a crear tu menú haciendo clic en "Añadir Producto".</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredProducts.map((p) => (
                        <div key={p.id} className="bg-white rounded-[35px] overflow-hidden border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 group">
                            <div className="h-48 bg-slate-100 relative overflow-hidden">
                                {p.image ? (
                                    <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                        <ImageIcon className="w-12 h-12" />
                                    </div>
                                )}
                                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-black text-primary shadow-sm">
                                    ${p.price.toFixed(2)}
                                </div>
                                {!p.isActive && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
                                        <span className="bg-white text-slate-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl">Agotado / Inactivo</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="bg-slate-50 text-slate-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider">{p.category}</span>
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900 line-clamp-1">{p.name}</h3>
                                    <p className="text-sm text-slate-400 line-clamp-2 mt-1">{p.description}</p>
                                </div>

                                <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleOpenModal(p)}
                                            className="p-3 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(p.id)}
                                            className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {p.investment && (
                                        <div className="text-right">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Utilidad</p>
                                            <p className="text-sm font-black text-green-500">+${(p.price - p.investment).toFixed(2)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal for Add/Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
                    <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-2xl font-black text-slate-900">
                                {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <Tag className="w-3 h-3" /> Nombre
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2">Descripción</label>
                                <textarea
                                    rows={2}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700 resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                        <DollarSign className="w-3 h-3" /> Precio Venta
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        required
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> Costo Inversión
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={formData.investment}
                                        onChange={(e) => setFormData({ ...formData, investment: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2">URL Imagen</label>
                                <input
                                    type="text"
                                    placeholder="https://..."
                                    value={formData.image}
                                    onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Categoría</label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                    >
                                        <option>Comida</option>
                                        <option>Bebidas</option>
                                        <option>Postres</option>
                                        <option>Otros</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Estado</label>
                                    <div
                                        onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                                        className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl cursor-pointer"
                                    >
                                        <span className="font-bold text-sm text-slate-600">{formData.isActive ? 'Activo' : 'Inactivo'}</span>
                                        <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.isActive ? 'bg-primary' : 'bg-slate-300'}`}>
                                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${formData.isActive ? 'left-6' : 'left-1'}`}></div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-primary text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/30 flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-70 mt-4"
                            >
                                {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <span>{editingProduct ? 'Actualizar Producto' : 'Crear Producto'}</span>}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
