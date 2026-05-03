import { db, storage } from './firebase';
import {
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    query,
    where,
    getDocs,
    serverTimestamp,
    GeoPoint,
    onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { driversApi } from './api';

export type DeliveryStatus = 'pending' | 'active' | 'rejected' | 'inactive';
export type AvailabilityStatus = 'active' | 'busy' | 'offline';
export type VehicleType = 'moto' | 'carro' | 'bicicleta' | 'ejecutivo';

export interface DeliveryDriver {
    id: string; // auth uid
    email: string;
    fullName: string;
    cedula: string;
    rif: string;
    age: number;
    phone: string;
    vehicleType: VehicleType;
    vehiclePlate: string;
    status: DeliveryStatus;
    isOnline: boolean;
    availability?: AvailabilityStatus;
    currentLocation?: GeoPoint | { latitude: number; longitude: number } | null;
    currentHeading?: number;
    currentSpeed?: number;
    homeLocation?: {
        state: string;
        city: string;
        coords?: { lat: number; lng: number };
    };
    documents: {
        selfieUrl: string;
        vehicleUrl: string;
        licenseUrl: string;
    };
    createdAt: any;
    updatedAt: any;
}

export interface DeliveryFinanceConfig {
    baseFee: number;
    perKmFee: number;
    appCommissionPercentage: number;
}

export const registerDriver = async (
    uid: string,
    email: string,
    data: Omit<DeliveryDriver, 'id' | 'email' | 'status' | 'isOnline' | 'createdAt' | 'updatedAt' | 'documents' | 'currentLocation'>,
    files: { selfie: File; vehicle: File; license: File }
) => {
    // Upload documents to Firebase Storage (images stay in Firebase)
    const uploadDoc = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    };

    const selfieUrl = await uploadDoc(files.selfie, `delivery_docs/${uid}/selfie`);
    const vehicleUrl = await uploadDoc(files.vehicle, `delivery_docs/${uid}/vehicle`);
    const licenseUrl = await uploadDoc(files.license, `delivery_docs/${uid}/license`);

    // Register in PostgreSQL (primary source of truth)
    try {
        await driversApi.register({
            firebase_uid: uid,
            email,
            full_name: data.fullName,
            phone: data.phone,
            cedula: data.cedula,
            rif: data.rif,
            age: data.age,
            vehicle_type: data.vehicleType,
            vehicle_plate: data.vehiclePlate,
            selfie_url: selfieUrl,
            vehicle_url: vehicleUrl,
            license_url: licenseUrl,
            home_state: data.homeLocation?.state,
            home_city: data.homeLocation?.city,
            home_coords_lat: data.homeLocation?.coords?.lat,
            home_coords_lng: data.homeLocation?.coords?.lng,
        });
    } catch (apiErr) {
        console.error("Error registering driver in PostgreSQL:", apiErr);
    }

    const driverData: DeliveryDriver = {
        id: uid,
        email,
        ...data,
        status: 'pending',
        isOnline: false,
        availability: 'offline',
        currentLocation: null,
        documents: {
            selfieUrl,
            vehicleUrl,
            licenseUrl
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    };

    // Also save to Firestore for auth-related features
    await setDoc(doc(db, 'delivery_drivers', uid), driverData);

    const userRole = (data.vehicleType === 'carro' || data.vehicleType === 'ejecutivo') ? 'driver' : 'delivery';

    // Update user role in Firestore (auth-related)
    await setDoc(doc(db, 'users', uid), {
        email,
        role: userRole,
        createdAt: serverTimestamp()
    }, { merge: true });

    return driverData;
};

export const getDriverProfile = async (idOrEmail: string): Promise<DeliveryDriver | null> => {
    // Try PostgreSQL first (primary source of truth)
    try {
        if (!idOrEmail.includes('@')) {
            const driver = await driversApi.getDriver(idOrEmail);
            return driver as unknown as DeliveryDriver;
        }
    } catch (apiErr) {
        console.warn("PostgreSQL driver lookup failed, falling back to Firestore:", apiErr);
    }

    // Fallback to Firestore
    if (idOrEmail.includes('@')) {
        const q = query(collection(db, 'delivery_drivers'), where('email', '==', idOrEmail));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            return querySnapshot.docs[0].data() as DeliveryDriver;
        }
    } else {
        const docRef = doc(db, 'delivery_drivers', idOrEmail);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return docSnap.data() as DeliveryDriver;
        }
    }
    return null;
};

/**
 * Actualizar ubicación del driver — PostgreSQL es la fuente primaria
 * Con soporte para heading y speed para tracking animado
 */
export const updateDriverLocation = async (uid: string, lat: number, lng: number, heading?: number, speed?: number) => {
    // PostgreSQL (primary — usado para tracking en tiempo real)
    try {
        await driversApi.updateLocation(uid, lat, lng, heading, speed);
    } catch (apiErr) {
        console.error("Error updating driver location in PostgreSQL:", apiErr);
    }
};

/**
 * Cambiar estado online/offline del driver — PostgreSQL es la fuente primaria
 */
export const setDriverOnlineStatus = async (uid: string, isOnline: boolean) => {
    // PostgreSQL (primary — usado para disponibilidad en Taxi.tsx)
    try {
        await driversApi.updateStatus(uid, isOnline);
    } catch (apiErr) {
        console.error("Error updating driver status in PostgreSQL:", apiErr);
    }

    // Firestore (para compatibilidad temporal con otros flujos)
    try {
        const docRef = doc(db, 'delivery_drivers', uid);
        await updateDoc(docRef, {
            isOnline,
            availability: isOnline ? 'active' : 'offline',
            updatedAt: serverTimestamp()
        });
    } catch (fbErr) {
        console.warn("Firestore status update failed (non-critical):", fbErr);
    }
};

export const setDriverAvailability = async (uid: string, availability: AvailabilityStatus) => {
    // PostgreSQL (primary)
    try {
        await driversApi.updateStatus(uid, availability !== 'offline', availability);
    } catch (apiErr) {
        console.error("Error updating driver availability in PostgreSQL:", apiErr);
    }

    // Firestore (compatibilidad)
    try {
        const docRef = doc(db, 'delivery_drivers', uid);
        await updateDoc(docRef, {
            availability,
            isOnline: availability !== 'offline',
            updatedAt: serverTimestamp()
        });
    } catch (fbErr) {
        console.warn("Firestore availability update failed (non-critical):", fbErr);
    }
};
