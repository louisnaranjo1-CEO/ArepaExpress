import { collection, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

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
}

const MOCK_RESTAURANTS: Restaurant[] = [
    {
        name: "Arepa Factory El Rosal",
        category: "Comida Venezolana",
        rating: 4.8,
        reviews: 125,
        deliveryTime: "20-30 min",
        distance: "1.2 km",
        image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0",
        featured: true,
        products: [
            {
                name: "Reina Pepiada",
                description: "Clásica arepa rellena de pollo mechado con mayonesa y aguacate.",
                price: 5.00,
                image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0",
                category: "Arepas",
                popular: true
            },
            {
                name: "Pelúa",
                description: "Carne mechada jugosa con queso amarillo rallado.",
                price: 5.50,
                image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0",
                category: "Arepas"
            },
            {
                name: "Tequeños (Ración de 5)",
                description: "Palitos de queso envueltos en masa crujiente, acompañados de salsa rosada.",
                price: 4.00,
                image: "https://images.unsplash.com/photo-1541544741938-0af808871cc0",
                category: "Entradas",
                popular: true
            }
        ]
    },
    {
        name: "Burger Shack Las Mercedes",
        category: "Americana • Burgers",
        rating: 4.7,
        reviews: 210,
        deliveryTime: "15-25 min",
        distance: "0.8 km",
        image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add",
        featured: true,
        products: [
            {
                name: "Shack Doble Queso",
                description: "Doble carne de res, doble queso cheddar, tocineta, lechuga, tomate y salsa especial.",
                price: 8.50,
                image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add",
                category: "Hamburguesas",
                popular: true
            },
            {
                name: "Papas Trufadas",
                description: "Papas fritas crujientes bañadas en aceite de trufa y queso parmesano.",
                price: 4.50,
                image: "https://images.unsplash.com/photo-1571091718767-18b5b1457add",
                category: "Almuerzos"
            }
        ]
    },
    {
        name: "Sushi Hana La Castellana",
        category: "Japonesa • Sushi",
        rating: 4.9,
        reviews: 340,
        deliveryTime: "30-45 min",
        distance: "2.5 km",
        image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c",
        featured: false,
        products: [
            {
                name: "Dragon Roll",
                description: "Langostino tempura, queso crema, aguacate, cubierto con plátano maduro y salsa anguila.",
                price: 12.00,
                image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c",
                category: "Sushi",
                popular: true
            },
            {
                name: "Edamame",
                description: "Frijoles de soya al vapor con sal marina.",
                price: 3.00,
                image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c",
                category: "Sushi"
            }
        ]
    },
    {
        name: "Cachapas Don Pancho",
        category: "Comida Venezolana",
        rating: 4.6,
        reviews: 90,
        deliveryTime: "25-35 min",
        distance: "3.0 km",
        image: "https://images.unsplash.com/photo-1627308595229-7830f5c9c66e",
        featured: false,
        products: [
            {
                name: "Cachapa con Queso de Mano",
                description: "Doble porción de queso de mano fresco derretido sobre nuestra tradicional cachapa.",
                price: 7.00,
                image: "https://images.unsplash.com/photo-1627308595229-7830f5c9c66e",
                category: "Cachapas",
                popular: true
            },
            {
                name: "Cachapa con Pernil y Queso",
                description: "Pernil horneado lentamente con queso amarillo o guayanés.",
                price: 9.50,
                image: "https://images.unsplash.com/photo-1627308595229-7830f5c9c66e",
                category: "Cachapas"
            }
        ]
    }
];

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
