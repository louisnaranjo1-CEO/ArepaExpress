import { ArrowLeft, Search, Heart, Star, Clock, Plus, AlertCircle, MessageSquare, MapPin, ChevronRight, Phone, Instagram } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Restaurant, Product } from '../lib/seed';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

export default function RestaurantPage() {
  const { id } = useParams<{ id: string }>();
  const [restaurant, setRestaurant] = useState<any | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('Todos');
  const [isFavorite, setIsFavorite] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  const { user } = useAuth();

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

  // Filter products by active category
  const filteredProducts = activeCategory === 'Todos'
    ? products
    : products.filter(p => p.category === activeCategory);

  const handleAddToCart = (product: Product) => {
    addItem({
      id: `${product.id}`,
      productId: product.id!,
      restaurantId: restaurant.id!,
      name: product.name,
      price: product.price,
      quantity: 1,
      image: product.image
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

  const openWhatsApp = () => {
    if (restaurant.whatsapp) {
      const number = restaurant.whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${number}?text=Hola, vengo de VenCome y me gustaría hacer un pedido.`, '_blank');
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-white group/design-root overflow-x-hidden flex flex-col">
      {/* Hero Image & Navigation */}
      <div className="relative w-full h-64 md:h-80 shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.7) 100%), url("${restaurant.coverUrl || restaurant.image || 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=1200'}")`
          }}
        ></div>

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
          {restaurant.logoUrl && (
            <div className="relative shrink-0">
              <div className="w-24 h-24 md:w-28 md:h-28 bg-white rounded-full p-1.5 shadow-xl border-4 border-white overflow-hidden animate-in zoom-in-95 duration-500">
                <img src={restaurant.logoUrl} alt={restaurant.name} className="w-full h-full object-contain rounded-full" />
              </div>
              {restaurant.rating && (
                <div className="absolute -bottom-1 -right-1 bg-white px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-slate-100">
                  <Star className="w-3 h-3 text-primary fill-primary" />
                  <span className="text-[10px] font-black text-slate-700">{restaurant.rating}</span>
                </div>
              )}
            </div>
          )}
          <div className="pb-8 flex-1">
            <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] leading-tight">{restaurant.name}</h1>
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

          <div className="flex items-center justify-between">
            <p className="text-slate-600 text-sm leading-relaxed">
              {restaurant.category} • {restaurant.distance || "Cerca de ti"}
            </p>
            {restaurant.whatsapp && (
              <button
                onClick={openWhatsApp}
                className="flex items-center gap-1 bg-green-50 text-green-600 px-3 py-1.5 rounded-full text-xs font-bold border border-green-100 hover:bg-green-100 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                WhatsApp
              </button>
            )}
          </div>

          {restaurant.locations && restaurant.locations.length > 0 && (
            <div className="mt-1 border-t border-slate-50 pt-3">
              <button
                onClick={() => setShowLocations(!showLocations)}
                className="flex items-center justify-between w-full text-slate-500 text-sm font-bold hover:text-slate-900 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Ver sucursales ({restaurant.locations.length})
                </div>
                <ChevronRight className={`w-4 h-4 transition-transform ${showLocations ? 'rotate-90' : ''}`} />
              </button>

              {showLocations && (
                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  {restaurant.locations.map((loc: any, i: number) => (
                    <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="font-bold text-slate-700 text-sm">{loc.city}</p>
                      <p className="text-xs text-slate-500">{loc.address}</p>
                    </div>
                  ))}
                </div>
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
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
                      {product.socialMediaLink && (
                        <a
                          href={product.socialMediaLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white rounded-lg hover:scale-110 active:scale-90 transition-all shadow-sm shadow-purple-200"
                        >
                          <Instagram className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2">{product.description}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="font-bold text-slate-900 text-base">${product.price.toFixed(2)}</span>
                    {product.popular && (
                      <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] uppercase font-bold tracking-wider rounded">Popular</span>
                    )}
                  </div>
                </div>

                <div className="relative shrink-0 w-32 h-32 group/img">
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
                    onClick={() => handleAddToCart(product)}
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
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full px-5 max-w-md z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <Link to="/cart" className="w-full bg-primary hover:bg-orange-600 text-white rounded-2xl p-4 shadow-xl shadow-orange-500/30 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 px-3 py-1 rounded-lg text-sm font-bold flex items-center justify-center min-w-[32px]">{totalItems}</div>
              <span className="font-bold text-base">Ver orden</span>
            </div>
            <span className="font-bold text-lg leading-none">${totalPrice.toFixed(2)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
