import { supabase } from './supabase';

// Table Mapping from Firebase collection names to Supabase table names
const TABLE_MAP: Record<string, string> = {
    'restaurants': 'comercios',
    'orders': 'orders',
    'products': 'products',
    'tables': 'restaurant_tables',
    'restaurant_tables': 'restaurant_tables',
    'printers': 'printers',
    'waiters': 'waiters',
    'cashiers': 'cashiers',
    'banners': 'banners',
    'categories': 'categories',
    'users': 'profiles',
    'profiles': 'profiles',
    'reviews': 'reviews',
    'rewards': 'rewards',
    'notifications': 'notifications',
    'support_tickets': 'support_tickets',
    'marketing': 'marketing',
    'raffles': 'raffles',
    'pilot_achievements': 'pilot_achievements',
    'finances': 'system_configs',
    'system_configs': 'system_configs'
};

const resolveTable = (name: string): string => {
    return TABLE_MAP[name] || name;
};

export interface DocRef {
    id: string;
    table: string;
    path: string;
    parentFilter?: Record<string, any>;
}

export interface CollectionRef {
    table: string;
    path: string;
    parentFilter?: Record<string, any>;
}

export interface QueryConstraint {
    type: 'where' | 'orderBy' | 'limit';
    field?: string;
    op?: string;
    val?: any;
    ascending?: boolean;
    count?: number;
}

export interface QueryRef {
    collection: CollectionRef;
    constraints: QueryConstraint[];
}

export class Timestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
        this.seconds = seconds;
        this.nanoseconds = nanoseconds;
    }
    static now() {
        return new Timestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(date: Date) {
        return new Timestamp(Math.floor(date.getTime() / 1000), 0);
    }
    toDate() {
        return new Date(this.seconds * 1000);
    }
}

// 1. Doc helper
export function doc(...args: any[]): DocRef {
    let table = '';
    let id = '';
    let parentFilter: Record<string, any> | undefined = undefined;

    if (args.length === 3 && typeof args[1] === 'string' && typeof args[2] === 'string') {
        table = resolveTable(args[1]);
        id = args[2];
    } else if (args.length === 2 && typeof args[0] === 'object' && args[0]?.table) {
        table = args[0].table;
        id = args[1];
        parentFilter = args[0].parentFilter;
    } else if (args.length === 1 && typeof args[0] === 'object' && args[0]?.table) {
        table = args[0].table;
        id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `doc_${Date.now()}`;
        parentFilter = args[0].parentFilter;
    } else if (args.length >= 4) {
        table = resolveTable(args[3]);
        id = args[4] || ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `doc_${Date.now()}`);
        if (args[1] === 'restaurants') {
            parentFilter = { restaurant_id: args[2], restaurantId: args[2] };
        }
    } else {
        table = 'general';
        id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `doc_${Date.now()}`;
    }

    return { id, table, path: `${table}/${id}`, parentFilter };
}

// 2. Collection helper
export function collection(...args: any[]): CollectionRef {
    let table = '';
    let parentFilter: Record<string, any> | undefined = undefined;

    if (args.length === 2 && typeof args[1] === 'string') {
        table = resolveTable(args[1]);
    } else if (args.length >= 4 && typeof args[1] === 'string' && typeof args[3] === 'string') {
        table = resolveTable(args[3]);
        if (args[1] === 'restaurants') {
            parentFilter = { restaurant_id: args[2], restaurantId: args[2] };
        }
    } else if (args.length === 2 && typeof args[0] === 'object' && args[0]?.id) {
        table = resolveTable(args[1]);
        if (args[0].table === 'comercios' || args[0].table === 'restaurants') {
            parentFilter = { restaurant_id: args[0].id, restaurantId: args[0].id };
        }
    } else {
        table = typeof args[1] === 'string' ? resolveTable(args[1]) : 'general';
    }

    return { table, path: table, parentFilter };
}

