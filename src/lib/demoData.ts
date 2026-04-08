import { Restaurant, Product } from './seed';

export const DEMO_RESTAURANTS: Restaurant[] = [
  {
    id: 'demo-cashea-active',
    name: "Burger Master (Cashea)",
    category: "Hamburguesas",
    businessType: 'restaurant',
    rating: 4.8,
    reviews: 1250,
    deliveryTime: "20-35 min",
    distance: "1.2 km",
    image: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=800",
    logoUrl: "https://images.unsplash.com/photo-1550547660-d9450f859349?w=200",
    hasCashea: true,
    hasTwoByThree: false,
    featured: true,
    location: {
      city: "Caracas",
      state: "DC",
      address: "Av. Principal de Las Mercedes",
      type: "principal"
    },
    products: [
      { 
        id: 'p1', 
        name: "Combo Double Bacon", 
        description: "Doble carne premium, doble queso cheddar y bacon crujiente. Incluye papas.", 
        price: 12.99, 
        image: "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500", 
        category: "Hamburguesas", 
        popular: true,
        modifiers: [
          {
            id: 'mod-bev',
            type: 'beverage',
            name: 'Bebida con tu Combo',
            required: true,
            maxSelections: 1,
            options: [
              { id: 'b1', name: 'Pepsi 1.5L', price: 0, isAvailable: true },
              { id: 'b2', name: 'Pepsi 600ml', price: 0, isAvailable: true },
              { id: 'b3', name: 'Té Frío', price: 0.50, isAvailable: true }
            ]
          },
          {
            id: 'mod-ext',
            type: 'extra',
            name: 'Añade Extras',
            required: false,
            options: [
              { id: 'e1', name: 'Extra Queso', price: 1.50, isAvailable: true },
              { id: 'e2', name: 'Ración de papas fritas', price: 3.00, isAvailable: true },
              { id: 'e3', name: 'Huevo a la plancha', price: 1.00, isAvailable: true }
            ]
          },
          {
            id: 'mod-pref',
            type: 'preference',
            name: 'Preferencias',
            required: false,
            options: [
              { id: 'pr1', name: 'Sin lechuga', price: 0, isAvailable: true },
              { id: 'pr2', name: 'Sin tomate', price: 0, isAvailable: true },
              { id: 'pr3', name: 'Sin queso', price: 0, isAvailable: true }
            ]
          },
          {
            id: 'mod-inst',
            type: 'instruction',
            name: 'Instrucciones especiales',
            required: false,
            options: []
          }
        ]
      },
      { id: 'p2', name: "Papas Rústicas", description: "Papas con hierbas y parmesano", price: 3.50, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500", category: "Acompañantes" }
    ]
  },
  {
    id: 'demo-cashea-inactive',
    name: "Pizzería Italiana",
    category: "Pizza",
    businessType: 'restaurant',
    rating: 4.6,
    reviews: 840,
    deliveryTime: "30-45 min",
    distance: "2.5 km",
    image: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800",
    logoUrl: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200",
    hasCashea: false,
    hasTwoByThree: false,
    location: {
      city: "Caracas",
      state: "DC",
      address: "Chacao",
      type: "principal"
    },
    products: [
      { id: 'p3', name: "Pizza Margarita", description: "Tomate, mozzarella y albahaca fresca", price: 10.00, image: "https://images.unsplash.com/photo-1574071318508-1cdbad80ad50?w=500", category: "Pizzas" },
      { id: 'p4', name: "Pizza Pepperoni", description: "Mucha mozzarella y pepperoni", price: 12.00, image: "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=500", category: "Pizzas", popular: true }
    ]
  },
  {
    id: 'demo-delivery-free',
    name: "Sushi Hana (Envío Gratis)",
    category: "Sushi",
    businessType: 'restaurant',
    rating: 4.9,
    reviews: 2100,
    deliveryTime: "40-55 min",
    distance: "3.8 km",
    image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800",
    logoUrl: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200",
    ownDelivery: true,
    deliveryRates: [{ minKm: 0, maxKm: 50, price: 0 }],
    hasCashea: true,
    location: {
      city: "Caracas",
      state: "DC",
      address: "Altamira",
      type: "principal"
    },
    products: [
      { id: 'p5', name: "Crunchy Roll", description: "10 piezas de salmon y aguacate", price: 15.00, image: "https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=500", category: "Rolls" },
      { id: 'p6', name: "Combo Samurái", description: "40 piezas variadas", price: 45.00, image: "https://images.unsplash.com/photo-1553621042-f6e147245754?w=500", category: "Combos", popular: true }
    ]
  },
  {
    id: 'demo-delivery-paid',
    name: "Tacos El Guero",
    category: "Mexicana",
    businessType: 'restaurant',
    rating: 4.4,
    reviews: 320,
    deliveryTime: "15-25 min",
    distance: "0.8 km",
    image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
    logoUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200",
    deliveryRates: [{ minKm: 0, maxKm: 5, price: 3.50 }],
    location: {
      city: "Caracas",
      state: "DC",
      address: "La Castellana",
      type: "principal"
    },
    products: [
      { id: 'p7', name: "Tacos al Pastor", description: "3 tacos con piña y cilantro", price: 6.50, image: "https://images.unsplash.com/photo-1552332386-f8dd00dc2f85?w=500", category: "Tacos", popular: true },
      { id: 'p8', name: "Burrito Mixto", description: "Carne, pollo y frijoles", price: 8.00, image: "https://images.unsplash.com/photo-1626700051175-6518a4993f47?w=500", category: "Burritos" }
    ]
  },
  {
    id: 'demo-closed',
    name: "The Coffee House (Cerrado)",
    category: "Cafetería",
    businessType: 'restaurant',
    rating: 4.7,
    reviews: 560,
    deliveryTime: "Consultar",
    distance: "1.5 km",
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800",
    logoUrl: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200",
    workingHours: [
      { day: "Lunes", open: "08:00", close: "20:00", closed: true },
      { day: "Martes", open: "08:00", close: "20:00", closed: true },
      { day: "Miércoles", open: "08:00", close: "20:00", closed: true },
      { day: "Jueves", open: "08:00", close: "20:00", closed: true },
      { day: "Viernes", open: "08:00", close: "20:00", closed: true },
      { day: "Sábado", open: "08:00", close: "20:00", closed: true },
      { day: "Domingo", open: "08:00", close: "20:00", closed: true }
    ],
    location: {
      city: "Caracas",
      state: "DC",
      address: "Los Palos Grandes",
      type: "principal"
    },
    products: [
      { id: 'p9', name: "Capuchino Italiano", description: "Café con espuma de leche", price: 3.00, image: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=500", category: "Café" },
      { id: 'p10', name: "Croissant de Almendras", description: "Recién horneado", price: 2.50, image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500", category: "Pastelería" }
    ]
  },
  {
    id: 'demo-hotel',
    name: "Hotel Altamira Suites",
    category: "Hospedajes",
    businessType: 'hotel',
    rating: 4.9,
    reviews: 4500,
    deliveryTime: "24h",
    distance: "5.0 km",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800",
    logoUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=200",
    location: {
      city: "Caracas",
      state: "DC",
      address: "Altamira",
      type: "principal"
    },
    products: [
      { 
        id: 'p11', 
        name: "Habitación Matrimonial", 
        description: "Lujosa habitación con cama King, vista a la ciudad y WiFi de alta velocidad.", 
        price: 150.00, 
        image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=500", 
        category: "Habitaciones",
        modifiers: [
            {
                id: 'mod-hotel-ext',
                type: 'extra',
                name: 'Servicios Adicionales',
                required: false,
                options: [
                    { id: 'he1', name: 'Desayuno a la habitación', price: 15.00, isAvailable: true },
                    { id: 'he2', name: 'Cama adicional', price: 40.00, isAvailable: true },
                    { id: 'he3', name: 'Entrada al Spa/Sauna', price: 25.00, isAvailable: true },
                    { id: 'he4', name: 'Pase VIP Piscina', price: 20.00, isAvailable: true }
                ]
            },
            {
                id: 'mod-hotel-inst',
                type: 'instruction',
                name: 'Notas para la reservación',
                required: false,
                options: []
            }
        ]
      },
      { id: 'p12', name: "Suite Ejecutiva", description: "Jacuzzi, Área de trabajo y Mini Bar surtido", price: 280.00, image: "https://images.unsplash.com/photo-1582719471384-894fbb16e024?w=500", category: "Suites", popular: true }
    ]
  },
  {
    id: 'demo-2x3-active',
    name: "Tecno Store (Resuelve 2x3)",
    category: "Electrónica",
    businessType: 'restaurant',
    rating: 4.5,
    reviews: 120,
    deliveryTime: "Same Day",
    distance: "2.1 km",
    image: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=800",
    logoUrl: "https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=200",
    hasTwoByThree: true,
    twoByThreeInitial: 40,
    twoByThreeInstallments: 3,
    location: {
      city: "Caracas",
      state: "DC",
      address: "CC San Ignacio",
      type: "principal"
    },
    products: [
      { id: 'p13', name: "iPhone 15 Pro", description: "128GB Titanium", price: 1100.00, image: "https://images.unsplash.com/photo-1696446701796-da61225697cc?w=500", category: "Celulares", popular: true },
      { id: 'p14', name: "AirPods Pro 2", description: "Cancelación de ruido activa", price: 250.00, image: "https://images.unsplash.com/photo-1588423770674-f2a9643d9a15?w=500", category: "Audio" }
    ]
  }
];
