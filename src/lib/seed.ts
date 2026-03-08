import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

export interface ProductVariant {
    name: string;
    price: number;
}

export interface Product {
    id?: string;
    name: string;
    description: string;
    price: number;
    image: string;
    images?: string[];
    socialMediaLink?: string;
    category: string;
    popular?: boolean;
    promoPrice?: number;
    isAvailable?: boolean;
    variants?: ProductVariant[];
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
}

const MOCK_RESTAURANTS: Restaurant[] = [];

export const seedDatabase = async () => {
    try {
        const batch = writeBatch(db);

        for (const restaurant of MOCK_RESTAURANTS) {
            // Create a reference for the new restaurant document
            const restaurantRef = doc(collection(db, 'restaurants'));

            // We extract products to avoid saving them directly on the restaurant doc
            const { products, ...restaurantData } = restaurant;

            batch.set(restaurantRef, restaurantData);

            // Now add the products as a subcollection
            if (products && products.length > 0) {
                for (const product of products) {
                    const productRef = doc(collection(restaurantRef, 'products'));
                    batch.set(productRef, product);
                }
            }
        }

        // Commit the batch
        await batch.commit();
        console.log("✅ Base de datos poblada con éxito con restaurantes y menú!");
        return true;
    } catch (error) {
        console.error("❌ Error al poblar base de datos: ", error);
        return false;
    }
};