export function collectionGroup(_db: any, name: string): CollectionRef {
    return { table: resolveTable(name), path: name };
}

// 3. Query helper
export function query(col: CollectionRef, ...constraints: QueryConstraint[]): QueryRef {
    return { collection: col, constraints };
}

export function where(field: string, op: string, val: any): QueryConstraint {
    return { type: 'where', field, op, val };
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc'): QueryConstraint {
    return { type: 'orderBy', field, ascending: dir !== 'desc' };
}

export function limit(count: number): QueryConstraint {
    return { type: 'limit', count };
}

// 4. getDoc
export async function getDoc(docRef: DocRef): Promise<any> {
    try {
        const { data, error } = await supabase
            .from(docRef.table)
            .select('*')
            .eq('id', docRef.id)
            .maybeSingle();

        if (error || !data) {
            return {
                id: docRef.id,
                exists: () => false,
                data: () => undefined
            };
        }

        return {
            id: docRef.id,
            exists: () => true,
            data: () => data
        };
    } catch (e) {
        console.warn(`[SupabaseAdapter] getDoc failed on ${docRef.table}/${docRef.id}`, e);
        return {
            id: docRef.id,
            exists: () => false,
            data: () => undefined
        };
    }
}

// 5. getDocs
export async function getDocs(queryOrCol: any): Promise<any> {
    const col: CollectionRef = queryOrCol.collection || queryOrCol;
    const constraints: QueryConstraint[] = queryOrCol.constraints || [];

    try {
        let q = supabase.from(col.table).select('*');

        if (col.parentFilter) {
            Object.entries(col.parentFilter).forEach(([k, v]) => {
                if (k === 'restaurant_id') q = q.eq(k, v);
            });
        }

        for (const c of constraints) {
            if (c.type === 'where' && c.field && c.val !== undefined) {
                if (c.op === '==' || c.op === '===') {
                    q = q.eq(c.field, c.val);
                } else if (c.op === 'in' && Array.isArray(c.val)) {
                    q = q.in(c.field, c.val);
                } else if (c.op === '>') {
                    q = q.gt(c.field, c.val);
                } else if (c.op === '>=') {
                    q = q.gte(c.field, c.val);
                } else if (c.op === '<') {
                    q = q.lt(c.field, c.val);
                } else if (c.op === '<=') {
                    q = q.lte(c.field, c.val);
                }
            } else if (c.type === 'orderBy' && c.field) {
                q = q.order(c.field, { ascending: c.ascending ?? true });
            } else if (c.type === 'limit' && c.count) {
                q = q.limit(c.count);
            }
        }

        const { data, error } = await q;

        if (error || !data) {
            return {
                docs: [],
                empty: true,
                size: 0,
                forEach: () => []
            };
        }

        const docs = data.map((d: any) => ({
            id: d.id,
            data: () => d,
            exists: () => true
        }));

        return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
            forEach: (cb: (doc: any) => void) => docs.forEach(cb)
        };
    } catch (e) {
        console.warn(`[SupabaseAdapter] getDocs failed on ${col.table}:`, e);
        return { docs: [], empty: true, size: 0, forEach: () => [] };
    }
}

