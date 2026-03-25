import React, { createContext, useContext, useState, useEffect } from 'react';

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
    // future: customizations
}

interface CartContextType {
    items: CartItem[];
    addItem: (item: CartItem) => void;
    removeItem: (id: string) => void;
    updateQuantity: (id: string, newQuantity: number) => void;
    clearCart: () => void;
    totalItems: number;
    totalPrice: number;
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
    const [items, setItems] = useState<CartItem[]>(() => {
        // try to load from local storage
        const saved = localStorage.getItem('arepa-express-cart');
        if (saved) {
            try {
                const parsedData = JSON.parse(saved);
                // CLEANUP: Remove test items like "Louis Hamburguesa" as requested by user
                if (Array.isArray(parsedData)) {
                    return parsedData.filter(item =>
                        !item.name?.toLowerCase().includes('louis') &&
                        !item.name?.toLowerCase().includes('hamnurguesa')
                    );
                }
                return [];
            } catch (e) {
                return [];
            }
        }
        return [];
    });

    useEffect(() => {
        localStorage.setItem('arepa-express-cart', JSON.stringify(items));
    }, [items]);

    const addItem = (newItem: CartItem) => {
        setItems((currentItems) => {
            // Check if we are adding from a different restaurant
            if (currentItems.length > 0 && currentItems[0].restaurantId !== newItem.restaurantId) {
                // Optional: you could ask user to clear cart, for MVP we just clear it
                return [newItem];
            }

            const existingIndex = currentItems.findIndex(i => i.id === newItem.id);
            if (existingIndex >= 0) {
                // Update quantity if existing
                const updated = [...currentItems];
                updated[existingIndex].quantity += newItem.quantity;
                return updated;
            }

            return [...currentItems, newItem];
        });
    };

    const removeItem = (id: string) => {
        setItems((current) => current.filter(item => item.id !== id));
    };

    const updateQuantity = (id: string, newQuantity: number) => {
        if (newQuantity <= 0) {
            removeItem(id);
            return;
        }

        setItems((current) =>
            current.map(item => item.id === id ? { ...item, quantity: newQuantity } : item)
        );
    };

    const clearCart = () => setItems([]);

    const totalItems = (items || []).reduce((sum, item) => sum + (item?.quantity || 0), 0);
    const totalPrice = (items || []).reduce((sum, item) => sum + ((item?.price || 0) * (item?.quantity || 0)), 0);

    return (
        <CartContext.Provider value={{
            items,
            addItem,
            removeItem,
            updateQuantity,
            clearCart,
            totalItems,
            totalPrice
        }}>
            {children}
        </CartContext.Provider>
    );
};
