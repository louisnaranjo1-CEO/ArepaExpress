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

export type DeliveryStatus = 'pending' | 'active' | 'rejected' | 'inactive';
export type AvailabilityStatus = 'active' | 'busy' | 'offline';
export type VehicleType = 'moto' | 'carro' | 'bicicleta';

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
    currentLocation?: GeoPoint | null;
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
    // Upload documents
    const uploadDoc = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    };

    const selfieUrl = await uploadDoc(files.selfie, `delivery_docs/${uid}/selfie`);
    const vehicleUrl = await uploadDoc(files.vehicle, `delivery_docs/${uid}/vehicle`);
    const licenseUrl = await uploadDoc(files.license, `delivery_docs/${uid}/license`);

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

    await setDoc(doc(db, 'delivery_drivers', uid), driverData);

    // Update user role
    await setDoc(doc(db, 'users', uid), {
        email,
        role: 'delivery',
        createdAt: serverTimestamp()
    }, { merge: true });

    return driverData;
};

export const getDriverProfile = async (idOrEmail: string): Promise<DeliveryDriver | null> => {
    // Check if it's an email
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

export const updateDriverLocation = async (uid: string, lat: number, lng: number) => {
    const docRef = doc(db, 'delivery_drivers', uid);
    await updateDoc(docRef, {
        currentLocation: new GeoPoint(lat, lng),
        updatedAt: serverTimestamp()
    });
};

export const setDriverOnlineStatus = async (uid: string, isOnline: boolean) => {
    const docRef = doc(db, 'delivery_drivers', uid);
    await updateDoc(docRef, {
        isOnline,
        availability: isOnline ? 'active' : 'offline',
        updatedAt: serverTimestamp()
    });
};

export const setDriverAvailability = async (uid: string, availability: AvailabilityStatus) => {
    const docRef = doc(db, 'delivery_drivers', uid);
    await updateDoc(docRef, {
        availability,
        isOnline: availability !== 'offline',
        updatedAt: serverTimestamp()
    });
};