// 6. setDoc
export async function setDoc(docRef: DocRef, data: any, _options?: { merge?: boolean }): Promise<void> {
    const payload = {
        id: docRef.id,
        ...(docRef.parentFilter || {}),
        ...data,
        updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const { error } = await supabase.from(docRef.table).upsert(payload);
    if (error) {
        console.error(`[SupabaseAdapter] setDoc error on ${docRef.table}/${docRef.id}:`, error);
        throw error;
    }
}

// 7. updateDoc
export async function updateDoc(docRef: DocRef, data: any): Promise<void> {
    const payload = {
        ...data,
        updated_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const { error } = await supabase.from(docRef.table).update(payload).eq('id', docRef.id);
    if (error) {
        console.error(`[SupabaseAdapter] updateDoc error on ${docRef.table}/${docRef.id}:`, error);
        throw error;
    }
}

// 8. addDoc
export async function addDoc(colRef: CollectionRef, data: any): Promise<DocRef> {
    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `item_${Date.now()}`;
    const payload = {
        id: newId,
        ...(colRef.parentFilter || {}),
        ...data,
        created_at: new Date().toISOString()
    };
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const { error } = await supabase.from(colRef.table).insert(payload);
    if (error) {
        console.error(`[SupabaseAdapter] addDoc error on ${colRef.table}:`, error);
        throw error;
    }

    return { id: newId, table: colRef.table, path: `${colRef.table}/${newId}` };
}

// 9. deleteDoc
export async function deleteDoc(docRef: DocRef): Promise<void> {
    const { error } = await supabase.from(docRef.table).delete().eq('id', docRef.id);
    if (error) {
        console.error(`[SupabaseAdapter] deleteDoc error on ${docRef.table}/${docRef.id}:`, error);
        throw error;
    }
}

// 10. onSnapshot (Realtime subscription via Supabase)
export function onSnapshot(target: any, onNext: (snap: any) => void, onError?: (err: any) => void): () => void {
    const isDoc = Boolean(target.id && target.table);
    const table = isDoc ? target.table : (target.collection?.table || target.table);
    const docId = isDoc ? target.id : null;

    let isSubscribed = true;

    const doFetch = async () => {
        try {
            if (isDoc) {
                const snap = await getDoc(target);
                if (isSubscribed) onNext(snap);
            } else {
                const snap = await getDocs(target);
                if (isSubscribed) onNext(snap);
            }
        } catch (e) {
            if (onError) onError(e);
        }
    };

    doFetch();

    const channelName = `sub_${table}_${docId || 'all'}_${Date.now()}_${Math.random()}`;
    const filter = docId ? `id=eq.${docId}` : undefined;

    const channel = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table, filter },
            () => {
                if (isSubscribed) doFetch();
            }
        )
        .subscribe();

    return () => {
        isSubscribed = false;
        supabase.removeChannel(channel);
    };
}

// 11. writeBatch helper
export function writeBatch(_db?: any) {
    const operations: Array<() => Promise<any>> = [];

    return {
        set(docRef: DocRef, data: any) {
            operations.push(() => setDoc(docRef, data));
        },
        update(docRef: DocRef, data: any) {
            operations.push(() => updateDoc(docRef, data));
        },
        delete(docRef: DocRef) {
            operations.push(() => deleteDoc(docRef));
        },
        async commit() {
            await Promise.all(operations.map(op => op()));
        }
    };
}

// 12. FieldValue helpers
export function serverTimestamp() {
    return new Date().toISOString();
}

export function increment(n: number) {
    return n;
}

export function arrayUnion(...items: any[]) {
    return items;
}

export function arrayRemove(..._items: any[]) {
    return [];
}

// 13. Firebase Storage Emulation (backed by Supabase Storage bucket 'store_assets')
export interface StorageRef {
    path: string;
}

export function ref(_storage: any, path: string): StorageRef {
    return { path };
}

export function getStorage() {
    return {};
}

export async function uploadBytes(storageRef: StorageRef, file: any): Promise<any> {
    const { error } = await supabase.storage.from('store_assets').upload(storageRef.path, file, {
        upsert: true
    });
    if (error) {
        console.warn("[SupabaseAdapter] Storage upload error:", error);
    }
    return { ref: storageRef };
}

export async function getDownloadURL(storageRef: StorageRef): Promise<string> {
    const { data } = supabase.storage.from('store_assets').getPublicUrl(storageRef.path);
    return data?.publicUrl || '';
}

// 14. Firebase Auth Emulation
export const auth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => {
        cb(null);
        return () => {};
    },
    signOut: async () => {
        await supabase.auth.signOut();
    }
};

export async function signInAnonymously(_auth?: any) {
    return { user: { uid: `anon_${Date.now()}` } };
}

