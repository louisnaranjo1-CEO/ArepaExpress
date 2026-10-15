import React, { useState, useEffect, useMemo } from 'react';
import { 
    Package, 
    Plus, 
    Search, 
    Edit2, 
    Trash2, 
    Check, 
    X, 
    Image as ImageIcon, 
    Tag, 
    Layers, 
    DollarSign, 
    Upload, 
    Loader2, 
    AlertCircle,
    Boxes,
    CheckCircle2,
    ZoomIn,
    ZoomOut,
    RotateCcw
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

export interface CommonProductVariant {
    name: string;
    suggested_price?: number;
}

export interface CommonProduct {
    id: string;
    name: string;
    category: string;
    subcategory?: string;
    description?: string;
    image_url: string;
    barcode?: string;
    variants: CommonProductVariant[];
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

const COMMON_CATEGORIES = [
    'Todos',
    'Víveres',
    'Bebidas',
    'Lácteos y Quesos',
    'Charcutería',
    'Panadería y Dulces',
    'Snacks y Golosinas',
    'Cuidado Personal',
    'Limpieza del Hogar',
    'Mascotas',
    'Farmacia y Salud',
    'Licores',
    'Otros'
];

interface GlobalCategoryItem {
    id: string;
    name: string;
    parent_id: string | null;
}

export default function CommonProductsManager() {
    const [products, setProducts] = useState<CommonProduct[]>([]);
    const [globalCategories, setGlobalCategories] = useState<GlobalCategoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<CommonProduct | null>(null);
    const [previewingProductImage, setPreviewingProductImage] = useState<{ url: string; name: string } | null>(null);
    const [imageZoomScale, setImageZoomScale] = useState<number>(1);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Form state
    const [formData, setFormData] = useState<{
        name: string;
        category: string;
        subcategory: string;
        category_id: string;
        sub_category_id: string;
        description: string;
        image_url: string;
        barcode: string;
        variants: CommonProductVariant[];
        is_active: boolean;
    }>({
        name: '',
        category: '',
        subcategory: '',
        category_id: '',
        sub_category_id: '',
        description: '',
        image_url: '',
        barcode: '',
        variants: [{ name: 'Estándar', suggested_price: 1.0 }],
        is_active: true
    });

    const [newVariantName, setNewVariantName] = useState('');
    const [newVariantPrice, setNewVariantPrice] = useState('');
    const [imageSize, setImageSize] = useState<number | null>(null);
    const [checkingImageSize, setCheckingImageSize] = useState(false);

    const formatFileSize = (bytes: number) => {
        if (!bytes || bytes <= 0) return '0 B';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const fetchImageSizeFromUrl = async (url: string) => {
        if (!url || !url.startsWith('http')) {
            setImageSize(null);
            return;
        }
        setCheckingImageSize(true);
        try {
            const res = await fetch(url, { method: 'HEAD' });
            const contentLength = res.headers.get('content-length');
            if (contentLength) {
                setImageSize(parseInt(contentLength, 10));
            } else {
                setImageSize(null);
            }
        } catch {
            setImageSize(null);
        } finally {
            setCheckingImageSize(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const { data } = await supabase
                .from('global_categories')
                .select('id, name, parent_id')
                .eq('is_active', true)
                .order('name', { ascending: true });
            if (data) setGlobalCategories(data);
        } catch (err) {
            console.error('Error fetching global categories:', err);
        }
    };

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('common_products')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setProducts(data || []);
        } catch (error: any) {
            console.error('Error fetching common products:', error);
            toast.error('Error al cargar productos comunes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProducts();
        fetchCategories();

        const channel = supabase
            .channel('cpanel_common_products')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'common_products' }, () => {
                fetchProducts();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const openCreateModal = () => {
        setEditingProduct(null);
        setImageSize(null);
        const mainCats = globalCategories.filter(c => !c.parent_id);
        const defaultMain = mainCats[0]?.name || 'Supermercados';
        const defaultMainId = mainCats[0]?.id || '';
        const defaultSubs = globalCategories.filter(c => c.parent_id === defaultMainId);
        const defaultSub = defaultSubs[0]?.name || '';
        const defaultSubId = defaultSubs[0]?.id || '';

        setFormData({
            name: '',
            category: defaultMain,
            subcategory: defaultSub,
            category_id: defaultMainId,
            sub_category_id: defaultSubId,
            description: '',
            image_url: '',
            barcode: '',
            variants: [{ name: '250gr' }, { name: '500gr' }, { name: '1kg' }],
            is_active: true
        });
        setNewVariantName('');
        setNewVariantPrice('');
        setIsModalOpen(true);
    };

    const openEditModal = (product: CommonProduct) => {
        setEditingProduct(product);
        const matchedMain = globalCategories.find(c => (!c.parent_id) && (c.name === product.category || c.id === (product as any).category_id));
        setFormData({
            name: product.name,
            category: product.category || matchedMain?.name || '',
            subcategory: product.subcategory || (product as any).sub_category || '',
            category_id: (product as any).category_id || matchedMain?.id || '',
            sub_category_id: (product as any).sub_category_id || '',
            description: product.description || '',
            image_url: product.image_url || '',
            barcode: product.barcode || '',
            variants: Array.isArray(product.variants) && product.variants.length > 0 
                ? product.variants 
                : [{ name: 'Estándar' }],
            is_active: product.is_active ?? true
        });
        setNewVariantName('');
        setNewVariantPrice('');
        setIsModalOpen(true);
        if (product.image_url) {
            fetchImageSizeFromUrl(product.image_url);
        } else {
            setImageSize(null);
        }
    };

    const handleAddVariant = () => {
        if (!newVariantName.trim()) return;
        const v: CommonProductVariant = {
            name: newVariantName.trim(),
            suggested_price: newVariantPrice ? parseFloat(newVariantPrice) : undefined
        };
        setFormData(prev => ({
            ...prev,
            variants: [...prev.variants, v]
        }));
        setNewVariantName('');
        setNewVariantPrice('');
    };

    const handleRemoveVariant = (index: number) => {
        setFormData(prev => ({
            ...prev,
            variants: prev.variants.filter((_, i) => i !== index)
        }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImageSize(file.size);
        setUploadingImage(true);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const fileName = `common_products/cp_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('store_assets')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('store_assets').getPublicUrl(fileName);
            if (data?.publicUrl) {
                setFormData(prev => ({ ...prev, image_url: data.publicUrl }));
                toast.success('Imagen cargada');
            }
        } catch (error: any) {
            console.error('Error uploading image:', error);
            toast.error('Error al subir imagen: ' + (error?.message || 'Error'));
        } finally {
            setUploadingImage(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            return toast.error('El nombre del producto es obligatorio');
        }

        setSaving(true);
        try {
            const payload = {
                name: formData.name.trim(),
                category: formData.category,
                subcategory: formData.subcategory || null,
                category_id: formData.category_id || null,
                sub_category_id: formData.sub_category_id || null,
                description: formData.description.trim(),
                image_url: formData.image_url.trim(),
                barcode: formData.barcode.trim(),
                variants: formData.variants,
                is_active: formData.is_active,
                updated_at: new Date().toISOString()
            };

            if (editingProduct?.id) {
                const { error } = await supabase
                    .from('common_products')
                    .update(payload)
                    .eq('id', editingProduct.id);
                if (error) throw error;
                toast.success('Producto común actualizado');
            } else {
                const { error } = await supabase
                    .from('common_products')
                    .insert([{ ...payload, created_at: new Date().toISOString() }]);
                if (error) throw error;
                toast.success('Producto común creado');
            }

            setIsModalOpen(false);
            fetchProducts();
        } catch (error: any) {
            console.error('Error saving common product:', error);
            toast.error('Error al guardar: ' + (error?.message || 'Error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar el producto común "${name}"?`)) return;

        try {
            const { error } = await supabase
                .from('common_products')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Producto eliminado');
            fetchProducts();
        } catch (error: any) {
            console.error('Error deleting common product:', error);
            toast.error('Error al eliminar');
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCat = selectedCategory === 'Todos' || p.category === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchesQuery = !q || 
                p.name.toLowerCase().includes(q) || 
                (p.description && p.description.toLowerCase().includes(q)) ||
                (p.barcode && p.barcode.toLowerCase().includes(q));

            return matchesCat && matchesQuery;
        });
    }, [products, selectedCategory, searchQuery]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs">
                <div>
                    <div className="flex items-center gap-2 text-primary font-black text-xs uppercase tracking-widest mb-1">
                        <Boxes className="w-4 h-4" /> Catálogo Maestro
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                        Productos Comunes y Genéricos
                    </h1>
                    <p className="text-xs text-slate-500 font-medium mt-1 max-w-2xl">
                        Registra productos estandarizados (mantequillas, harinas, bebidas, etc.) con sus presentaciones. 
                        Los comercios podrán seleccionarlos con un clic para no duplicar fotos ni datos en el sistema.
                    </p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="bg-primary hover:bg-amber-400 text-slate-950 font-black px-5 py-3 rounded-2xl flex items-center gap-2 text-xs transition-all shadow-md active:scale-95 shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    <span>Nuevo Producto Común</span>
                </button>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
                <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar por nombre, descripción o código de barras..."
                        className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2.5 rounded-2xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {(['Todos', ...globalCategories.filter(c => !c.parent_id).map(c => c.name)]).map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                                selectedCategory === cat
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Products Grid */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando productos comunes...</p>
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 text-center space-y-3">
                    <Package className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-base font-black text-slate-800">No se encontraron productos comunes</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Crea el primer producto común para que los negocios puedan utilizarlo al registrar su inventario.
                    </p>
                    <button
                        onClick={openCreateModal}
                        className="mt-2 bg-slate-900 text-white px-4 py-2 rounded-xl font-black text-xs inline-flex items-center gap-1.5"
                    >
                        <Plus className="w-3.5 h-3.5 text-primary" /> Crear Producto
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredProducts.map(p => (
                        <div
                            key={p.id}
                            className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
                        >
                            <div className="space-y-3">
                                {/* Image & Category */}
                                <div 
                                    className={`relative aspect-square w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 ${
                                        p.image_url ? 'cursor-zoom-in' : ''
                                    }`}
                                    onClick={() => {
                                        if (p.image_url) {
                                            setPreviewingProductImage({ url: p.image_url, name: p.name });
                                            setImageZoomScale(1);
                                        }
                                    }}
                                    title={p.image_url ? "Clic para ampliar y ver detalles de la imagen" : undefined}
                                >
                                    {p.image_url ? (
                                        <>
                                            <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                                <span className="p-2 bg-white/95 backdrop-blur-md rounded-full text-slate-800 shadow-md">
                                                    <ZoomIn className="w-4 h-4" />
                                                </span>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300">
                                            <ImageIcon className="w-10 h-10" />
                                            <span className="text-[10px] font-bold mt-1">Sin Imagen</span>
                                        </div>
                                    )}
                                    <span className="absolute top-2 left-2 bg-slate-950/70 backdrop-blur-md text-white text-[10px] font-black px-2 py-0.5 rounded-lg z-10">
                                        {p.category}
                                    </span>
                                </div>

                                {/* Details */}
                                <div>
                                    <h3 className="font-black text-slate-900 text-sm leading-tight line-clamp-1">
                                        {p.name}
                                    </h3>
                                    {p.description && (
                                        <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mt-1 leading-snug">
                                            {p.description}
                                        </p>
                                    )}
                                </div>

                                {/* Variants Pills */}
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">
                                        Presentaciones ({Array.isArray(p.variants) ? p.variants.length : 0}):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                        {Array.isArray(p.variants) && p.variants.map((v, i) => (
                                            <span
                                                key={i}
                                                className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200"
                                            >
                                                {v.name}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'
                                }`}>
                                    {p.is_active ? 'Activo' : 'Inactivo'}
                                </span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(p)}
                                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors"
                                        title="Editar"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p.id, p.name)}
                                        className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center transition-colors"
                                        title="Eliminar"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal Crear / Editar Producto Común */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div>
                                <h3 className="font-black text-slate-900 text-lg">
                                    {editingProduct ? 'Editar Producto Común' : 'Nuevo Producto Común'}
                                </h3>
                                <p className="text-xs text-slate-400 font-bold">Catálogo Maestro para Negocios</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Nombre */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                                    Nombre del Producto *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Mantequilla Mavesa, Harina PAN..."
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Categoría Principal (Sector) y Subcategoría (Dinámicos de public.global_categories) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                                        Categoría Principal (Sector) *
                                    </label>
                                    <select
                                        required
                                        value={formData.category}
                                        onChange={(e) => {
                                            const selName = e.target.value;
                                            const parentCat = globalCategories.find(c => !c.parent_id && c.name === selName);
                                            const subCats = globalCategories.filter(c => c.parent_id && c.parent_id === parentCat?.id);
                                            setFormData({
                                                ...formData,
                                                category: selName,
                                                category_id: parentCat?.id || '',
                                                subcategory: subCats[0]?.name || '',
                                                sub_category_id: subCats[0]?.id || ''
                                            });
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                    >
                                        <option value="" disabled>Seleccionar Sector...</option>
                                        {globalCategories.filter(c => !c.parent_id).map(c => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                                        Subcategoría
                                    </label>
                                    <select
                                        value={formData.subcategory}
                                        onChange={(e) => {
                                            const subName = e.target.value;
                                            const subObj = globalCategories.find(c => c.name === subName);
                                            setFormData({
                                                ...formData,
                                                subcategory: subName,
                                                sub_category_id: subObj?.id || ''
                                            });
                                        }}
                                        className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
                                    >
                                        <option value="">(Sin subcategoría)</option>
                                        {(() => {
                                            const parentCat = globalCategories.find(c => !c.parent_id && (c.name === formData.category || c.id === formData.category_id));
                                            const availableSubs = globalCategories.filter(c => c.parent_id && c.parent_id === parentCat?.id);
                                            return availableSubs.map(s => (
                                                <option key={s.id} value={s.name}>{s.name}</option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1">
                                    Descripción Genérica
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Detalles sobre este producto genérico..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Imagen */}
                            <div className="space-y-2">
                                <label className="block text-xs font-black text-slate-700 uppercase tracking-wider">
                                    Imagen Oficial (Evita duplicados en comercios)
                                </label>
                                <div className="flex items-center gap-3">
                                    <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                                        {formData.image_url ? (
                                            <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon className="w-6 h-6 text-slate-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                        <input
                                            type="text"
                                            placeholder="URL de imagen pública o sube una foto..."
                                            value={formData.image_url}
                                            onChange={(e) => {
                                                const newUrl = e.target.value;
                                                setFormData({ ...formData, image_url: newUrl });
                                                fetchImageSizeFromUrl(newUrl);
                                            }}
                                            className="w-full bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-800"
                                        />
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg cursor-pointer transition-colors">
                                                {uploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                                <span>Subir foto a Storage</span>
                                                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                                            </label>

                                            {/* Tamaño / Peso de la imagen */}
                                            {formData.image_url && (
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-lg text-[11px] font-black text-amber-900 shadow-2xs">
                                                    <span className="text-[10px] uppercase tracking-wider text-amber-700 font-bold">Peso:</span>
                                                    {checkingImageSize ? (
                                                        <span className="flex items-center gap-1 text-amber-600">
                                                            <Loader2 className="w-3 h-3 animate-spin" /> Calculando...
                                                        </span>
                                                    ) : imageSize !== null ? (
                                                        <span className={imageSize > 1024 * 1024 ? 'text-rose-600 font-extrabold' : 'text-emerald-700 font-extrabold'}>
                                                            {formatFileSize(imageSize)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-slate-400 font-medium">Desconocido</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Presentaciones / Variantes */}
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                                <div>
                                    <label className="block text-xs font-black text-slate-900 uppercase tracking-wider">
                                        Presentaciones y Variantes
                                    </label>
                                    <p className="text-[10px] text-slate-500 font-bold">
                                        Ej: 250gr, 500gr, 1kg, 1.5L. El negocio seleccionará cuáles tiene disponibles.
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Ej: 500gr o 1 Litro"
                                        value={newVariantName}
                                        onChange={(e) => setNewVariantName(e.target.value)}
                                        className="flex-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-800"
                                    />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="Ref ($)"
                                        value={newVariantPrice}
                                        onChange={(e) => setNewVariantPrice(e.target.value)}
                                        className="w-20 bg-white border border-slate-200 px-2 py-1.5 rounded-xl text-xs font-bold text-slate-800"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddVariant}
                                        className="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-slate-800 shrink-0"
                                    >
                                        + Agregar
                                    </button>
                                </div>

                                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                    {formData.variants.map((v, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs">
                                            <span className="font-bold text-slate-800">{v.name}</span>
                                            <div className="flex items-center gap-2">
                                                {v.suggested_price && (
                                                    <span className="text-[11px] font-mono font-bold text-emerald-600">
                                                        ${v.suggested_price.toFixed(2)}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveVariant(i)}
                                                    className="text-slate-400 hover:text-rose-600"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Botón Guardar */}
                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full bg-primary hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 text-xs shadow-md transition-all active:scale-95"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                <span>{editingProduct ? 'Guardar Cambios' : 'Registrar Producto Común'}</span>
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal para Ampliar y Ver Detalles de Imagen de Producto Común */}
            {previewingProductImage && (
                <div 
                    className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => {
                        setPreviewingProductImage(null);
                        setImageZoomScale(1);
                    }}
                >
                    <div 
                        className="relative max-w-4xl w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col max-h-[92vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header con título y controles de zoom */}
                        <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                            <div className="min-w-0">
                                <h3 className="text-sm sm:text-base font-black text-white truncate">
                                    {previewingProductImage.name}
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    Catálogo Maestro • Inspección de imagen en alta resolución
                                </p>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setImageZoomScale(prev => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                                    title="Alejar"
                                >
                                    <ZoomOut className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-mono font-bold text-slate-300 min-w-[42px] text-center">
                                    {Math.round(imageZoomScale * 100)}%
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setImageZoomScale(prev => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                                    title="Acercar"
                                >
                                    <ZoomIn className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setImageZoomScale(1)}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                                    title="Restablecer tamaño"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPreviewingProductImage(null);
                                        setImageZoomScale(1);
                                    }}
                                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 text-slate-200 hover:text-white transition-colors ml-1"
                                    title="Cerrar"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Área de visualización interactiva con zoom */}
                        <div className="flex-1 overflow-auto p-4 sm:p-8 flex items-center justify-center bg-radial from-slate-900 to-slate-950 min-h-[320px]">
                            <div 
                                className="transition-transform duration-200 ease-out origin-center cursor-grab active:cursor-grabbing flex items-center justify-center"
                                style={{ transform: `scale(${imageZoomScale})` }}
                            >
                                <img
                                    src={previewingProductImage.url}
                                    alt={previewingProductImage.name}
                                    className="max-h-[68vh] max-w-full object-contain rounded-2xl shadow-2xl select-none"
                                    draggable={false}
                                />
                            </div>
                        </div>

                        {/* Pie con sugerencia */}
                        <div className="px-4 py-2.5 bg-slate-950/60 border-t border-slate-800 text-center">
                            <span className="text-[11px] text-slate-400 font-medium">
                                Haz zoom o arrastra para revisar la calidad y nitidez del empaque oficial.
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
