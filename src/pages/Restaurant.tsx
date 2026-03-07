import { ArrowLeft, Search, Heart, Star, Clock, Plus, AlertCircle, MessageSquare, MapPin, ChevronRight, Phone, Instagram, UserPlus, UserCheck, Store, Truck, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, arrayUnion, arrayRemove, setDoc, deleteDoc, increment } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant, Product } from '../lib/seed';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { recommendationsService } from '../lib/recommendations';

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [isFavorite, setIsFavorite] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const { user } = useAuth();

  const isWaiter = localStorage.getItem('isWaiter') === 'true';
  const waiterData = JSON.parse(localStorage.getItem('waiterData') || '{}');

  const { addItem, totalItems, totalPrice } = useCart();

  useEffect(() => {
    const fetchRestaurantAndMenu = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        // Fetch restaurant details
        const docRef = doc(db, 'restaurants', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setRestaurant({ id: docSnap.id, ...docSnap.data() });
          setFollowerCount(docSnap.data().followerCount || 0);

          // Check if it's in user following
          if (user) {
            const followRef = doc(db, 'restaurants', id, 'followers', user.uid);
            const followSnap = await getDoc(followRef);
            setIsFollowing(followSnap.exists());
          }

          // Fetch products subcollection
          const productsRef = collection(db, 'restaurants', id, 'products');
          const productsSnap = await getDocs(productsRef);
          const fetchedProducts = productsSnap.docs.map(p => ({ id: p.id, ...p.data() })) as Product[];
          setProducts(fetchedProducts);

          // Check if it's in user favorites
          if (user) {
            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
              const favs = userSnap.data().favorites || [];
              setIsFavorite(favs.includes(id));
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

    fetchRestaurantAndMenu();
  }, [id]);

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
        <Link to="/" className="mt-4 px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-lg">Volver al inicio</Link>
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

  const handleAddToCart = (product: Product) => {
    const finalPrice = product.promoPrice && product.promoPrice > 0 ? product.promoPrice : product.price;
    addItem({
      id: `${product.id}`,
      productId: product.id!,
      restaurantId: restaurant.id!,
      name: product.name,
      price: finalPrice,
      quantity: 1,
      image: product.image,
      category: product.category,
      printerId: (product as any).printerId
    });
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
    if (restaurant.whatsapp) {
      const number = restaurant.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${number}?text=Hola, vengo de Deli Express y me gustaría hacer un pedido.`, '_blank');
    }
  };

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
          <Link to="/" className="flex items-center justify-center w-10 h-10 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex gap-3">
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
                <Star className="w-3 h-3 text-primary fill-primary" />
                <span className="text-[10px] font-black text-slate-700">{restaurant.rating}</span>
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
            <div className="flex items-center gap-1.5 text-primary text-sm font-bold">
              <Star className="w-5 h-5 fill-primary" />
              <span>{restaurant.rating || "Nuevo"}</span>
              <span className="text-slate-500 font-normal">({restaurant.reviews || 0}+ reseñas)</span>
            </div>
            <div className="flex items-center gap-1 text-slate-500 text-sm">
              <Clock className="w-4 h-4" />
              <span>{restaurant.deliveryTime || restaurant.avgPrepTime + ' min' || "30-45 min"}</span>
            </div>
          </div>

          {/* Free Delivery Badge */}
          {restaurant.deliveryRates?.find((r: any) => r.price === 0) && (
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

          <div className="flex items-center justify-between">
            <p className="text-slate-600 text-sm leading-relaxed">
              {restaurant.category} • {restaurant.distance || "Cerca de ti"}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleFollow}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black transition-all ${isFollowing
                  ? 'bg-slate-100 text-slate-500 border border-slate-200'
                  : 'bg-primary text-white shadow-lg shadow-primary/20 scale-105 hover:scale-110'
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

          {restaurant.location && (restaurant.location.address || restaurant.location.city) && (
            <div className="mt-1 border-t border-slate-50 pt-3 flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary mt-1 shrink-0" />
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

              {restaurant.location.coords && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${restaurant.location.coords.lat},${restaurant.location.coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary text-xs font-bold hover:underline bg-primary/5 w-fit px-3 py-1.5 rounded-lg"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  Ver en el mapa
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Categories Tabs */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-100 pb-3 pt-3">
        <div className="flex overflow-x-auto gap-2 px-5 hide-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-5 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${activeCategory === cat
                ? "bg-primary text-white shadow-md shadow-primary/20"
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
            const productImages = product.images && product.images.length > 0 ? product.images : [product.image];

            return (
              <div key={product.id} className="flex gap-4 py-5 border-b border-slate-100 group">
                <div
                  className="flex-1 flex flex-col justify-between cursor-pointer"
                  onClick={() => {
                    recommendationsService.recordProductView(product.id!, product.category, restaurant.id!);
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
                      {product.socialMediaLink && (
                        <a
                          href={product.socialMediaLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white rounded-lg hover:scale-110 active:scale-90 transition-all shadow-sm shadow-purple-200"
                        >
                          <Instagram className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">{product.description}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {product.variants && product.variants.length > 0 ? (
                      <div className="w-full flex flex-col gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Desde</span>
                          <span className="font-black text-slate-900 text-lg">${Math.min(...product.variants.map(v => v.price)).toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          {product.variants.map((v, idx) => (
                            <div key={idx} className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl flex flex-col gap-0.5 min-w-[70px]">
                              <span className="text-[9px] font-black uppercase text-slate-400 leading-none">{v.name}</span>
                              <span className="text-sm font-black text-slate-800 leading-none">${v.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        {product.price === 0 || !product.price ? (
                          <span className="font-bold text-emerald-600 text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">Consultar precio</span>
                        ) : product.promoPrice && product.promoPrice > 0 ? (
                          <>
                            <span className="font-bold text-slate-900 text-base">${product.promoPrice.toFixed(2)}</span>
                            <span className="text-xs text-slate-400 line-through">${product.price.toFixed(2)}</span>
                            <span className="px-2 py-0.5 bg-orange-500 text-white text-[9px] font-black rounded-full shadow-sm">
                              -{Math.round(((product.price - product.promoPrice) / product.price) * 100)}%
                            </span>
                          </>
                        ) : (
                          <span className="font-bold text-slate-900 text-base">${product.price.toFixed(2)}</span>
                        )}
                      </>
                    )}
                    {product.popular && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] uppercase font-bold tracking-wider rounded">Popular</span>
                    )}
                  </div>
                </div>

                <div
                  className="relative shrink-0 w-32 h-32 group/img cursor-pointer"
                  onClick={() => {
                    recommendationsService.recordProductView(product.id!, product.category, restaurant.id!);
                  }}
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
                      style={{ backgroundImage: `url("${product.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80'}")` }}
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
                      handleAddToCart(product);
                      // Adding to cart also counts as a strong view
                      recommendationsService.recordProductView(product.id!, product.category, restaurant.id!);
                    }}
                    className="absolute -bottom-2 -right-2 w-10 h-10 bg-white border border-slate-100 rounded-full flex items-center justify-center text-primary shadow-lg hover:scale-110 active:scale-95 transition-all z-10"
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

      {/* Floating Cart Button */}
      {totalItems > 0 && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 w-full px-5 max-w-md z-[60] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <Link to="/cart" className="w-full bg-primary hover:bg-orange-600 text-white rounded-2xl p-4 shadow-xl shadow-orange-500/40 flex items-center justify-between transition-colors ring-4 ring-white/10 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 px-3 py-1 rounded-lg text-sm font-black flex items-center justify-center min-w-[36px]">{totalItems}</div>
              <span className="font-black text-base uppercase tracking-wider">{isWaiter ? 'Ver Comanda' : 'Ver mi orden'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Total</span>
              <span className="font-black text-xl leading-none">${totalPrice.toFixed(2)}</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
