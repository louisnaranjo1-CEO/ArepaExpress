import React, { useState, useEffect } from 'react';
import { UtensilsCrossed, Plus, Search, Filter, Edit2, Trash2, Image as ImageIcon, Check, ChevronDown, X, Loader2, DollarSign, Tag, TrendingUp, Instagram, Youtube, Music2, LayoutGrid, List } from 'lucide-react';
import { db, storage } from '../../lib/firebase';
import { collection, query, getDocs, doc, deleteDoc, updateDoc, addDoc, getDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../../context/AuthContext';
import { GLOBAL_CATEGORIES, CATEGORY_SECTORS, DEVELOPER_WHATSAPP } from '../../lib/constants';

interface ProductVariant {
    name: string;
    price: number;
}

interface Product {
    id: string;
    name: string;
    description: string;
    price: number;
    category: string;
    subcategory?: string;
    image: string; // Keep for backward compatibility/thumbnail
    images: string[];
    socialMediaLink?: string;
    instagramLink?: string;
    tiktokLink?: string;
    youtubeLink?: string;
    isActive: boolean;
    isAvailable: boolean;
    investment?: number;
    promoPrice?: number;
    variants?: ProductVariant[];
    printerId?: string;
    consultPrice?: boolean;
    pointsPrice?: number;
}

export default function ProductManagement() {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('Todos');
    const [stations, setStations] = useState<{ id: string, name: string }[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [restaurantLogo, setRestaurantLogo] = useState<string>('');

    // Form states
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: GLOBAL_CATEGORIES[0],
        subcategory: '',
        isActive: true,
        isAvailable: true,
        investment: '',
        socialMediaLink: '',
        tiktokLink: '',
        youtubeLink: '',
        variants: [] as ProductVariant[],
        printerId: '',
        consultPrice: false,
        pointsPrice: ''
    });
    const [existingImages, setExistingImages] = useState<string[]>([]);
    const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);

    useEffect(() => {
        if (!user) return;
        fetchProducts();
        fetchStations();
        fetchRestaurantLogo();
    }, [user]);

    const fetchRestaurantLogo = async () => {
        try {
            const docRef = doc(db, 'restaurants', user!.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRestaurantLogo(data.logoUrl || data.image || '');
            }
        } catch (error) {
            console.error("Error fetching restaurant logo:", error);
        }
    };

    const fetchStations = async () => {
        try {
            const stationsRef = collection(db, 'restaurants', user!.uid, 'printers');
            const snapshot = await getDocs(stationsRef);
            const items = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
            setStations(items);
        } catch (error) {
            console.error("Error fetching stations:", error);
        }
    };

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
                price: (product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price).toString(),
                category: product.category,
                subcategory: product.subcategory || '',
                isActive: product.isActive,
                isAvailable: product.isAvailable ?? true,
                investment: product.investment?.toString() || '',
                socialMediaLink: product.socialMediaLink || '',
                tiktokLink: product.tiktokLink || '',
                youtubeLink: product.youtubeLink || '',
                variants: product.variants || [],
                printerId: product.printerId || '',
                consultPrice: product.consultPrice || false,
                pointsPrice: product.pointsPrice?.toString() || ''
            });
            setExistingImages(product.images || (product.image ? [product.image] : []));
            setNewImageFiles([]);
            setPreviewUrls([]);
        } else {
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                category: GLOBAL_CATEGORIES[0],
                subcategory: '',
                isActive: true,
                isAvailable: true,
                investment: '',
                socialMediaLink: '',
                tiktokLink: '',
                youtubeLink: '',
                variants: [],
                printerId: '',
                consultPrice: false,
                pointsPrice: ''
            });
            setExistingImages([]);
            setNewImageFiles([]);
            setPreviewUrls([]);
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSubmitting(true);

        try {
            // 1. Upload new images if any
            const uploadedUrls: string[] = [];
            for (const file of newImageFiles) {
                try {
                    console.log(`Uploading file: ${file.name}`);
                    const sanitizedName = file.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
                    const storageRef = ref(storage, `restaurants/${user.uid}/products/${Date.now()}_${sanitizedName}`);
                    const snapshot = await uploadBytes(storageRef, file);
                    const url = await getDownloadURL(snapshot.ref);
                    uploadedUrls.push(url);
                    console.log(`File uploaded: ${url}`);
                } catch (uploadError) {
                    console.error(`Error uploading ${file.name}:`, uploadError);
                    throw new Error(`Error al subir la imagen ${file.name}`);
                }
            }

            const allImages = [...existingImages, ...uploadedUrls];
            const newPriceInput = parseFloat(formData.price);
            const investment = formData.investment ? parseFloat(formData.investment) : 0;

            if (!formData.consultPrice && formData.variants.length === 0 && isNaN(newPriceInput)) {
                alert("Por favor, ingresa un precio válido");
                setSubmitting(false);
                return;
            }

            let finalPrice = isNaN(newPriceInput) ? 0 : newPriceInput;
            let finalPromoPrice = 0;

            if (formData.variants.length > 0 && finalPrice === 0) {
                 finalPrice = Math.min(...formData.variants.map((v: any) => v.price)) || 0;
            }

            if (editingProduct && !isNaN(newPriceInput)) {
                const oldBasePrice = editingProduct.price;
                if (newPriceInput < oldBasePrice && newPriceInput > 0) {
                    // It's a discount
                    finalPrice = oldBasePrice;
                    finalPromoPrice = newPriceInput;
                } else {
                    // It's a new normal price or higher
                    finalPrice = newPriceInput;
                    finalPromoPrice = 0;
                }
            } else if (!editingProduct && !isNaN(newPriceInput)) {
                // New product, price is base
                finalPrice = newPriceInput;
                finalPromoPrice = 0;
            }

            const pointsPriceValue = formData.pointsPrice ? parseFloat(formData.pointsPrice) : 0;

            const productData = {
                ...formData,
                price: formData.consultPrice ? 0 : finalPrice,
                investment,
                promoPrice: formData.consultPrice ? 0 : finalPromoPrice,
                pointsPrice: pointsPriceValue,
                images: allImages.length > 0 ? allImages : (restaurantLogo ? [restaurantLogo] : []),
                image: allImages[0] || restaurantLogo || '', // Principal image
                updatedAt: new Date()
            };

            console.log("Saving product data:", productData);

            if (editingProduct) {
                const productRef = doc(db, 'restaurants', user.uid, 'products', editingProduct.id);
                await updateDoc(productRef, productData);

                // Notification for price drop
                if (productData.promoPrice && productData.promoPrice > 0 &&
                    (!editingProduct.promoPrice || productData.promoPrice < editingProduct.promoPrice)) {
                    notifyFollowers(
                        "¡Bajó de precio!",
                        `El producto "${productData.name}" ahora está en oferta por solo $${productData.promoPrice.toFixed(2)}.`
                    );
                }
            } else {
                const productsRef = collection(db, 'restaurants', user.uid, 'products');
                await addDoc(productsRef, {
                    ...productData,
                    createdAt: new Date()
                });

                // Notification for new product
                notifyFollowers(
                    "¡Nuevo en el menú!",
                    `Hemos añadido "${productData.name}" a nuestra lista de productos. ¡Ven a probarlo!`
                );
            }

            console.log("Product saved successfully");
            setIsModalOpen(false);
            setEditingProduct(null);
            setFormData({
                name: '',
                description: '',
                price: '',
                category: GLOBAL_CATEGORIES[0],
                subcategory: '',
                investment: '',
                isActive: true,
                isAvailable: true,
                socialMediaLink: '',
                tiktokLink: '',
                youtubeLink: '',
                variants: [],
                printerId: '',
                consultPrice: false,
                pointsPrice: ''
            });
            setNewImageFiles([]);
            setExistingImages([]);
            setPreviewUrls([]);
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

    const toggleAvailability = async (product: Product) => {
        if (!user) return;
        try {
            const productRef = doc(db, 'restaurants', user.uid, 'products', product.id);
            await updateDoc(productRef, { isAvailable: !product.isAvailable });
            fetchProducts();
        } catch (error) {
            console.error("Error toggling availability:", error);
        }
    };

    const addVariant = () => {
        setFormData(prev => ({
            ...prev,
            variants: [...prev.variants, { name: '', price: 0 }]
        }));
    };

    const removeVariant = (index: number) => {
        setFormData(prev => ({
            ...prev,
            variants: prev.variants.filter((_, i) => i !== index)
        }));
    };

    const updateVariant = (index: number, field: keyof ProductVariant, value: string | number) => {
        const newVariants = [...formData.variants];
        newVariants[index] = {
            ...newVariants[index],
            [field]: value
        };
        setFormData(prev => ({
            ...prev,
            variants: newVariants
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []) as File[];
        const totalAllowed = 6 - (existingImages.length + newImageFiles.length);

        if (files.length > totalAllowed) {
            alert(`Solo puedes añadir ${totalAllowed} imágenes más.`);
            return;
        }

        const newFiles = files.slice(0, totalAllowed);
        setNewImageFiles(prev => [...prev, ...newFiles]);

        const newPreviewUrls = newFiles.map(file => URL.createObjectURL(file));
        setPreviewUrls(prev => [...prev, ...newPreviewUrls]);
    };

    const removeExistingImage = (index: number) => {
        setExistingImages(prev => prev.filter((_, i) => i !== index));
    };

    const removeNewImage = (index: number) => {
        if (previewUrls[index]) {
            URL.revokeObjectURL(previewUrls[index]);
        }
        setPreviewUrls(prev => prev.filter((_, i) => i !== index));
        setNewImageFiles(prev => prev.filter((_, i) => i !== index));
    };

    const notifyFollowers = async (title: string, body: string) => {
        if (!user) return;
        try {
            // Fetch restaurant name
            const resSnap = await getDoc(doc(db, 'restaurants', user.uid));
            const restaurantName = resSnap.data()?.name || 'Un restaurante que sigues';

            const followersRef = collection(db, 'restaurants', user.uid, 'followers');
            const followersSnap = await getDocs(followersRef);

            if (followersSnap.empty) return;

            const batch = writeBatch(db);
            followersSnap.docs.forEach(followerDoc => {
                const userId = followerDoc.id;
                const notifRef = doc(collection(db, 'notifications'));
                batch.set(notifRef, {
                    userId,
                    restaurantId: user.uid,
                    restaurantName,
                    title,
                    body,
                    read: false,
                    createdAt: new Date()
                });
            });
            await batch.commit();
        } catch (e) {
            console.error("Error notifying followers:", e);
        }
    };

    const activeCategories = ['Todos', ...GLOBAL_CATEGORIES.filter(cat => products.some(p => p.category === cat))];

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
                <div className="relative flex-1 shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar en el menú..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 p-4 pl-12 rounded-2xl outline-none focus:border-primary transition-all font-bold text-slate-700 shadow-sm"
                    />
                </div>

                <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-slate-200 shrink-0 w-max self-start md:self-auto order-first md:order-none">
                     <button
                        onClick={() => setViewMode('grid')}
                        className={`px-4 py-3 rounded-xl transition-all focus:outline-none flex items-center gap-2 ${viewMode === 'grid' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                        title="Cuadrícula Grande"
                     >
                        <LayoutGrid className="w-5 h-5" />
                     </button>
                     <button
                        onClick={() => setViewMode('list')}
                        className={`px-4 py-3 rounded-xl transition-all focus:outline-none flex items-center gap-2 ${viewMode === 'list' ? 'bg-primary text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                        title="Lista Compacta"
                     >
                        <List className="w-5 h-5" />
                     </button>
                </div>

                {/* Categories Tabs */}
                <div className="flex overflow-x-auto gap-2 pb-2 md:pb-0 scrollbar-hide w-full max-w-full">
                    {activeCategories.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-5 py-3 md:px-6 md:py-4 rounded-2xl font-bold whitespace-nowrap transition-all border ${activeCategory === cat
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
            ) : viewMode === 'list' ? (
                <div className="flex flex-col gap-3">
                    {filteredProducts.map((p) => (
                        <div key={p.id} className="bg-white rounded-[24px] overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-all duration-300 flex flex-row group">
                           <div className="w-24 md:w-40 h-auto self-stretch bg-slate-100 relative shrink-0">
                                {p.image ? (
                                    <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-[1.05] transition-transform duration-500" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                        <ImageIcon className="w-6 h-6 md:w-10 md:h-10 opacity-50" />
                                    </div>
                                )}
                                {!p.isActive && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
                                        <span className="bg-white text-slate-900 px-1.5 py-0.5 rounded font-black text-[8px] uppercase tracking-widest">Inactivo</span>
                                    </div>
                                )}
                           </div>

                           <div className="p-3 md:p-5 flex-1 flex flex-col justify-between min-w-0">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                        <h3 className="text-sm md:text-lg font-black text-slate-900 truncate leading-tight">{p.name}</h3>
                                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                            <span className="bg-slate-50 text-slate-500 text-[9px] md:text-[10px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border border-slate-100">{p.category}</span>
                                            {p.consultPrice ? (
                                                <span className="bg-orange-50 text-orange-500 text-[10px] md:text-xs font-black px-2 py-0.5 rounded border border-orange-100">Cotización</span>
                                            ) : (
                                                <span className="bg-emerald-50 text-emerald-600 text-[11px] md:text-sm font-black px-2 py-0.5 rounded border border-emerald-100">
                                                   {p.variants && p.variants.length > 0 ? `Desde $${Math.min(...p.variants.map(v => v.price)).toFixed(2)}` : `$${p.price.toFixed(2)}`}
                                                </span>
                                            )}
                                            {p.pointsPrice && p.pointsPrice > 0 && (
                                                <span className="bg-amber-50 text-amber-600 text-[11px] md:text-sm font-black px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                                                    <Tag className="w-3 h-3" /> {p.pointsPrice} pts
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button onClick={() => handleOpenModal(p)} className="p-2 md:p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors">
                                            <Edit2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                                        </button>
                                        <button onClick={() => handleDelete(p.id)} className="p-2 md:p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5 md:w-5 md:h-5" />
                                        </button>
                                    </div>
                                </div>
                                
                                <p className="text-xs text-slate-400 truncate mt-1 hidden md:block w-[80%]">{p.description}</p>
                                
                                <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => toggleAvailability(p)}
                                            className={`p-1 md:p-1.5 rounded-lg border transition-all flex items-center gap-1 ${p.isAvailable ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}
                                            title={p.isAvailable ? 'Disponible' : 'No disponible'}
                                        >
                                            <Check className={`w-3 h-3 md:w-4 md:h-4 ${p.isAvailable ? 'opacity-100' : 'opacity-40'}`} />
                                            <span className="text-[10px] font-bold md:inline-block hidden">{p.isAvailable ? 'Dispon.' : 'Paused'}</span>
                                        </button>
                                        
                                        {!p.consultPrice && p.promoPrice && p.promoPrice > 0 && (
                                            <div className="text-[10px] font-black text-orange-500 bg-orange-50 px-2 flex items-center py-1 rounded-md">
                                                 OFERTA -{Math.round((1 - p.promoPrice / p.price) * 100)}%
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center bg-green-50/50 px-2 py-1 rounded-xl border border-green-100 ml-auto md:ml-0">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1 md:mr-2">Utilidad</p>
                                        <p className="text-xs md:text-sm font-black text-green-600">
                                            {p.consultPrice ? '--' : `+$${((p.promoPrice && p.promoPrice > 0 ? p.promoPrice : p.price) - (p.investment || 0)).toFixed(2)}`}
                                        </p>
                                    </div>
                                </div>
                           </div>
                        </div>
                    ))}
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
                                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-sm font-black text-primary shadow-sm flex items-center gap-2">
                                    {p.pointsPrice && p.pointsPrice > 0 ? (
                                        <span className="text-amber-500 font-bold flex items-center gap-1 border-r border-slate-200 pr-2">
                                            <Tag className="w-3 h-3" /> {p.pointsPrice} pts
                                        </span>
                                    ) : null}
                                    <span>
                                        {p.consultPrice ? (
                                            "Cotización"
                                        ) : p.variants && p.variants.length > 0 ? (
                                            `Desde $${Math.min(...p.variants.map(v => v.price)).toFixed(2)}`
                                        ) : (
                                            `$${p.price.toFixed(2)}`
                                        )}
                                    </span>
                                </div>
                                {!p.isActive && (
                                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
                                        <span className="bg-white text-slate-900 px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl">Agotado / Inactivo</span>
                                    </div>
                                )}
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex flex-wrap gap-1">
                                            <span className="bg-slate-50 text-slate-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider">{p.category}</span>
                                            {p.subcategory && (
                                                <span className="bg-primary/5 text-primary text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider border border-primary/10">{p.subcategory}</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleAvailability(p)}
                                            className={`p-1.5 rounded-lg transition-all ${p.isAvailable ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                            title={p.isAvailable ? 'Disponible' : 'No disponible'}
                                        >
                                            <Check className={`w-3.5 h-3.5 ${p.isAvailable ? 'opacity-100' : 'opacity-40'}`} />
                                        </button>
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900 line-clamp-1">{p.name}</h3>
                                    <p className="text-sm text-slate-400 line-clamp-2 mt-1">{p.description}</p>
                                    {p.variants && p.variants.length > 0 && !p.consultPrice && (
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <span className="bg-blue-50 text-blue-500 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                {p.variants.length} Presentaciones
                                            </span>
                                        </div>
                                    )}
                                    {p.consultPrice && (
                                        <div className="mt-2 flex items-center gap-1.5">
                                            <span className="bg-orange-50 text-orange-500 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                                                Precio a consultar
                                            </span>
                                        </div>
                                    )}
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
                                    <div className="text-right">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Utilidad</p>
                                        <p className="text-sm font-black text-green-500">
                                            {p.consultPrice ? '--' : `+$${((p.promoPrice && p.promoPrice > 0 ? p.promoPrice : p.price) - (p.investment || 0)).toFixed(2)}`}
                                        </p>
                                        {p.promoPrice && p.promoPrice > 0 && !p.consultPrice && (
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <p className="text-[10px] font-black text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-md">
                                                    -{Math.round((1 - p.promoPrice / p.price) * 100)}%
                                                </p>
                                                <p className="text-[9px] font-bold text-slate-400 line-through">${p.price.toFixed(2)}</p>
                                            </div>
                                        )}
                                    </div>
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

                            <div className="bg-orange-50 p-4 rounded-3xl border-2 border-orange-100 space-y-3">
                                <div
                                    onClick={() => setFormData({ ...formData, consultPrice: !formData.consultPrice })}
                                    className="flex items-center justify-between cursor-pointer"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-xl ${formData.consultPrice ? 'bg-primary text-white' : 'bg-white text-slate-400 border border-slate-100'}`}>
                                            <Tag className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-700">Consultar precio</p>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase">¿El precio no es fijo o es variable?</p>
                                        </div>
                                    </div>
                                    <div className={`w-12 h-6 rounded-full relative transition-colors ${formData.consultPrice ? 'bg-primary' : 'bg-slate-200'}`}>
                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${formData.consultPrice ? 'left-7' : 'left-1'}`}></div>
                                    </div>
                                </div>
                                {formData.consultPrice && (
                                    <p className="text-[10px] text-orange-600 font-bold italic text-center animate-in fade-in slide-in-from-top-1">
                                        Se mostrará "Consultar precio al realizar pedido" en lugar de un precio numérico.
                                    </p>
                                )}
                            </div>

                            {!formData.consultPrice && (
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="space-y-1 md:col-span-2">
                                        <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                            <DollarSign className="w-3 h-3" /> Precio Venta
                                        </label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required={formData.variants.length === 0}
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                            placeholder={formData.variants.length > 0 ? "Opcional si usas variantes" : "Si bajas el precio actual, se creará una oferta autom."}
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
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                            <Tag className="w-3 h-3" /> Precio (Puntos)
                                        </label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={formData.pointsPrice}
                                            onChange={(e) => setFormData({ ...formData, pointsPrice: e.target.value })}
                                            className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                            placeholder="Opc. Ej: 500"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Variantes de Precio */}
                            {!formData.consultPrice && (
                                <div className="space-y-3 p-4 bg-slate-50 rounded-3xl border-2 border-slate-100 animate-in fade-in duration-300">
                                    <div className="flex items-center justify-between px-2">
                                        <label className="text-xs font-black text-slate-500 uppercase flex items-center gap-2">
                                            <Tag className="w-3.5 h-3.5" /> Variantes (Tamaños, presentaciones...)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={addVariant}
                                            className="text-[10px] font-black uppercase text-primary hover:scale-105 transition-transform flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> Añadir variante
                                        </button>
                                    </div>

                                    {formData.variants.length > 0 ? (
                                        <div className="space-y-2">
                                            {formData.variants.map((variant, index) => (
                                                <div key={index} className="flex gap-2 items-center animate-in slide-in-from-left-2 duration-300">
                                                    <input
                                                        type="text"
                                                        placeholder="Ej: Mediana"
                                                        required
                                                        value={variant.name}
                                                        onChange={(e) => updateVariant(index, 'name', e.target.value)}
                                                        className="flex-1 bg-white border border-slate-200 p-2.5 rounded-xl outline-none font-bold text-sm text-slate-700"
                                                    />
                                                    <div className="relative w-24">
                                                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            required
                                                            placeholder="0.00"
                                                            value={variant.price || ''}
                                                            onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                                                            className="w-full bg-white border border-slate-200 p-2.5 pl-6 rounded-xl outline-none font-bold text-sm text-slate-700"
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeVariant(index)}
                                                        className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 text-center py-2 font-medium italic">
                                            Opcional: puedes añadir diferentes tamaños o presentaciones.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <ImageIcon className="w-3 h-3" /> Imágenes ({existingImages.length + newImageFiles.length}/6)
                                </label>

                                <div className="grid grid-cols-3 gap-3">
                                    {existingImages.map((url, i) => (
                                        <div key={`existing-${i}`} className="relative group aspect-square rounded-2xl overflow-hidden bg-slate-100">
                                            <img src={url} className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeExistingImage(i)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {previewUrls.map((url, i) => (
                                        <div key={`new-${i}`} className="relative group aspect-square rounded-2xl overflow-hidden bg-slate-100 border-2 border-primary/20">
                                            <img src={url} className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeNewImage(i)}
                                                className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                    {(existingImages.length + newImageFiles.length) < 6 && (
                                        <label className="aspect-square rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 hover:border-primary/30 transition-all text-slate-400 hover:text-primary">
                                            <Plus className="w-6 h-6 mb-1" />
                                            <span className="text-[10px] font-black uppercase">Subir</span>
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleFileChange}
                                            />
                                        </label>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <Instagram className="w-3 h-3" /> Link Instagram
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://instagram.com/reels/..."
                                    value={formData.socialMediaLink}
                                    onChange={(e) => setFormData({ ...formData, socialMediaLink: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <Music2 className="w-3 h-3" /> Link TikTok
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://tiktok.com/@user/video/..."
                                    value={formData.tiktokLink}
                                    onChange={(e) => setFormData({ ...formData, tiktokLink: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase ml-2 flex items-center gap-1">
                                    <Youtube className="w-3 h-3" /> Link YouTube (Shorts)
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://youtube.com/shorts/..."
                                    value={formData.youtubeLink}
                                    onChange={(e) => setFormData({ ...formData, youtubeLink: e.target.value })}
                                    className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2 flex justify-between items-center">
                                        <span>Categoría</span>
                                        <a
                                            href={`https://wa.me/${DEVELOPER_WHATSAPP}?text=Hola, me gustaría solicitar una nueva categoría para mi menú: `}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[9px] text-primary hover:underline lowercase"
                                        >
                                            ¿Falta una?
                                        </a>
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => {
                                            const newCat = e.target.value;
                                            setFormData({
                                                ...formData,
                                                category: newCat,
                                                subcategory: CATEGORY_SECTORS[newCat]?.[0] || ''
                                            });
                                        }}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                    >
                                        {GLOBAL_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Sub-categoría</label>
                                    <select
                                        value={formData.subcategory}
                                        onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                                        className="w-full bg-slate-50 border-2 border-transparent focus:border-primary p-3 rounded-2xl outline-none font-bold text-slate-700"
                                    >
                                        <option value="">Seleccionar...</option>
                                        {formData.category && CATEGORY_SECTORS[formData.category]?.map(sec => (
                                            <option key={sec} value={sec}>{sec}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase ml-2">Disponible</label>
                                    <div
                                        onClick={() => setFormData({ ...formData, isAvailable: !formData.isAvailable })}
                                        className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl cursor-pointer"
                                    >
                                        <span className="font-bold text-sm text-slate-600">{formData.isAvailable ? 'Disponible' : 'Agotado'}</span>
                                        <div className={`w-10 h-5 rounded-full relative transition-colors ${formData.isAvailable ? 'bg-green-500' : 'bg-slate-300'}`}>
                                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm transition-all ${formData.isAvailable ? 'left-6' : 'left-1'}`}></div>
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
