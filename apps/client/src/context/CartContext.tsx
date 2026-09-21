import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartModifierItem {
    id: string; // The option id or just generic if it's text
    name: string; // The selected option name or textarea content
    price: number; 
}

export interface CartItem {
    id: string; // product id + customizations
    productId: string;
    restaurantId: string;
    name: string;
    price: number;
    pointsPrice?: number;
    quantity: number;
    image: string;
    category: string;
    printerId?: string;
    table?: string;
    consultPrice?: boolean;
    modifiersConfig?: { [modifierName: string]: CartModifierItem[] };
}

export type StoreCartMap = { [restaurantId: string]: CartItem[] };

interface CartContextType {
    items: CartItem[];
    storeCarts: StoreCartMap;
    activeRestaurantId: string | null;
    setActiveRestaurantId: (restaurantId: string) => void;
    storeIds: string[];
    addItem: (item: CartItem) => void;
    removeItem: (id: string, restaurantId?: string) => void;
    updateQuantity: (id: string, newQuantity: number, restaurantId?: string) => void;
    clearCart: () => void;
    clearStoreCart: (restaurantId: string) => void;
    clearAllCarts: () => void;
    totalItems: number;
    totalPrice: number;
    allStoresTotalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const useCart = () => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [storeCarts, setStoreCarts] = useState<StoreCartMap>(() => {
        // First check multi-store storage
        const savedMulti = localStorage.getItem('arepa-express-store-carts');
        if (savedMulti) {
            try {
                const parsed = JSON.parse(savedMulti);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed;
                }
            } catch (e) {}
        }

        // Backward compatibility: check single-store legacy array
        const saved = localStorage.getItem('arepa-express-cart');
        if (saved) {
            try {
                const parsedData = JSON.parse(saved);
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    const migrated: StoreCartMap = {};
                    parsedData.forEach((item: CartItem) => {
                        if (item && item.restaurantId) {
                            if (!migrated[item.restaurantId]) migrated[item.restaurantId] = [];
                            migrated[item.restaurantId].push(item);
                        }
                    });
                    return migrated;
                }
            } catch (e) {}
        }
        return {};
    });

    const [activeRestaurantId, setActiveRestaurantIdState] = useState<string | null>(() => {
        const savedActive = localStorage.getItem('arepa-express-active-store');
        if (savedActive) return savedActive;
        const keys = Object.keys(storeCarts).filter(k => (storeCarts[k] || []).length > 0);
        return keys[0] || null;
    });

    const storeIds = Object.keys(storeCarts).filter(k => (storeCarts[k] || []).length > 0);

    // Sync effective active store
    const effectiveRestId = (activeRestaurantId && storeCarts[activeRestaurantId]?.length)
        ? activeRestaurantId
        : (storeIds[0] || null);

    const setActiveRestaurantId = (id: string) => {
        setActiveRestaurantIdState(id);
        try {
            localStorage.setItem('arepa-express-active-store', id);
        } catch (e) {}
    };

    const items = effectiveRestId ? (storeCarts[effectiveRestId] || []) : [];

    useEffect(() => {
        try {
            localStorage.setItem('arepa-express-store-carts', JSON.stringify(storeCarts));
            localStorage.setItem('arepa-express-cart', JSON.stringify(items));
            if (effectiveRestId) {
                localStorage.setItem('arepa-express-active-store', effectiveRestId);
            }
        } catch (e) {}
    }, [storeCarts, items, effectiveRestId]);

    const addItem = (newItem: CartItem) => {
        const restId = newItem.restaurantId;
        setStoreCarts((currentCarts) => {
            const currentItems = currentCarts[restId] || [];
            const existingIndex = currentItems.findIndex(i => i.id === newItem.id);
            let updatedItems: CartItem[];
            if (existingIndex >= 0) {
                updatedItems = [...currentItems];
                updatedItems[existingIndex].quantity += newItem.quantity;
            } else {
                updatedItems = [...currentItems, newItem];
            }
            return {
                ...currentCarts,
                [restId]: updatedItems
            };
        });
        setActiveRestaurantId(restId);
    };

    const removeItem = (id: string, restaurantId?: string) => {
        setStoreCarts((currentCarts) => {
            const targetRestId = restaurantId || effectiveRestId;
            if (!targetRestId || !currentCarts[targetRestId]) return currentCarts;
            const nextItems = currentCarts[targetRestId].filter(item => item.id !== id && (item as any).productId !== id);
            const updated = { ...currentCarts };
            if (nextItems.length === 0) {
                delete updated[targetRestId];
            } else {
                updated[targetRestId] = nextItems;
            }
            return updated;
        });
    };

    const updateQuantity = (id: string, newQuantity: number, restaurantId?: string) => {
        if (newQuantity <= 0) {
            removeItem(id, restaurantId);
            return;
        }

        setStoreCarts((currentCarts) => {
            const targetRestId = restaurantId || effectiveRestId;
            if (!targetRestId || !currentCarts[targetRestId]) return currentCarts;
            const nextItems = currentCarts[targetRestId].map(item => item.id === id ? { ...item, quantity: newQuantity } : item);
            return {
                ...currentCarts,
                [targetRestId]: nextItems
            };
        });
    };

    const clearStoreCart = (restaurantId: string) => {
        setStoreCarts((prev) => {
            const next = { ...prev };
            delete next[restaurantId];
            return next;
        });
    };

    const clearCart = () => {
        if (effectiveRestId) {
            clearStoreCart(effectiveRestId);
        }
    };

    const clearAllCarts = () => {
        setStoreCarts({});
        setActiveRestaurantIdState(null);
        try {
            localStorage.removeItem('arepa-express-store-carts');
            localStorage.removeItem('arepa-express-cart');
            localStorage.removeItem('arepa-express-active-store');
        } catch (e) {}
    };

    const totalItems = items.reduce((sum, item) => sum + (item?.quantity || 0), 0);
    const totalPrice = items.reduce((sum, item) => sum + ((item?.price || 0) * (item?.quantity || 0)), 0);
    const allStoresTotalItems = Object.values(storeCarts).flat().reduce((sum, item) => sum + (item?.quantity || 0), 0);

    return (
        <CartContext.Provider value={{
            items,
            storeCarts,
            activeRestaurantId: effectiveRestId,
            setActiveRestaurantId,
            storeIds,
            addItem,
            removeItem,
            updateQuantity,
            clearCart,
            clearStoreCart,
            clearAllCarts,
            totalItems,
            totalPrice,
            allStoresTotalItems
        }}>
            {children}
        </CartContext.Provider>
    );
};
