import { collection, writeBatch, doc, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface ProductVariant {
    name: string;
    price: number;
}

export type ModifierType = 'beverage' | 'extra' | 'preference' | 'instruction';

export interface ProductModifierOption {
    id: string;
    name: string;
    price: number;
    isAvailable: boolean;
}

export interface ProductModifier {
    id: string;
    type: ModifierType;
    name: string;
    required: boolean;
    maxSelections?: number;
    options: ProductModifierOption[];
}

export interface Product {
    id?: string;
    name: string;
    description: string;
    price: number;
    pointsPrice?: number;
    image: string;
    images?: string[];
    socialMediaLink?: string;
    tiktokLink?: string;
    youtubeLink?: string;
    category: string;
    subcategory?: string;
    popular?: boolean;
    promoPrice?: number;
    isAvailable?: boolean;
    variants?: ProductVariant[];
    modifiers?: ProductModifier[];
    consultPrice?: boolean;
}

export interface Location {
    address: string;
    city: string;
    state: string;
    coords?: { lat: number; lng: number };
    type: 'principal' | 'sucursal';
    reference?: string;
}

export interface DeliveryRate {
    minKm: number;
    maxKm: number;
    price: number;
}

export interface Restaurant {
    id?: string;
    name: string;
    category: string;
    businessType: 'restaurant' | 'hotel' | 'store' | 'tienda';
    rating: number;
    reviews: number;
    deliveryTime: string;
    distance: string;
    image: string;
    logoUrl?: string;
    coverUrl?: string;
    featured?: boolean;
    followerCount?: number;
    followers?: string[];
    products?: Product[];
    location?: Location;
    ownDelivery?: boolean;
    deliveryRates?: DeliveryRate[];
    whatsapp?: string;
    workingHours?: {
        day: string;
        open: string;
        close: string;
        closed: boolean;
    }[];
    isMock?: boolean;
    hasCashea?: boolean;
    hasTwoByThree?: boolean;
    twoByThreeInitial?: number;
    twoByThreeInstallments?: number;
    isActive?: boolean;
}

const MOCK_RESTAURANTS: Restaurant[] = [
    {
        name: "Burger King (Mock)",
        category: "Comida Rápida",
        businessType: 'restaurant',
        rating: 4.5,
        reviews: 120,
        deliveryTime: "20-30 min",
        distance: "2.5 km",
        image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800",
        logoUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=200",
        isMock: true,
        featured: true,
        products: [
            { name: "Whopper", description: "La clásica hamburguesa", price: 5.99, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500", category: "Hamburguesas" },
            { name: "Papas Fritas", description: "Papas crujientes", price: 2.99, image: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=500", category: "Acompañantes" }
        ]
    },
    {
        name: "Ferretería El Tornillo (Mock)",
        category: "Ferretería",
        businessType: 'store',
        rating: 4.8,
        reviews: 45,
        deliveryTime: "40-60 min",
        distance: "4.0 km",
        image: "https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=800",
        logoUrl: "https://images.unsplash.com/photo-1581092918056-0c4c3cb37150?w=200",
        isMock: true,
        products: [
            { name: "Martillo", description: "Martillo de acero", price: 12.50, image: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=500", category: "Herramientas" },
            { name: "Clavos 2 pulgadas", description: "Caja de clavos", price: 3.00, image: "https://images.unsplash.com/photo-1530968033775-2c92736b131e?w=500", category: "Materiales" }
        ]
    },
    {
        name: "Moda Fashion (Mock)",
        category: "Tienda de Ropa",
        businessType: 'store',
        rating: 4.2,
        reviews: 80,
        deliveryTime: "1-2 days",
        distance: "5.5 km",
        image: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=800",
        logoUrl: "https://images.unsplash.com/photo-1537832816519-689ad163238b?w=200",
        isMock: true,
        featured: true,
        products: [
            { name: "Camiseta Blanca", description: "Camiseta de algodón", price: 15.00, image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500", category: "Ropa" },
            { name: "Pantalón Jean", description: "Jean azul clásico", price: 35.00, image: "https://images.unsplash.com/photo-1542272604-78fe0840c347?w=500", category: "Ropa" }
        ]
    },
    {
        name: "Supermercado Central (Mock)",
        category: "Supermercado",
        businessType: 'store',
        rating: 4.6,
        reviews: 300,
        deliveryTime: "45-60 min",
        distance: "3.2 km",
        image: "https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=800",
        logoUrl: "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=200",
        isMock: true,
        products: [
            { name: "Manzanas", description: "1 kg de manzanas frescas", price: 4.50, image: "https://images.unsplash.com/photo-1560806887-1e4cd0b6faa6?w=500", category: "Frutas" },
            { name: "Leche", description: "Litro de leche entera", price: 1.20, image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500", category: "Lácteos" }
        ]
    },
    {
        name: "Postres Delicias (Mock)",
        category: "Emprendimiento",
        businessType: 'restaurant',
        rating: 4.9,
        reviews: 20,
        deliveryTime: "30-45 min",
        distance: "1.5 km",
        image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?w=800",
        logoUrl: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=200",
        isMock: true,
        products: [
            { name: "Torta de Chocolate", description: "Porción de torta", price: 4.00, image: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=500", category: "Postres" },
            { name: "Cupcakes", description: "Caja de 4 cupcakes", price: 6.00, image: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=500", category: "Postres" }
        ]
    }
];

export const seedDatabase = async () => {
    try {
        const batch = writeBatch(db);

        for (const restaurant of MOCK_RESTAURANTS) {
            const restaurantRef = doc(collection(db, 'restaurants'));
            const { products, ...restaurantData } = restaurant;

            batch.set(restaurantRef, restaurantData);

            if (products && products.length > 0) {
                for (const product of products) {
                    const productRef = doc(collection(restaurantRef, 'products'));
                    batch.set(productRef, product);
                }
            }
        }

        await batch.commit();
        console.log("✅ Datos de prueba poblando la base de datos con éxito!");
        return true;
    } catch (error) {
        console.error("❌ Error al poblar base de datos: ", error);
        return false;
    }
};

export const clearMockDatabase = async () => {
    try {
        const q = query(collection(db, 'restaurants'), where('isMock', '==', true));
        const snapshot = await getDocs(q);

        const batch = writeBatch(db);
        let count = 0;

        for (const docSnap of snapshot.docs) {
            const productsSnap = await getDocs(collection(db, 'restaurants', docSnap.id, 'products'));
            for (const productDoc of productsSnap.docs) {
                batch.delete(doc(db, 'restaurants', docSnap.id, 'products', productDoc.id));
            }
            batch.delete(doc(db, 'restaurants', docSnap.id));
            count++;
            // Batch limit is 500 operations, but since MOCK_RESTAURANTS has 5 items each with 2 products, it's 15 ops max. Fine for now.
        }

        if (count > 0) {
            await batch.commit();
        }
        console.log("✅ Datos de prueba eliminados con éxito.");
        return true;
    } catch (error) {
        console.error("❌ Error al eliminar base de datos de prueba: ", error);
        return false;
    }
};
