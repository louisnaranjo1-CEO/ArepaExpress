import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Box, Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Image as ImageIcon, Loader2, DollarSign, X } from 'lucide-react';
import DualPrice from '../../components/DualPrice';
import { GLOBAL_CATEGORIES } from '../../lib/constants';
import toast from 'react-hot-toast';

interface Product {
    id: string;
    restaurant_id: string;
    name: string;
    description: string;
    price: number;
    category_id?: string;
    category_name?: string;
    image_url?: string;
    is_available?: boolean;
    is_active?: boolean;
    created_at?: string;
}

interface Props {
    restaurantId: string;
    restaurantName: string;
}

export default function RestaurantProductsManager({ restaurantId, restaurantName }: Props) {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: GLOBAL_CATEGORIES[0] || 'Varios',
        imageUrl: '',
        isActive: true,
        isAvailable: true
    });
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const fetchProducts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select('*')
                .eq('restaurant_id', restaurantId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProducts(data || []);
        } catch (err) {
            console.error("Error fetching products:", err);
            toast.error("Error al cargar los productos");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (restaurantId) {
            fetchProducts();
        }
    }, [restaurantId]);

    const openCreateModal = () => {
        setEditingProduct(null);
        setFormData({
            name: '',
            description: '',
            price: '',
            category: GLOBAL_CATEGORIES[0] || 'Varios',
            imageUrl: '',
            isActive: true,
            isAvailable: true
        });
        setImageFile(null);
        setImagePreview(null);
        setIsModalOpen(true);
    };

    const openEditModal = (p: Product) => {
        setEditingProduct(p);
        setFormData({
            name: p.name || '',
            description: p.description || '',
            price: p.price ? p.price.toString() : '',
            category: p.category_name || GLOBAL_CATEGORIES[0] || 'Varios',
            imageUrl: p.image_url || '',
            isActive: p.is_active !== false,
            isAvailable: p.is_available !== false
        });
        setImageFile(null);
        setImagePreview(p.image_url || null);
        setIsModalOpen(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            toast.error("El nombre del producto es obligatorio");
            return;
        }

        const numPrice = parseFloat(formData.price) || 0;
        setSaving(true);

        try {
            let finalImageUrl = formData.imageUrl;

            if (imageFile) {
                setUploadingImage(true);
                const fileExt = imageFile.name.split('.').pop() || 'jpg';
                const fileName = `prod_${restaurantId}_${Date.now()}.${fileExt}`;
                const { error: upErr } = await supabase.storage
                    .from('store_assets')
                    .upload(fileName, imageFile, { upsert: true });

                if (upErr) throw upErr;

                const { data: pubData } = supabase.storage
                    .from('store_assets')
                    .getPublicUrl(fileName);

                finalImageUrl = pubData.publicUrl;
            }

            if (editingProduct) {
                // Update
                const { error } = await supabase
                    .from('products')
                    .update({
                        name: formData.name.trim(),
                        description: formData.description.trim(),
                        price: numPrice,
                        category_name: formData.category,
                        image_url: finalImageUrl,
                        is_active: formData.isActive,
                        is_available: formData.isAvailable,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingProduct.id);

                if (error) throw error;
                toast.success("Producto actualizado correctamente");
            } else {
                // Create
                const { error } = await supabase
                    .from('products')
                    .insert({
                        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : undefined,
                        restaurant_id: restaurantId,
                        name: formData.name.trim(),
                        description: formData.description.trim(),
                        price: numPrice,
                        category_name: formData.category,
                        image_url: finalImageUrl,
                        is_active: formData.isActive,
                        is_available: formData.isAvailable,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });

                if (error) throw error;
                toast.success("Producto creado exitosamente");
            }

            setIsModalOpen(false);
            fetchProducts();
        } catch (err: any) {
            console.error("Error saving product:", err);
            toast.error("Error al guardar: " + (err.message || ""));
        } finally {
            setSaving(false);
            setUploadingImage(false);
        }
    };

    const handleDeleteProduct = async (p: Product) => {
        if (!window.confirm(`¿Estás seguro de eliminar el producto "${p.name}"?`)) return;

        try {
            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', p.id);

            if (error) throw error;
            toast.success("Producto eliminado");
            setProducts(prev => prev.filter(item => item.id !== p.id));
        } catch (err: any) {
            console.error("Error deleting product:", err);
            toast.error("Error al eliminar: " + (err.message || ""));
        }
    };

    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.category_name && p.category_name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900">Catálogo de Productos</h2>
                    <p className="text-xs font-medium text-slate-400">Gestiona los artículos y precios de {restaurantName}.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-6 py-3.5 bg-primary text-slate-950 font-black rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all text-xs uppercase tracking-wider"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Producto
                </button>
            </div>

            {/* Search Input */}
            <div className="relative">
                <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                    type="text"
                    placeholder="Buscar producto por nombre o categoría..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200/80 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary shadow-sm"
                />
            </div>

            {/* Products Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[32px] border border-slate-100 p-8">
                    <Box className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-slate-700">No hay productos registrados</h3>
                    <p className="text-slate-400 text-sm mt-1 mb-6">Comienza subiendo el primer producto para esta tienda.</p>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-5 py-3 bg-primary text-slate-900 font-black rounded-2xl text-xs uppercase tracking-wider"
                    >
                        <Plus className="w-4 h-4" />
                        Agregar Producto Ahora
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(p => (
                        <div
                            key={p.id}
                            className="bg-white rounded-[28px] border border-slate-100 shadow-sm p-4 flex flex-col justify-between hover:shadow-md transition-all group"
                        >
                            <div>
                                <div className="h-44 rounded-2xl bg-slate-100 overflow-hidden mb-3 relative">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                            <ImageIcon className="w-10 h-10 mb-1" />
                                            <span className="text-[10px] font-bold uppercase">Sin imagen</span>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                                            p.is_available !== false ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                                        }`}>
                                            {p.is_available !== false ? 'Disponible' : 'Agotado'}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                                        {p.category_name || 'Varios'}
                                    </span>
                                    <h4 className="font-bold text-slate-900 text-base leading-snug line-clamp-1">{p.name}</h4>
                                    {p.description && (
                                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{p.description}</p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Precio</p>
                                    <DualPrice usdAmount={p.price || 0} usdClassName="text-base font-black text-slate-900" showDivider={false} />
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(p)}
                                        className="p-2 rounded-xl text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                        title="Editar producto"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteProduct(p)}
                                        className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        title="Eliminar producto"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Product Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
                    <div className="bg-white rounded-[36px] w-full max-w-lg shadow-2xl p-6 sm:p-8 relative my-auto animate-in zoom-in-95 duration-200">
                        <button
                            onClick={() => setIsModalOpen(false)}
                            className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <h3 className="text-2xl font-black text-slate-900 mb-1">
                            {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                        </h3>
                        <p className="text-xs text-slate-400 mb-6">
                            Completa los datos del producto para {restaurantName}.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Image Preview & Upload */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                                    Foto del Producto
                                </label>
                                <div className="flex items-center gap-4">
                                    <div className="w-24 h-24 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                        {imagePreview ? (
                                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon className="w-8 h-8 text-slate-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-2">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            className="text-xs text-slate-500 file:mr-2 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
                                        />
                                        <input
                                            type="text"
                                            placeholder="O ingresa URL de imagen..."
                                            value={formData.imageUrl}
                                            onChange={(e) => {
                                                setFormData({ ...formData, imageUrl: e.target.value });
                                                if (!imageFile) setImagePreview(e.target.value);
                                            }}
                                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                    Nombre del Producto *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Hamburguesa Especial, Arepa Reina Pepiada..."
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                />
                            </div>

                            {/* Price and Category */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                        Precio ($ USD) *
                                    </label>
                                    <div className="relative">
                                        <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            required
                                            placeholder="0.00"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 outline-none focus:border-primary"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                        Categoría
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none focus:border-primary"
                                    >
                                        {GLOBAL_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                    Descripción
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Ingredientes, porciones, detalles..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 outline-none focus:border-primary resize-none"
                                />
                            </div>

                            {/* Availability Toggle */}
                            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                <div>
                                    <p className="text-xs font-bold text-slate-800">Disponible para Venta</p>
                                    <p className="text-[10px] text-slate-400">Si está agotado, los clientes lo verán desactivado.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={formData.isAvailable}
                                    onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                                    className="w-5 h-5 accent-primary cursor-pointer"
                                />
                            </div>

                            {/* Actions */}
                            <div className="pt-3 flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-5 py-3 rounded-2xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || uploadingImage}
                                    className="flex items-center gap-2 px-6 py-3 bg-primary text-slate-950 font-black rounded-2xl text-xs uppercase tracking-wider shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    {(saving || uploadingImage) && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingProduct ? 'Guardar Cambios' : 'Crear Producto'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
