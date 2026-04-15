import { ArrowLeft, Search, Heart, Star, Clock, Plus, AlertCircle, MessageSquare, MapPin, ChevronRight, Phone, Instagram, UserPlus, UserCheck, Store, Truck, CheckCircle, User as UserIcon, Briefcase, X, Tag, Share2, Zap, Youtube, Music2, ExternalLink, Gift, Sparkles, ShoppingCart } from 'lucide-react';
import { motion, AnimatePresence } from 'motion';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc, increment, query, where, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant, Product } from '../lib/seed';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { recommendationsService } from '../lib/recommendations';
import toast from 'react-hot-toast';
import { DEMO_RESTAURANTS } from '../lib/demoData';
import { isDemoMode, UN2X3_LOGO } from '../lib/env';
import DemoAlertModal from '../components/DemoAlertModal';
import DualPrice from '../components/DualPrice';

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [restaurant, setRestaurant] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [activeTab, setActiveTab] = useState<'Menú' | 'Reseñas'>('Menú');
  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<{[key: string]: any[]}>({});
  const [showDemoAlert, setShowDemoAlert] = useState(false);
  const [showClearCartModal, setShowClearCartModal] = useState(false);
  const [pendingCartItem, setPendingCartItem] = useState<{product: Product, variant?: any, modifiers?: any} | null>(null);
  const getSocialIcon = (url: string) => {
    if (url.includes('instagram.com')) return <Instagram className="w-4 h-4" />;
    if (url.includes('tiktok.com')) return <Music2 className="w-4 h-4" />;
    if (url.includes('youtube.com') || url.includes('youtu.be')) return <Youtube className="w-4 h-4" />;
    return <ExternalLink className="w-4 h-4" />;
  };

  const getSocialColor = (url: string) => {
    if (url.includes('instagram.com')) return 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600';
    if (url.includes('tiktok.com')) return 'bg-black';
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'bg-red-600';
    return 'bg-primary';
  };
  const [showJobsModal, setShowJobsModal] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [casheaIcon, setCasheaIcon] = useState<string | null>(null);
  const { user } = useAuth();

  const handleShare = () => {
    const referralCode = localStorage.getItem('referralCode') || user?.uid?.slice(0, 6).toUpperCase() || 'INVITE';
    const shareUrl = `${window.location.origin}/restaurant/${id}?ref=${referralCode}`;

    if (navigator.share) {
      navigator.share({
        title: `Mira este sitio en Deliexpress`,
        text: `Te recomiendo ${restaurant?.name}. Regístrate con mi código y participa en sorteos.`,
        url: shareUrl,
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success("¡Enlace copiado! Compártelo con tus amigos.");
    }
  };

  const isWaiter = localStorage.getItem('isWaiter') === 'true';
  const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');

  const { items, addItem, totalItems, totalPrice, clearCart } = useCart();

  useEffect(() => {
    const fetchRestaurantAndMenu = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        // Check for Demo Restaurant
        const demoRes = DEMO_RESTAURANTS.find(r => r.id === id);
        if (demoRes) {
          setRestaurant(demoRes);
          setFollowerCount(demoRes.followerCount || 0);
          setProducts(demoRes.products || []);
          setLoading(false);
          return;
        }

        // Fetch restaurant details
        const docRef = doc(db, 'restaurants', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.isActive === false) {
            setError("Este restaurante no se encuentra disponible actualmente.");
            setLoading(false);
            return;
          }
          setRestaurant({ id: docSnap.id, ...data });
          setFollowerCount(data.followerCount || 0);

          // Check if it's in user following
          if (user) {
            try {
              const followRef = doc(db, 'restaurants', id, 'followers', user.uid);
              const followSnap = await getDoc(followRef);
              setIsFollowing(followSnap.exists());
            } catch (followErr) {
              console.warn("Could not check follow status:", followErr);
            }
          }

          // Fetch products subcollection
          const productsRef = collection(db, 'restaurants', id, 'products');
          const productsSnap = await getDocs(productsRef);
          const fetchedProducts = productsSnap.docs.map(p => ({ id: p.id, ...p.data() })) as Product[];
          setProducts(fetchedProducts);

          // Check if it's in user favorites
          if (user) {
            try {
              const userRef = doc(db, 'users', user.uid);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const favs = userSnap.data().favorites || [];
                setIsFavorite(favs.includes(id));
              }
            } catch (favErr) {
              console.warn("Could not check favorites status:", favErr);
            }
          }
        } else {
          setError("Restaurante no encontrado.");
        }
      } catch (err) {
        console.error("Error fetching restaurant:", err);
        setError("Error al cargar el restaurante.");
      } finally {
        setLoading(false);
      }
    };

    const fetchIcons = async () => {
      try {
        const iconsSnap = await getDocs(collection(db, 'global_icons'));
        const icons = iconsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
        const cashea = icons.find(icon => icon.name?.toLowerCase() === 'cashea');

        if (cashea) {
          setCasheaIcon(cashea.imageUrl || cashea.url);
        } else {
          // Fallback to official Cashea icon if not found in global_icons
          setCasheaIcon("https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1");
        }
      } catch (err) {
        console.error("Error fetching icons:", err);
      }
    };

    fetchRestaurantAndMenu();
    fetchIcons();
  }, [id]);

  useEffect(() => {
    const fetchReviews = async () => {
      if (!id || activeTab !== 'Reseñas' || reviews.length > 0) return;
      setLoadingReviews(true);
      try {
        const reviewsRef = collection(db, 'restaurants', id, 'reviews');
        const q = query(reviewsRef, where('isHidden', '==', false), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setReviews(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Error fetching reviews:", err);
      } finally {
        setLoadingReviews(false);
      }
    };
    fetchReviews();
  }, [id, activeTab]);

  if (loading) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center space-y-4 bg-slate-50">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 font-medium">Cargando restaurante...</p>
      </div>
    );
  }

  if (error || !restaurant) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center space-y-4 px-6 text-center bg-slate-50">
        <AlertCircle className="w-16 h-16 text-red-400" />
        <h2 className="text-xl font-bold text-slate-900">¡Ups!</h2>
        <p className="text-slate-500">{error || "No pudimos encontrar este restaurante."}</p>
        <Link to="/" className="mt-4 px-6 py-3 bg-primary text-slate-900 font-bold rounded-xl shadow-lg">Volver al inicio</Link>
      </div>
    );
  }

  // Extract unique product categories for tabs
  const categories = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

  // Filter products by active category and availability
  const filteredProducts = products.filter(p => {
    const matchesCategory = activeCategory === 'Todos' || p.category === activeCategory;
    const isAvailable = p.isAvailable !== false; // Default to true if undefined
    return matchesCategory && isAvailable;
  });

  const handleAddToCart = (product: Product, variant?: any, modifiers?: any) => {
    // Check if cart has items from another restaurant
    if (items.length > 0 && items[0].restaurantId !== restaurant.id) {
      setPendingCartItem({ product, variant, modifiers });
      setShowClearCartModal(true);
      return;
    }

    processAddToCart(product, variant, modifiers);
  };

  const getBusinessLabel = () => {
    switch (restaurant?.businessType) {
      case 'hotel': return 'hotel';
      case 'store':
      case 'tienda': return 'tienda';
      default: return 'restaurante';
    }
  };

  const confirmClearCart = () => {
    navigate('/cart');
    setShowClearCartModal(false);
  };

  const processAddToCart = (product: Product, variant?: any, modifiers?: any) => {
    let finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : (product.price || 0);
    let finalName = product.name;

    if (variant) {
      finalPrice = variant.price;
      finalName = `${product.name} - ${variant.name}`;
    }

    let modifierIdString = '';
    
    if (modifiers) {
        Object.keys(modifiers).forEach(modName => {
            modifiers[modName].forEach((o: any) => {
                if (o.price) finalPrice += o.price;
                modifierIdString += `-${o.id || o.name.substring(0,3)}`;
            });
        });
    }

    addItem({
      id: `${product.id}${variant ? `-${variant.name}` : ''}${modifierIdString}`,
      productId: product.id!,
      restaurantId: restaurant.id!,
      name: finalName,
      price: finalPrice,
      pointsPrice: product.pointsPrice,
      quantity: 1,
      image: product.image,
      category: product.category,
      printerId: (product as any).printerId,
      consultPrice: product.consultPrice,
      modifiersConfig: modifiers
    });
    toast.success('Añadido al carrito');
  };

  const handleModifierToggle = (modifier: any, option: any) => {
    setSelectedModifiers(prev => {
      const current = prev[modifier.name] || [];
      const optionIndex = current.findIndex(o => o.id === option.id);
      
      let nextOptions = [...current];
      
      if (optionIndex !== -1) {
        nextOptions.splice(optionIndex, 1);
      } else {
        if (modifier.maxSelections && current.length >= modifier.maxSelections) {
          toast.error(`Solo puedes seleccionar hasta ${modifier.maxSelections} opciones.`);
          return prev;
        }
        nextOptions.push(option);
      }
      
      return { ...prev, [modifier.name]: nextOptions };
    });
  };

  const handleModifierText = (modifier: any, text: string) => {
      setSelectedModifiers(prev => ({
          ...prev,
          [modifier.name]: [{ id: 'text', name: text, price: 0 }]
      }));
  }

  const isFormValid = () => {
    if (!selectedProduct) return false;
    if (selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedVariant) return false;
    
    if (selectedProduct.modifiers) {
        for (const mod of selectedProduct.modifiers) {
            if (mod.required && (!selectedModifiers[mod.name] || selectedModifiers[mod.name].length === 0)) {
                return false;
            }
        }
    }
    return true;
  };

  const toggleFavorite = async () => {
    if (!user) {
      alert("Inicia sesión para guardar tus restaurantes favoritos.");
      return;
    }
    try {
      const userRef = doc(db, 'users', user.uid);
      if (isFavorite) {
        setIsFavorite(false); // Optimistic DB update
        await updateDoc(userRef, { favorites: arrayRemove(id) });
      } else {
        setIsFavorite(true);
        await updateDoc(userRef, { favorites: arrayUnion(id) });
      }
    } catch (e) {
      console.error("Error toggling favorite:", e);
      // Revert on error
      setIsFavorite(!isFavorite);
    }
  };

  const toggleFollow = async () => {
    if (!user) {
      alert("Inicia sesión para seguir a tus locales favoritos.");
      return;
    }
    if (!id) return;

    try {
      const resRef = doc(db, 'restaurants', id);
      const followerRef = doc(db, 'restaurants', id, 'followers', user.uid);

      if (isFollowing) {
        setIsFollowing(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
        await deleteDoc(followerRef);
        await updateDoc(resRef, { followerCount: increment(-1) });
      } else {
        setIsFollowing(true);
        setFollowerCount(prev => prev + 1);
        await setDoc(followerRef, {
          uid: user.uid,
          displayName: user.displayName || 'Usuario',
          photoURL: user.photoURL || '',
          followedAt: new Date()
        });
        await updateDoc(resRef, { followerCount: increment(1) });
      }
    } catch (e) {
      console.error("Error toggling follow:", e);
      setIsFollowing(!isFollowing);
      setFollowerCount(prev => isFollowing ? prev + 1 : prev - 1);
    }
  };

  const openWhatsApp = () => {
    if (isDemoMode()) {
        setShowDemoAlert(true);
        return;
    }
    if (restaurant.whatsapp) {
      const number = restaurant.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${number}?text=Hola, vengo de Deli Express y me gustaría hacer un pedido.`, '_blank');
    }
  };

  const getRestaurantStatus = () => {
    if (!restaurant || !restaurant.workingHours || restaurant.workingHours.length === 0) return { isOpen: true, text: 'Abierto' };

    const now = new Date();
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const currentDay = days[now.getDay()];
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${hours}:${minutes}`;

    const todaySchedule = restaurant.workingHours.find((day: any) => day.day === currentDay);

    if (!todaySchedule || todaySchedule.closed) return { isOpen: false, text: 'Cerrado' };

    const isOpen = currentTimeStr >= todaySchedule.open && currentTimeStr <= todaySchedule.close;
    return { isOpen, text: isOpen ? 'Abierto' : 'Cerrado', todaySchedule };
  };

  const statusObj = getRestaurantStatus();

  return (
    <div className="relative w-full min-h-screen bg-white group/design-root overflow-x-hidden flex flex-col">
      {isWaiter && (
        <div className="bg-amber-500 text-white text-center py-1.5 text-[10px] font-black uppercase tracking-[0.2em] shadow-sm z-50 relative flex justify-center items-center gap-2">
          <UserCheck className="w-3.5 h-3.5" />
          MESERO: {waiterData.name || 'Personal'}
        </div>
      )}
      {/* Hero Image & Navigation */}
      <div className="relative w-full h-64 md:h-80 shrink-0 bg-slate-100">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.7) 100%)${restaurant.coverUrl || restaurant.image ? `, url("${restaurant.coverUrl || restaurant.image}")` : ''}`
          }}
        >
          {!(restaurant.coverUrl || restaurant.image) && (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
              <Store className="w-16 h-16 mb-2" />
            </div>
          )}
        </div>

        {/* Nav Icons */}
        <div className="absolute top-0 left-0 w-full p-4 pt-12 flex justify-between items-center z-10">
          <button onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = '/'} className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors cursor-pointer border-none outline-none">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex gap-3">
            <button
              onClick={handleShare}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors"
              title="Compartir Restaurante"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={toggleFavorite}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors"
            >
              <Heart
                className={`w-6 h-6 transition-all ${isFavorite ? 'text-red-500 fill-red-500' : 'text-white'}`}
              />
            </button>
          </div>
        </div>

        {/* Restaurant Branding Overlay - Redesigned to be more modern */}
        <div className="absolute -bottom-6 left-0 w-full px-5 flex items-end gap-4 z-30">
          <div className="relative shrink-0">
            <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full p-1.5 shadow-xl border-4 border-white overflow-hidden animate-in zoom-in-95 duration-500 flex items-center justify-center">
              {restaurant.logoUrl ? (
                <img src={restaurant.logoUrl} alt={restaurant.name} className="w-full h-full object-contain rounded-full" />
              ) : (
                <Store className="w-10 h-10 text-slate-300" />
              )}
            </div>
            {restaurant.rating && (
              <div className="absolute -bottom-1 -right-1 bg-white px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-slate-100">
                <Star className="w-3 h-3 text-slate-900 fill-primary" />
                <span className="text-[10px] font-black text-slate-700">{restaurant.rating}</span>
              </div>
            )}
            {restaurant.hasCashea && (
              <div className="absolute -top-1 -right-1 w-8 h-8 bg-white/95 backdrop-blur rounded-xl p-1 shadow-lg border border-white/50 flex items-center justify-center animate-in zoom-in duration-500">
                <img
                  src={casheaIcon || "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1"}
                  alt="Cashea"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </div>
          <div className="pb-8 flex-1">
            <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] leading-tight">{restaurant.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-black text-white/80 uppercase tracking-widest">{followerCount} seguidores</span>
            </div>
          </div>
        </div>
      </div>

      {/* Spacing for the overlapping logo */}
      <div className="h-6 shrink-0"></div>

      {/* Restaurant Info */}
      <div className="px-5 py-4 bg-white -mt-4 rounded-t-3xl relative z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-900 text-sm font-bold">
              <Star className="w-5 h-5 fill-primary" />
              <span>{restaurant.rating || "Nuevo"}</span>
              <span className="text-slate-500 font-normal">({restaurant.reviews || 0}+ reseñas)</span>
            </div>

            <button
              onClick={() => setShowHoursModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 ${statusObj.isOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
            >
              <div className={`w-2 h-2 rounded-full ${statusObj.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              {statusObj.text}
            </button>

            <div className="flex items-center gap-1 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>{restaurant.deliveryTime || restaurant.avgPrepTime + ' min' || "30-45 min"}</span>
            </div>
          </div>

          {/* Free Delivery Badge */}
          {restaurant.businessType !== 'hotel' && restaurant.deliveryRates?.find((r: any) => r.price === 0) && (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-3 rounded-2xl border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-left-4 duration-1000">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Truck className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 opacity-70">Logística de Entrega</p>
                <h4 className="font-black text-sm flex items-center gap-1.5">
                  Envío GRATIS <span className="text-emerald-500/50">•</span> hasta {restaurant.deliveryRates.find((r: any) => r.price === 0).maxKm} km
                </h4>
              </div>
              <CheckCircle className="w-5 h-5 opacity-40 shrink-0" />
            </div>
          )}

          {/* Cashea Active Service Insignia */}
          {restaurant.hasCashea && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-gradient-to-br from-yellow-50 to-white text-yellow-700 px-5 py-4 rounded-[2rem] border-2 border-yellow-100 shadow-xl shadow-yellow-100/30 group transition-all hover:border-yellow-300 w-full mt-4 mb-2 overflow-hidden relative"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-yellow-400/5 rounded-full -mr-8 -mt-8 blur-2xl" />
              <div className="w-12 h-12 rounded-[1.25rem] bg-yellow-400 flex items-center justify-center shrink-0 shadow-lg shadow-yellow-400/30 group-hover:scale-110 transition-transform">
                <img src={casheaIcon || "https://firebasestorage.googleapis.com/v0/b/arepa-express-ve-2026.firebasestorage.app/o/logo%20cashea.png?alt=media&token=5b266100-3323-41bb-a5a4-23957ce678a1"} className="w-7 h-7 object-contain" alt="Cashea" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] leading-none mb-1 text-amber-700">Servicio Activo</p>
                  <span className="flex items-center gap-1 bg-yellow-400 text-[8px] font-black text-white px-2 py-0.5 rounded-full uppercase tracking-widest leading-none mb-1 shadow-sm">
                    Oficial
                  </span>
                </div>
                <h4 className="font-black text-slate-800 flex items-center gap-1.5 text-base leading-none">
                  Compra con Cashea <Zap className="w-4 h-4 text-slate-900 fill-primary" />
                </h4>
                <p className="text-[11px] text-slate-500 font-bold mt-1 leading-none">Paga en cuotas sin interés</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-yellow-50 flex items-center justify-center text-amber-700 opacity-50 group-hover:opacity-100 group-hover:bg-yellow-400 group-hover:text-white transition-all">
                <ChevronRight className="w-5 h-5" />
              </div>
            </motion.div>
          )}

          {/* Job Opportunities Badge */}
          {restaurant.jobOpportunities?.active && (
            <button
              onClick={() => setShowJobsModal(true)}
              className="flex items-center justify-between bg-primary/10 text-slate-900 px-4 py-3 rounded-2xl border border-primary/20 shadow-sm transition-transform active:scale-95 group text-left w-full mt-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary text-slate-900 flex items-center justify-center shrink-0 shadow-sm shadow-primary/30">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-none mb-1 opacity-70">Únete al equipo</p>
                  <h4 className="font-black text-sm">Oportunidad de empleo</h4>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform" />
            </button>
          )}

          <div className="flex items-center justify-between mt-2">
            <p className="text-slate-600 text-sm leading-relaxed">
              {restaurant.category} • {restaurant.distance || "Cerca de ti"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFollow}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${isFollowing
                  ? 'bg-slate-100 text-slate-500 border border-slate-200'
                  : 'bg-primary text-slate-900 shadow-lg shadow-primary/20 scale-105 hover:scale-110'
                  }`}
              >
                {isFollowing ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {isFollowing ? 'Siguiendo' : 'Seguir'}
              </button>
              {restaurant.whatsapp && (
                <button
                  onClick={openWhatsApp}
                  className="flex items-center gap-1 bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-xs font-bold border border-green-100 hover:bg-green-100 transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp
                </button>
              )}
              {restaurant.location?.coords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${restaurant.location.coords.lat},${restaurant.location.coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  Mapa
                </a>
              )}
            </div>
          </div>

          {/* Social Links Row - Simplified */}
          {restaurant.socialLinks && restaurant.socialLinks.length > 0 && (
            <div className="flex items-center gap-2 py-1 overflow-x-auto no-scrollbar">
              {restaurant.socialLinks.map((social: any) => (
                <motion.a
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  key={social.id}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center p-2.5 hover:bg-white hover:shadow-md hover:border-primary/30 transition-all shrink-0"
                >
                  <img src={social.imageUrl} alt={social.name} className="w-full h-full object-contain" />
                </motion.a>
              ))}
            </div>
          )}

          {restaurant.location && (restaurant.location.address || restaurant.location.city) && (
            <div className="mt-1 border-t border-slate-50 pt-3 flex flex-col gap-4">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-slate-900 mt-1 shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-slate-700 text-sm">
                    {restaurant.location.city && restaurant.location.state
                      ? `${restaurant.location.city}, ${restaurant.location.state}`
                      : (restaurant.location.city || restaurant.location.state || '')}
                  </p>
                  {restaurant.location.address && <p className="text-xs text-slate-500">{restaurant.location.address}</p>}
                  {restaurant.location.reference && (
                    <p className="text-[10px] text-slate-400 italic mt-0.5">Ref: {restaurant.location.reference}</p>
                  )}
                </div>
              </div>

              {/* Working Hours Section - Simplified */}
              {restaurant.workingHours && (
                <button
                  onClick={() => setShowHoursModal(true)}
                  className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between hover:bg-slate-100 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-slate-900" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Horario Hoy</p>
                      <p className="text-sm font-black text-slate-700 leading-none">
                        {(statusObj as any).todaySchedule?.closed
                          ? 'Cerrado hoy'
                          : `${(statusObj as any).todaySchedule?.open} - ${(statusObj as any).todaySchedule?.close}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-900 uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                    Ver todos
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              )}

              {restaurant.location.coords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${restaurant.location.coords.lat},${restaurant.location.coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-900 text-xs font-bold hover:underline bg-primary/5 w-fit px-3 py-1.5 rounded-lg"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Ver en el mapa
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="bg-white px-5 pt-3 flex gap-6 border-b border-slate-100">
        <button
          onClick={() => setActiveTab('Menú')}
          className={`pb-3 font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'Menú' ? 'text-slate-900 border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
        >
          <Store className="w-4 h-4" /> Menú
        </button>
        <button
          onClick={() => setActiveTab('Reseñas')}
          className={`pb-3 font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'Reseñas' ? 'text-slate-900 border-primary' : 'text-slate-400 border-transparent hover:text-slate-600'}`}
        >
          <Star className="w-4 h-4" /> Reseñas
        </button>
      </div>

      {activeTab === 'Menú' ? (
        <>
          {/* Active Raffle / Promotion Banner */}
          {restaurant.activeRaffle?.isActive && (
            <div className="px-5 pt-6 pb-2">
              <div
                className="relative overflow-hidden group rounded-[3rem] bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 shadow-2xl p-8 flex flex-col items-center text-center cursor-pointer border border-white/10"
                onClick={() => restaurant.activeRaffle.videoLink && window.open(restaurant.activeRaffle.videoLink, '_blank')}
              >
                {/* Background Decorative elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/20 rounded-full blur-[100px] -mr-32 -mt-32 group-hover:bg-primary/30 transition-colors duration-700"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-orange-500/10 rounded-full blur-[100px] -ml-32 -mb-32 group-hover:bg-orange-500/20 transition-colors duration-700"></div>

                <div className="relative z-10 w-full flex flex-col items-center">
                  <div className="flex justify-center mb-6">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1], rotate: [0, 2, -2, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      className="bg-orange-500 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-[0_10px_20px_-5px_rgba(249,115,22,0.5)] flex items-center gap-2"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Sorteo en curso
                    </motion.div>
                  </div>

                  {restaurant.activeRaffle.image && (
                    <div className="w-full aspect-[16/9] md:aspect-[21/9] rounded-[2.5rem] overflow-hidden mb-8 shadow-2xl border-2 border-white/10 group-hover:scale-[1.02] transition-transform duration-700 ease-out">
                      <img src={restaurant.activeRaffle.image} className="w-full h-full object-cover transform scale-105 group-hover:scale-110 transition-transform duration-[2s]" alt="Sorteo" />
                    </div>
                  )}

                  <h3 className="text-3xl md:text-5xl font-black text-white italic leading-tight mb-4 tracking-tighter decoration-primary decoration-4">
                    {restaurant.activeRaffle.title}
                  </h3>

                  <p className="text-slate-400 font-medium text-sm md:text-base leading-relaxed mb-8 italic px-4 max-w-2xl line-clamp-3 opacity-80">
                    {restaurant.activeRaffle.description}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                    <button className="bg-white text-slate-900 px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl hover:bg-primary hover:text-slate-900 active:scale-95 transition-all flex items-center justify-center gap-3 group/btn min-w-[200px]">
                      <Gift className="w-5 h-5 text-slate-900 group-hover/btn:text-white transition-colors" /> ¡Participar Ahora!
                    </button>
                    {restaurant.activeRaffle.videoLink && (
                      <button className="h-[60px] px-6 bg-white/5 backdrop-blur-xl rounded-2xl flex items-center justify-center text-white border border-white/10 hover:bg-white/10 transition-all active:scale-95 gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest">Ver Info</span>
                        {restaurant.activeRaffle.videoLink.includes('instagram') ? <Instagram className="w-5 h-5 text-pink-500" /> :
                          restaurant.activeRaffle.videoLink.includes('tiktok') ? <Music2 className="w-5 h-5 text-cyan-400" /> : <Youtube className="w-5 h-5 text-red-500" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Categories Tabs */}
          <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-100 pb-3 pt-3">
            <div className="flex overflow-x-auto gap-2 px-5 hide-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === cat
                    ? "bg-primary text-slate-900 shadow-md shadow-primary/20"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Menu List */}
          <div className="px-5 pb-32 flex-1 mt-4">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => {
                const productImages = product.images && product.images.length > 0 
                  ? product.images 
                  : [product.image && !product.image.includes('unsplash.com') ? product.image : (restaurant?.logoUrl || restaurant?.image || '')];

                return (
                  <div
                    key={product.id}
                    className="flex gap-4 py-5 border-b border-slate-100 group cursor-pointer"
                    onClick={() => {
                      setSelectedProduct(product);
                      setSelectedVariant(null);
                      setSelectedModifiers({});
                      recommendationsService.recordProductView(product.id!, product.category, restaurant.id!);
                    }}
                  >
                    <div
                      className="flex-1 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
                          {(product.socialMediaLink || product.tiktokLink || product.youtubeLink) && (
                            <div className="flex gap-1">
                              {product.socialMediaLink && (
                                <a
                                  href={product.socialMediaLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`p-1 ${getSocialColor(product.socialMediaLink)} text-white rounded-lg hover:scale-110 active:scale-90 transition-all shadow-sm`}
                                >
                                  {getSocialIcon(product.socialMediaLink)}
                                </a>
                              )}
                              {product.tiktokLink && (
                                <a
                                  href={product.tiktokLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`p-1 ${getSocialColor(product.tiktokLink)} text-white rounded-lg hover:scale-110 active:scale-90 transition-all shadow-sm`}
                                >
                                  {getSocialIcon(product.tiktokLink)}
                                </a>
                              )}
                              {product.youtubeLink && (
                                <a
                                  href={product.youtubeLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className={`p-1 ${getSocialColor(product.youtubeLink)} text-white rounded-lg hover:scale-110 active:scale-90 transition-all shadow-sm`}
                                >
                                  {getSocialIcon(product.youtubeLink)}
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-slate-500 line-clamp-2">{product.description}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {product.consultPrice ? (
                          <div className="w-full">
                            <span className="font-bold text-orange-600 text-xs bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100 flex items-center justify-center gap-1.5 w-full">
                              <Tag className="w-3.5 h-3.5" />
                              Consultar precio al realizar pedido
                            </span>
                          </div>
                        ) : product.variants && product.variants.length > 0 ? (
                          <div className="w-full flex flex-col gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Desde</span>
                              <DualPrice usdAmount={Math.min(...product.variants.map(v => v.price))} usdClassName="font-black text-slate-900 text-lg" showDivider={false} />
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              {product.variants.map((v, idx) => (
                                <div key={idx} className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex flex-col gap-0.5 min-w-[70px]">
                                  <span className="text-[9px] font-black uppercase text-slate-400 leading-none">{v.name}</span>
                                  <DualPrice usdAmount={v.price} usdClassName="text-sm font-black text-slate-800 leading-none" showDivider={false} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {product.promoPrice && product.promoPrice > 0 ? (
                              <>
                                <DualPrice usdAmount={product.promoPrice} usdClassName="font-bold text-slate-900 text-base" />
                                <span className="text-xs text-slate-400 line-through">${product.price.toFixed(2)}</span>
                                <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full shadow-sm">
                                  -{Math.round(((product.price - product.promoPrice) / product.price) * 100)}%
                                </span>
                              </>
                            ) : (
                              <DualPrice usdAmount={product.price} usdClassName="font-bold text-slate-900 text-base" />
                            )}
                          </div>
                        )}
                        {product.popular && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] uppercase font-bold tracking-wider rounded">Popular</span>
                        )}
                      </div>
                    </div>

                    <div
                      className="relative shrink-0 w-32 h-32 group/img"
                    >
                      {productImages.length > 1 ? (
                        <div className="w-full h-full overflow-x-auto flex snap-x snap-mandatory scrollbar-hide rounded-2xl bg-slate-100">
                          {productImages.map((img, idx) => (
                            <div key={idx} className="min-w-full h-full snap-start">
                              <img
                                src={img}
                                alt={`${product.name} ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                          {/* Pagination indicator */}
                          <div className="absolute bottom-1.5 left-0 w-full flex justify-center gap-1 px-2">
                            {productImages.map((_, idx) => (
                              <div key={idx} className="w-1 h-1 rounded-full bg-white/60 shadow-sm" />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="w-full h-full rounded-2xl bg-cover bg-center shadow-sm bg-slate-100"
                          style={{ backgroundImage: `url("${productImages[0] || ''}")` }}
                        ></div>
                      )}

                      {/* Restaurant Logo Overlay on Product */}
                      {restaurant.logoUrl && (
                        <div className="absolute top-2 right-2 w-8 h-8 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-white/50 z-10 pointer-events-none group-hover/img:scale-110 transition-transform">
                          <img src={restaurant.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if ((product.variants && product.variants.length > 0) || (product.modifiers && product.modifiers.length > 0)) {
                            setSelectedProduct(product);
                            setSelectedVariant(null);
                            setSelectedModifiers({});
                          } else {
                            handleAddToCart(product);
                          }
                          // Adding to cart also counts as a strong view
                          recommendationsService.recordProductView(product.id!, product.category, restaurant.id!);
                        }}
                        className="absolute -bottom-2 -right-2 w-10 h-10 bg-white border border-slate-100 rounded-full flex items-center justify-center text-slate-900 shadow-lg hover:scale-110 active:scale-95 transition-all z-10"
                      >
                        <Plus className="w-5 h-5 font-bold" />
                      </button>

                      {productImages.length > 1 && (
                        <div className="absolute top-2 left-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-full text-[8px] font-black text-white uppercase tracking-tighter">
                          {productImages.length} fotos
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-slate-500">
                No hay productos en esta categoría.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="px-5 pb-32 flex-1 mt-4">
          {loadingReviews ? (
            <div className="py-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : reviews.length > 0 ? (
            <div className="space-y-6">
              {reviews.map(review => (
                <div key={review.id} className="bg-white border text-left border-slate-100 p-4 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    {review.userPhoto ? (
                      <img src={review.userPhoto} alt={review.userName} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div>
                      <h4 className="font-bold text-slate-900 leading-none">{review.userName}</h4>
                      <div className="flex items-center gap-1 mt-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} className={`w-3 h-3 ${star <= review.rating ? 'fill-orange-400 text-orange-400' : 'fill-slate-100 text-slate-200'}`} />
                        ))}
                      </div>
                    </div>
                    <span className="ml-auto text-xs text-slate-400">
                      {review.createdAt ? new Date(review.createdAt.toDate()).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">{review.comment}</p>

                  {review.photos && review.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                      {review.photos.map((photo: string, idx: number) => (
                        <a key={idx} href={photo} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <img src={photo} alt="Review photo" className="w-20 h-20 rounded-xl object-cover border border-slate-100" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 flex flex-col items-center gap-3">
              <MessageSquare className="w-12 h-12 text-slate-200" />
              <p className="text-slate-500 font-bold">Aún no hay reseñas</p>
              <p className="text-sm text-slate-400">Sé el primero en probar y contar tu experiencia.</p>
            </div>
          )}
        </div>
      )}

      {/* Floating Cart Button */}
      {totalItems > 0 && items[0]?.restaurantId === restaurant.id && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-full px-5 max-w-md z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <Link 
            to={isDemoMode() ? '#' : '/cart'} 
            onClick={(e) => {
                if (isDemoMode()) {
                    e.preventDefault();
                    setShowDemoAlert(true);
                }
            }}
            className="w-full bg-primary hover:bg-emerald-600 active:bg-emerald-700 text-slate-900 rounded-2xl p-4 shadow-xl shadow-emerald-500/40 flex items-center justify-between transition-colors ring-4 ring-white/10 backdrop-blur-sm"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 px-3 py-1 rounded-lg text-sm font-black flex items-center justify-center min-w-[36px]">{totalItems}</div>
              <span className="font-black text-base uppercase tracking-wider">
                {isWaiter ? 'Ver Comanda' : (restaurant.businessType === 'hotel' ? 'Ver Reservación' : (restaurant.businessType === 'store' || restaurant.businessType === 'tienda' ? 'Ver mi carrito' : 'Ver mi orden'))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Total</span>
              <DualPrice usdAmount={totalPrice} usdClassName="font-black text-xl leading-none" />
            </div>
          </Link>
        </div>
      )}

      {/* Job Opportunities Modal */}
      <AnimatePresence>
        {showJobsModal && restaurant.jobOpportunities && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowJobsModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 relative shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-orange-400"></div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Briefcase className="w-5 h-5 text-slate-900" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Vacantes Disponibles</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{restaurant.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowJobsModal(false)}
                  className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shadow-sm border border-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4 bg-white grow">
                {restaurant.jobOpportunities.positions?.length > 0 ? (
                  restaurant.jobOpportunities.positions.map((pos: any) => (
                    <div key={pos.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-5 hover:border-primary/30 transition-colors group">
                      <h4 className="font-black text-slate-800 text-lg group-hover:text-slate-900 transition-colors">{pos.title}</h4>
                      <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap leading-relaxed">{pos.description}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Briefcase className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">No hay vacantes detalladas</p>
                    <p className="text-xs text-slate-400 mt-1">Por favor, contáctanos directamente para más información.</p>
                  </div>
                )}
              </div>

              <div className="p-6 pt-0 mt-4 shrink-0">
                {restaurant.whatsapp ? (
                  <button
                    onClick={openWhatsApp}
                    className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-black rounded-2xl shadow-lg shadow-green-500/20 text-sm tracking-wide transition-all active:scale-[0.98]"
                  >
                    Postularse por WhatsApp
                  </button>
                ) : (
                  <div className="text-center text-xs text-slate-400 font-bold bg-slate-50 p-3 rounded-xl border border-slate-100">
                    Acércate al local para postularte
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Working Hours Modal */}
      <AnimatePresence>
        {showHoursModal && restaurant.workingHours && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowHoursModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] w-full max-w-sm shadow-2xl overflow-hidden relative z-10 flex flex-col"
            >
              <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 relative shrink-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-orange-400"></div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-slate-900" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800">Horario de Trabajo</h3>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{restaurant.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowHoursModal(false)}
                  className="w-8 h-8 flex items-center justify-center bg-white rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors shadow-sm border border-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3 bg-white">
                {restaurant.workingHours.map((wh: any, idx: number) => {
                  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                  const currentDay = days[new Date().getDay()];
                  const isToday = wh.day === currentDay;

                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 rounded-xl transition-all ${isToday ? 'bg-primary/5 border border-primary/20 scale-105 shadow-sm' : 'bg-slate-50 border border-slate-100'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${wh.closed ? 'bg-red-400' : 'bg-emerald-400'}`}></div>
                        <span className={`text-sm font-black uppercase tracking-tight ${isToday ? 'text-slate-900' : 'text-slate-600'}`}>{wh.day}</span>
                      </div>
                      <div className="text-right">
                        {wh.closed ? (
                          <span className="text-xs font-black text-red-500 italic uppercase">Cerrado</span>
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="text-sm font-black text-slate-800 leading-none">{wh.open} - {wh.close}</span>
                            {isToday && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Hoy</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-6 pt-0 mt-2">
                <button
                  onClick={() => setShowHoursModal(false)}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl shadow-xl shadow-slate-900/20 text-sm tracking-wide transition-all active:scale-[0.98]"
                >
                  Entendido
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setSelectedProduct(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              className="bg-white rounded-t-[3rem] md:rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              {/* Image Section */}
              <div className="relative h-72 md:h-96 shrink-0 bg-slate-100">
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-5 right-5 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center text-slate-900 shadow-xl z-20 hover:scale-110 active:scale-95 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>

                {(() => {
                  const images = selectedProduct.images && selectedProduct.images.length > 0
                    ? selectedProduct.images
                    : [selectedProduct.image && !selectedProduct.image.includes('unsplash.com') ? selectedProduct.image : (restaurant?.logoUrl || restaurant?.image || '')];

                  return (
                    <div className="w-full h-full overflow-x-auto flex snap-x snap-mandatory scrollbar-hide">
                      {images.map((img: string, idx: number) => (
                        <div key={idx} className="min-w-full h-full snap-start">
                          <img
                            src={img}
                            alt={`${selectedProduct.name} ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {/* Pagination Indicator */}
                      {images.length > 1 && (
                        <div className="absolute bottom-6 left-0 w-full flex justify-center gap-2">
                          {images.map((_: any, idx: number) => (
                            <div key={idx} className="w-2 h-2 rounded-full bg-white/60 shadow-md" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Content Section */}
              <div className="p-8 pb-32 flex-1 overflow-y-auto">
                <div className="flex justify-between items-start gap-4 mb-4">
                  <div>
                    <span className="px-3 py-1 bg-slate-100 text-slate-500 text-[10px] font-black uppercase tracking-widest rounded-full">
                      {selectedProduct.category}
                    </span>
                    <h2 className="text-3xl font-black text-slate-900 mt-2">{selectedProduct.name}</h2>
                  </div>
                  <div className="text-right">
                    {selectedProduct.consultPrice ? (
                      <span className="text-sm font-black text-orange-600 bg-orange-50 px-4 py-2 rounded-2xl border border-orange-100">
                        A Cotizar
                      </span>
                    ) : (
                      <div className="flex flex-col items-end">
                        {selectedProduct.promoPrice && selectedProduct.promoPrice > 0 ? (
                          <>
                            <DualPrice usdAmount={selectedProduct.promoPrice} usdClassName="text-3xl font-black text-slate-900" />
                            <span className="text-sm text-slate-400 line-through font-bold">${selectedProduct.price.toFixed(2)}</span>
                          </>
                        ) : (
                          <DualPrice usdAmount={selectedProduct.price} usdClassName="text-3xl font-black text-slate-900" />
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-slate-600 font-medium leading-relaxed mb-8">
                  {selectedProduct.description}
                </p>

                {/* Variants if any */}
                {selectedProduct.variants && selectedProduct.variants.length > 0 && !selectedProduct.consultPrice && (
                  <div className="mb-8">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Presentaciones <span className="text-red-500">*</span></h4>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedProduct.variants.map((v: any, idx: number) => (
                        <button 
                          key={idx} 
                          onClick={() => setSelectedVariant(v)}
                          className={`border p-4 rounded-3xl flex flex-col gap-1 text-left transition-all ${selectedVariant?.name === v.name ? 'bg-primary border-primary shadow-lg shadow-primary/20 scale-105' : 'bg-slate-50 border-slate-100 hover:border-primary/30'}`}
                        >
                          <span className={`text-[10px] font-black uppercase ${selectedVariant?.name === v.name ? 'text-slate-900/60' : 'text-slate-400'}`}>{v.name}</span>
                          <DualPrice usdAmount={v.price} usdClassName={`text-lg font-black ${selectedVariant?.name === v.name ? 'text-slate-900' : 'text-slate-800'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Modifiers if any */}
                {selectedProduct.modifiers && selectedProduct.modifiers.length > 0 && (
                  <div className="mb-8 space-y-6">
                    {selectedProduct.modifiers.map((modifier: any) => (
                      <div key={modifier.id}>
                        <div className="flex items-center justify-between mb-3 ml-1">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                            {modifier.name} {modifier.required && <span className="text-red-500">*</span>}
                          </h4>
                          {modifier.type !== 'instruction' && modifier.maxSelections && (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Máx {modifier.maxSelections}</span>
                          )}
                        </div>

                        {modifier.type === 'instruction' ? (
                          <textarea
                            placeholder="Ej: Sin cebolla, extra salsa..."
                            className="w-full bg-slate-50 border-2 border-slate-100 focus:border-primary p-4 rounded-3xl outline-none text-sm font-medium text-slate-700 min-h-[100px] resize-none transition-colors"
                            value={selectedModifiers[modifier.name]?.[0]?.name || ''}
                            onChange={(e) => handleModifierText(modifier, e.target.value)}
                          />
                        ) : (
                          <div className="flex flex-col gap-2">
                            {modifier.options?.map((option: any) => {
                              const isSelected = selectedModifiers[modifier.name]?.some(o => o.id === option.id);
                              return (
                                <button
                                  key={option.id}
                                  onClick={() => handleModifierToggle(modifier, option)}
                                  className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${isSelected ? 'bg-primary/10 border-primary shadow-sm' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${isSelected ? 'bg-primary border-primary text-black' : 'border-slate-300 bg-white'}`}>
                                      {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
                                    </div>
                                    <span className={`text-sm font-bold ${isSelected ? 'text-slate-900' : 'text-slate-600'}`}>{option.name}</span>
                                  </div>
                                  {option.price > 0 && (
                                    <div className="flex items-center gap-1">
                                      <span className={`text-sm font-black ${isSelected ? 'text-primary-dark' : 'text-slate-400'}`}>+</span>
                                      <DualPrice usdAmount={option.price} usdClassName={`text-sm font-black ${isSelected ? 'text-primary-dark' : 'text-slate-400'}`} showDivider={false} />
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Social Media Links */}
                {(selectedProduct.socialMediaLink || selectedProduct.tiktokLink || selectedProduct.youtubeLink) && (
                  <div className="mb-8">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Promociones en Redes</h4>
                    <div className="flex flex-wrap gap-3">
                      {selectedProduct.socialMediaLink && (
                        <a
                          href={selectedProduct.socialMediaLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-white font-black text-sm shadow-lg transition-all hover:scale-105 active:scale-95 ${getSocialColor(selectedProduct.socialMediaLink)}`}
                        >
                          {getSocialIcon(selectedProduct.socialMediaLink)}
                          Instagram
                        </a>
                      )}
                      {selectedProduct.tiktokLink && (
                        <a
                          href={selectedProduct.tiktokLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-white font-black text-sm shadow-lg transition-all hover:scale-105 active:scale-95 ${getSocialColor(selectedProduct.tiktokLink)}`}
                        >
                          {getSocialIcon(selectedProduct.tiktokLink)}
                          TikTok
                        </a>
                      )}
                      {selectedProduct.youtubeLink && (
                        <a
                          href={selectedProduct.youtubeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`flex items-center gap-3 px-5 py-3 rounded-2xl text-white font-black text-sm shadow-lg transition-all hover:scale-105 active:scale-95 ${getSocialColor(selectedProduct.youtubeLink)}`}
                        >
                          {getSocialIcon(selectedProduct.youtubeLink)}
                          YouTube
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer / Add to Cart / Reserve */}
              <div className="absolute bottom-0 left-0 w-full p-8 bg-white/80 backdrop-blur-md border-t border-slate-100">
                <button
                  disabled={!isFormValid()}
                  onClick={() => {
                    handleAddToCart(selectedProduct, selectedVariant, selectedModifiers);
                    setSelectedProduct(null);
                    setSelectedVariant(null);
                    setSelectedModifiers({});
                  }}
                  className={`w-full py-4 rounded-3xl font-black text-base shadow-2xl flex items-center justify-center gap-3 transition-all ${
                    !isFormValid()
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                      : 'bg-primary text-black shadow-primary/30 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  {restaurant.businessType === 'hotel' ? <CheckCircle className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  {!isFormValid() 
                    ? 'Completa los campos' 
                    : (selectedProduct.consultPrice ? 'Consultar Disponibilidad' : (restaurant.businessType === 'hotel' ? 'Reservar' : 'Añadir'))}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear Cart Modal */}
      <AnimatePresence>
        {showClearCartModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setShowClearCartModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl overflow-hidden relative z-10 p-8 flex flex-col items-center text-center border-t-8 border-primary"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <ShoppingCart className="w-10 h-10 text-slate-900" />
              </div>
              
              <h3 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight font-black underline decoration-primary decoration-4 underline-offset-4">Carrito Ocupado</h3>
              
              <p className="text-slate-500 font-bold leading-relaxed mb-8 px-2">
                Debes despejar tu carrito de compras en la sección de pedidos para añadir pedidos de esta nueva <span className="text-slate-900 font-black">{getBusinessLabel()}</span>.
              </p>
              
              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={confirmClearCart}
                  className="w-full py-4 bg-primary text-black font-black rounded-2xl shadow-[0_6px_0_#ca8a04] active:shadow-none active:translate-y-[6px] transition-all uppercase tracking-widest text-sm border-2 border-slate-900/10"
                >
                  Ir al Carrito
                </button>
                <button
                  onClick={() => setShowClearCartModal(false)}
                  className="w-full py-4 bg-slate-50 text-slate-400 font-black rounded-2xl hover:bg-slate-100 transition-colors uppercase tracking-widest text-[10px]"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <DemoAlertModal 
        isOpen={showDemoAlert} 
        onClose={() => setShowDemoAlert(false)} 
      />
    </div>
  );
}
