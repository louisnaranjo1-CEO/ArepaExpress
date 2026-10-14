import React, { useState, useEffect, useMemo } from 'react';
import { 
    Search, 
    X, 
    Package, 
    Check, 
    Loader2, 
    Tag, 
    DollarSign, 
    CheckCircle2, 
    AlertCircle, 
    Sparkles, 
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { GLOBAL_CATEGORIES, CATEGORY_SECTORS } from '../../lib/constants';

export interface CommonVariant {
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
    variants: CommonVariant[];
    is_active: boolean;
}

export interface SelectedCommonProductPayload {
    name: string;
    category: string;
    subcategory: string;
    description: string;
    image_url: string;
    variants: {
        name: string;
        price: number;
        is_available: boolean;
    }[];
    basePrice: number;
}

interface CommonProductsPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectProduct: (productData: SelectedCommonProductPayload) => void;
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

export default function CommonProductsPickerModal({
    isOpen,
    onClose,
    onSelectProduct
}: CommonProductsPickerModalProps) {
    const [products, setProducts] = useState<CommonProduct[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');

    // Step 2: Presentation configuration
    const [selectedProduct, setSelectedProduct] = useState<CommonProduct | null>(null);
    const [configuredVariants, setConfiguredVariants] = useState<{
        name: string;
        price: number;
        is_available: boolean;
        included: boolean;
    }[]>([]);
    const [singlePrice, setSinglePrice] = useState<string>('0');
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

    useEffect(() => {
        if (isOpen) {
            fetchCommonProducts();
            setSelectedProduct(null);
            setImageSize(null);
            setSearchQuery('');
            setSelectedCategory('Todos');
        }
    }, [isOpen]);

    const fetchCommonProducts = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('common_products')
                .select('*')
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (error) throw error;
            setProducts(data || []);
        } catch (err) {
            console.error('Error fetching common products:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = useMemo(() => {
        return products.filter((p) => {
            const matchesCat = selectedCategory === 'Todos' || p.category === selectedCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchesQuery = !q || 
                p.name.toLowerCase().includes(q) ||
                (p.barcode && p.barcode.toLowerCase().includes(q)) ||
                (p.description && p.description.toLowerCase().includes(q)) ||
                (p.variants && p.variants.some(v => v.name.toLowerCase().includes(q)));
            return matchesCat && matchesQuery;
        });
    }, [products, selectedCategory, searchQuery]);

    // Handle picking a common product to configure
    const handlePickProduct = (product: CommonProduct) => {
        setSelectedProduct(product);
        if (product.image_url) {
            fetchImageSizeFromUrl(product.image_url);
        } else {
            setImageSize(null);
        }

        const variantsList = Array.isArray(product.variants) && product.variants.length > 0
            ? product.variants
            : [{ name: 'Estándar', suggested_price: 1.0 }];

        setConfiguredVariants(
            variantsList.map((v) => ({
                name: v.name,
                price: Number(v.suggested_price) || 0,
                is_available: true,
                included: true
            }))
        );

        const defaultPrice = variantsList[0]?.suggested_price 
            ? String(variantsList[0].suggested_price) 
            : '0';
        setSinglePrice(defaultPrice);
    };

    // Map common product category to restaurant app GLOBAL_CATEGORIES
    const mapToRestaurantCategory = (cat: string, sub?: string) => {
        let targetCategory = 'Supermercados';
        let targetSub = sub || 'Víveres';

        switch (cat) {
            case 'Víveres':
                targetCategory = 'Supermercados';
                targetSub = 'Víveres';
                break;
            case 'Bebidas':
                targetCategory = 'Bebidas & Licores';
                targetSub = 'Bebidas sin Alcohol';
                break;
            case 'Lácteos y Quesos':
                targetCategory = 'Supermercados';
                targetSub = 'Lácteos & Huevos';
                break;
            case 'Charcutería':
                targetCategory = 'Supermercados';
                targetSub = 'Charcutería';
                break;
            case 'Panadería y Dulces':
                targetCategory = 'Panaderías & Pastelerías';
                targetSub = 'Panadería';
                break;
            case 'Snacks y Golosinas':
                targetCategory = 'Supermercados';
                targetSub = 'Abarrotes';
                break;
            case 'Limpieza del Hogar':
                targetCategory = 'Supermercados';
                targetSub = 'Limpieza';
                break;
            case 'Cuidado Personal':
            case 'Farmacia y Salud':
                targetCategory = 'Farmacias';
                targetSub = 'Cuidado Personal';
                break;
            case 'Mascotas':
                targetCategory = 'Mascotas & Veterinaria';
                targetSub = 'Alimentos';
                break;
            case 'Licores':
                targetCategory = 'Bebidas & Licores';
                targetSub = 'Licores';
                break;
            default:
                if (GLOBAL_CATEGORIES.includes(cat)) {
                    targetCategory = cat;
                }
                break;
        }

        // Validate subcategory exists in category sectors
        const validSectors = CATEGORY_SECTORS[targetCategory] || [];
        if (!validSectors.includes(targetSub) && validSectors.length > 0) {
            targetSub = validSectors[0];
        }

        return { category: targetCategory, subcategory: targetSub };
    };

    const handleConfirmSelection = () => {
        if (!selectedProduct) return;

        const { category, subcategory } = mapToRestaurantCategory(
            selectedProduct.category, 
            selectedProduct.subcategory
        );

        // Filter only included presentations
        const included = configuredVariants.filter(v => v.included);

        let finalVariants: { name: string; price: number; is_available: boolean }[] = [];
        let basePrice = 0;

        if (included.length > 1 || (included.length === 1 && included[0].name !== 'Estándar')) {
            finalVariants = included.map(v => ({
                name: v.name,
                price: Number(v.price) || 0,
                is_available: v.is_available
            }));
            const availableOnly = finalVariants.filter(v => v.is_available);
            basePrice = availableOnly.length > 0 
                ? Math.min(...availableOnly.map(v => v.price))
                : Math.min(...finalVariants.map(v => v.price));
        } else if (included.length === 1) {
            basePrice = Number(included[0].price) || 0;
            finalVariants = [{
                name: included[0].name,
                price: basePrice,
                is_available: included[0].is_available
            }];
        } else {
            basePrice = parseFloat(singlePrice) || 0;
        }

        onSelectProduct({
            name: selectedProduct.name,
            category,
            subcategory,
            description: selectedProduct.description || '',
            image_url: selectedProduct.image_url,
            variants: finalVariants,
            basePrice
        });

        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

            {/* Modal Body */}
            <div className="bg-white w-full max-w-2xl rounded-3xl sm:rounded-[36px] shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-100">
                {/* Header */}
                <div className="p-4 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                    <div className="flex items-center gap-3">
                        {selectedProduct ? (
                            <button
                                onClick={() => setSelectedProduct(null)}
                                className="p-2 hover:bg-slate-200/70 rounded-full transition-colors text-slate-700"
                                title="Volver a la lista"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                                <Package className="w-5 h-5" />
                            </div>
                        )}
                        <div>
                            <h2 className="text-base sm:text-xl font-black text-slate-900 flex items-center gap-2">
                                {selectedProduct ? 'Configurar Presentaciones' : 'Catálogo de Productos Comunes'}
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                                    Oficial
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500 font-medium">
                                {selectedProduct 
                                    ? 'Selecciona las presentaciones disponibles y tus precios en USD' 
                                    : 'Ahorra tiempo y espacio: datos e imágenes precargados'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                {selectedProduct ? (
                    /* Step 2: Presentation & Price Configurator */
                    <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
                        {/* Selected Product Banner */}
                        <div className="flex items-center gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                            <img
                                src={selectedProduct.image_url}
                                alt={selectedProduct.name}
                                className="w-16 h-16 sm:w-20 sm:h-20 object-contain rounded-xl bg-white p-1 border border-slate-200 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                                        {selectedProduct.category}
                                    </span>
                                    {selectedProduct.image_url && (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="text-slate-400 font-bold">Peso foto:</span>
                                            {checkingImageSize ? (
                                                <span className="flex items-center gap-1 text-amber-600">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> ...
                                                </span>
                                            ) : imageSize !== null ? (
                                                <span className={imageSize > 1024 * 1024 ? 'text-rose-600 font-black' : 'text-emerald-700 font-black'}>
                                                    {formatFileSize(imageSize)}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">N/D</span>
                                            )}
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate mt-1">
                                    {selectedProduct.name}
                                </h3>
                                <p className="text-xs text-slate-500 line-clamp-1">
                                    {selectedProduct.description || 'Producto genérico estándar'}
                                </p>
                            </div>
                        </div>

                        {/* Presentation selector instructions */}
                        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-start gap-2.5">
                            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-blue-900 font-medium leading-relaxed">
                                <strong>Disponibilidad por presentación:</strong> Si tienes solo algunas presentaciones (ej. solo 250gr), marca cuáles están <strong>Disponibles</strong> y cuáles <strong>Agotadas</strong>, o desmarca las que no vendas.
                            </p>
                        </div>

                        {/* Variant rows */}
                        <div className="space-y-3">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider block">
                                Presentaciones del Producto ({configuredVariants.filter(v => v.included).length})
                            </label>

                            {configuredVariants.map((v, idx) => (
                                <div 
                                    key={idx}
                                    className={`p-3.5 rounded-2xl border transition-all ${
                                        v.included 
                                            ? 'bg-white border-slate-200 shadow-sm' 
                                            : 'bg-slate-50/60 border-slate-100 opacity-60'
                                    }`}
                                >
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        {/* Checkbox & Presentation name */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <input
                                                type="checkbox"
                                                id={`variant-chk-${idx}`}
                                                checked={v.included}
                                                onChange={(e) => {
                                                    const updated = [...configuredVariants];
                                                    updated[idx].included = e.target.checked;
                                                    setConfiguredVariants(updated);
                                                }}
                                                className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                                            />
                                            <label 
                                                htmlFor={`variant-chk-${idx}`} 
                                                className="text-sm font-black text-slate-800 cursor-pointer truncate"
                                            >
                                                {v.name}
                                            </label>
                                        </div>

                                        {/* Availability & Price Controls */}
                                        {v.included && (
                                            <div className="flex items-center gap-2.5 pl-7 sm:pl-0">
                                                {/* Status Pill Toggle */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const updated = [...configuredVariants];
                                                        updated[idx].is_available = !updated[idx].is_available;
                                                        setConfiguredVariants(updated);
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 ${
                                                        v.is_available
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs'
                                                            : 'bg-red-50 text-red-600 border border-red-200'
                                                    }`}
                                                    title="Haz clic para alternar entre Disponible y Agotada"
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${v.is_available ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    {v.is_available ? 'Disponible' : 'Agotada'}
                                                </button>

                                                {/* Price input */}
                                                <div className="relative w-28">
                                                    <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        placeholder="0.00"
                                                        value={v.price === 0 ? '' : v.price}
                                                        onChange={(e) => {
                                                            const updated = [...configuredVariants];
                                                            updated[idx].price = parseFloat(e.target.value) || 0;
                                                            setConfiguredVariants(updated);
                                                        }}
                                                        className="w-full bg-slate-50 border border-slate-200 p-2 pl-7 rounded-xl outline-none focus:border-primary font-bold text-xs text-slate-800"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Action buttons */}
                        <div className="pt-4 border-t border-slate-100 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setSelectedProduct(null)}
                                className="px-5 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
                            >
                                Cambiar producto
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSelection}
                                disabled={configuredVariants.filter(v => v.included).length === 0}
                                className="flex-1 bg-primary text-slate-900 py-3 rounded-2xl font-black text-sm shadow-lg shadow-primary/20 flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                            >
                                <Check className="w-4 h-4" />
                                <span>Cargar en mi Menú</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Step 1: Catalog Browser */
                    <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, presentación o código de barras..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 p-3 pl-10 rounded-2xl outline-none focus:border-primary font-bold text-xs sm:text-sm text-slate-800"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Category Pills */}
                        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                            {COMMON_CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border shrink-0 ${
                                        selectedCategory === cat
                                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {/* Catalog Grid */}
                        {loading ? (
                            <div className="py-16 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    Cargando catálogo...
                                </p>
                            </div>
                        ) : filteredProducts.length === 0 ? (
                            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
                                <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                                <p className="text-slate-600 font-black text-sm">No se encontraron productos comunes</p>
                                <p className="text-slate-400 text-xs mt-1">
                                    Prueba con otro término o categoría.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {filteredProducts.map((p) => {
                                    const variantNames = (p.variants || []).map(v => v.name).join(', ');
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => handlePickProduct(p)}
                                            className="p-3.5 bg-white border border-slate-200 hover:border-primary/60 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer flex gap-3 items-center group text-left"
                                        >
                                            <div className="w-16 h-16 rounded-xl bg-slate-50 p-1 border border-slate-100 shrink-0 flex items-center justify-center overflow-hidden">
                                                <img
                                                    src={p.image_url}
                                                    alt={p.name}
                                                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                                                    loading="lazy"
                                                />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <span className="text-[9px] font-black uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                                    {p.category}
                                                </span>
                                                <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate mt-0.5 group-hover:text-amber-600 transition-colors">
                                                    {p.name}
                                                </h4>
                                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                    {variantNames ? `Presentaciones: ${variantNames}` : 'Estándar'}
                                                </p>
                                            </div>

                                            <div className="shrink-0 p-1.5 bg-slate-50 group-hover:bg-primary group-hover:text-slate-900 text-slate-400 rounded-xl transition-colors">
                                                <ChevronRight className="w-4 h-4" />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