export function getAuth() {
    return auth;
}

// 15. Stubs
export const db = {};
export const storage = {};
export const rtdb = {};
export const messaging = null;

export function initializeApp() {
    return {};
}

export function getFirestore() {
    return db;
}

export function getDatabase() {
    return rtdb;
}

export function getMessaging() {
    return null;
}

export async function isSupported() {
    return false;
}

export async function getToken() {
    return null;
}

export class EmailAuthProvider { static PROVIDER_ID = 'password'; }
export class FacebookAuthProvider { static PROVIDER_ID = 'facebook.com'; }
export class GithubAuthProvider { static PROVIDER_ID = 'github.com'; }
export class GoogleAuthProvider { static PROVIDER_ID = 'google.com'; }
export class TwitterAuthProvider { static PROVIDER_ID = 'twitter.com'; }
export class OAuthProvider { constructor(public providerId: string) {} }
export class PhoneAuthProvider { static PROVIDER_ID = 'phone'; }
export class OAuthCredential {}
export class RecaptchaVerifier { constructor(..._args: any[]) {} }

export async function applyActionCode(..._args: any[]) { return {}; }
export async function checkActionCode(..._args: any[]) { return {}; }
export async function confirmPasswordReset(..._args: any[]) { return {}; }
export async function verifyPasswordResetCode(..._args: any[]) { return ''; }
export async function sendPasswordResetEmail(..._args: any[]) { return {}; }
export async function signInWithCredential(..._args: any[]) { return { user: null }; }
export async function signInWithPopup(..._args: any[]) { return { user: null }; }
export async function signOut(..._args: any[]) { return {}; }
export async function createUserWithEmailAndPassword(..._args: any[]) { return { user: null }; }
export async function signInWithEmailAndPassword(..._args: any[]) { return { user: null }; }
export async function updateProfile(..._args: any[]) { return {}; }
export async function updatePassword(..._args: any[]) { return {}; }
export async function updateEmail(..._args: any[]) { return {}; }
export async function deleteUser(..._args: any[]) { return {}; }
export const browserLocalPersistence = 'LOCAL';
export const browserSessionPersistence = 'SESSION';
export const inMemoryPersistence = 'NONE';
export const indexedDBLocalPersistence = 'INDEXEDDB';

export async function connectAuthEmulator(..._args: any[]) { return {}; }
export async function fetchSignInMethodsForEmail(..._args: any[]) { return []; }
export function getAdditionalUserInfo(..._args: any[]) { return null; }
export async function getRedirectResult(..._args: any[]) { return null; }
export function isSignInWithEmailLink(..._args: any[]) { return false; }
export async function linkWithPhoneNumber(..._args: any[]) { return { user: null }; }
export async function linkWithPopup(..._args: any[]) { return { user: null }; }
export async function linkWithRedirect(..._args: any[]) { return {}; }
export async function reload(..._args: any[]) { return {}; }
export async function revokeAccessToken(..._args: any[]) { return {}; }
export async function sendEmailVerification(..._args: any[]) { return {}; }
export async function sendSignInLinkToEmail(..._args: any[]) { return {}; }
export async function setPersistence(..._args: any[]) { return {}; }
export async function signInWithCustomToken(..._args: any[]) { return { user: null }; }
export async function signInWithEmailLink(..._args: any[]) { return { user: null }; }
export async function signInWithPhoneNumber(..._args: any[]) { return { user: null }; }
export async function signInWithRedirect(..._args: any[]) { return {}; }
export async function verifyBeforeUpdateEmail(..._args: any[]) { return {}; }
export async function linkWithCredential(..._args: any[]) { return { user: null }; }
export async function unlink(..._args: any[]) { return { user: null }; }
export async function reauthenticateWithCredential(..._args: any[]) { return { user: null }; }

export default {
    auth,
    db,
    storage,
    rtdb,
    messaging
};
