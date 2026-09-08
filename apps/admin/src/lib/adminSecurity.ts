import { supabase } from './supabase';

export interface AuthorizedDevice {
    id: string;
    user_id: string;
    device_id: string;
    device_name: string;
    browser_info?: string;
    ip_address?: string;
    is_trusted: boolean;
    created_at: string;
    last_active_at: string;
}

const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
    return match ? decodeURIComponent(match[3]) : null;
};

const setCookie = (name: string, value: string, days = 365) => {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    const hostname = window.location.hostname;
    // Compartir cookie en todos los subdominios de deliexpress.app (cpanel, admin, etc.)
    const domainPart = hostname.includes('deliexpress.app') ? '; domain=.deliexpress.app' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/${domainPart}; SameSite=Lax`;
};

/**
 * Obtiene el ID único y persistente del dispositivo.
 * Utiliza redundancia dual: LocalStorage + Cookie de 1 año con soporte para subdominios.
 */
export const getAdminDeviceId = (): string => {
    // 1. Intentar leer de localStorage
    let id: string | null = null;
    try {
        id = localStorage.getItem('deliexpress_admin_device_id');
    } catch (e) {
        console.warn("No se pudo acceder a localStorage:", e);
    }

    // 2. Si no está en localStorage, intentar recuperar de Cookie
    if (!id) {
        id = getCookie('deliexpress_admin_device_id');
        if (id) {
            try {
                localStorage.setItem('deliexpress_admin_device_id', id);
            } catch (e) {}
        }
    }

    // 3. Si aún no existe, generar nuevo ID y persistir en ambos almacenamientos
    if (!id) {
        id = 'dev_adm_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
        try {
            localStorage.setItem('deliexpress_admin_device_id', id);
        } catch (e) {}
    }

    // Mantener la cookie siempre fresca y sincronizada
    setCookie('deliexpress_admin_device_id', id);

    return id;
};

export const getDeviceMetadata = () => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    let os = "Dispositivo";
    if (ua.indexOf("Win") !== -1) os = "Windows PC";
    else if (ua.indexOf("Mac") !== -1) os = "Mac";
    else if (ua.indexOf("iPhone") !== -1) os = "iPhone";
    else if (ua.indexOf("iPad") !== -1) os = "iPad";
    else if (ua.indexOf("Android") !== -1) os = "Android";
    else if (ua.indexOf("Linux") !== -1) os = "Linux";

    let browser = "Navegador Web";
    if (ua.indexOf("Edg") !== -1) browser = "Edge";
    else if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
    else if (ua.indexOf("Safari") !== -1) browser = "Safari";
    else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";

    return {
        name: `${os} (${browser})`,
        browserInfo: `${browser} en ${os}`,
        userAgent: ua
    };
};

/**
 * Verifica si el dispositivo actual se encuentra en la lista de equipos autorizados.
 * Incluye tolerancia a latencia y respaldo de confianza local para evitar cierres falsos por latencia de red.
 */
export const checkDeviceAuthorization = async (userId: string): Promise<boolean> => {
    const deviceId = getAdminDeviceId();
    const sessionKey = `admin_auth_${userId}_${deviceId}`;
    const localTrustKey = `admin_trusted_${userId}_${deviceId}`;

    const isSessionAuth = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(sessionKey) === 'true';
    const isLocalTrusted = typeof localStorage !== 'undefined' && localStorage.getItem(localTrustKey) === 'true';

    try {
        const queryPromise = supabase
            .from('admin_authorized_devices')
            .select('*')
            .eq('user_id', userId)
            .eq('device_id', deviceId)
            .eq('is_trusted', true)
            .maybeSingle();

        // Tiempo de espera defensivo de 8 segundos (amplio para redes móviles)
        const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) => 
            setTimeout(() => resolve({ data: null, error: new Error('TIMEOUT') }), 8000)
        );

        const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

        if (!error && data) {
            // Dispositivo confirmado por la base de datos
            try {
                sessionStorage.setItem(sessionKey, 'true');
                localStorage.setItem(localTrustKey, 'true');
            } catch (e) {}

            // Actualizar último acceso en segundo plano
            supabase
                .from('admin_authorized_devices')
                .update({ last_active_at: new Date().toISOString() })
                .eq('id', data.id)
                .then(() => {});

            return true;
        }

        // Si la base de datos respondió que NO existe registro alguno (no hubo error, data es null)
        if (!error && !data) {
            try {
                sessionStorage.removeItem(sessionKey);
                localStorage.removeItem(localTrustKey);
            } catch (e) {}
            return false;
        }

        // Si hubo TIMEOUT o error de red pero el dispositivo ya estaba verificado en esta máquina
        if (error && (isSessionAuth || isLocalTrusted)) {
            console.warn("Verificación con Supabase demorada o sin conexión. Manteniendo sesión autorizada.");
            return true;
        }

        return false;
    } catch (e) {
        console.error("Excepción verificando autorización de dispositivo:", e);
        if (isSessionAuth || isLocalTrusted) return true;
        return false;
    }
};

/**
 * Valida el Código Maestro de Seguridad del administrador
 */
export const verifyMasterSecurityPin = async (userId: string, pin: string): Promise<boolean> => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('admin_security_pin')
            .eq('id', userId)
            .maybeSingle();

        if (error || !data) {
            console.error("Error al obtener PIN de seguridad:", error);
            // Fallback al PIN inicial 202600 si la base de datos tarda en responder
            return pin.trim() === '202600';
        }

        const cleanDbPin = (data.admin_security_pin || '202600').trim();
        return cleanDbPin === pin.trim();
    } catch (e) {
        console.error("Error validando PIN:", e);
        return pin.trim() === '202600';
    }
};

/**
 * Registra y aprueba el dispositivo actual en la base de datos
 */
export const authorizeCurrentDevice = async (userId: string, customName?: string): Promise<boolean> => {
    const deviceId = getAdminDeviceId();
    const meta = getDeviceMetadata();
    const finalName = customName?.trim() || meta.name;

    try {
        const { error } = await supabase
            .from('admin_authorized_devices')
            .upsert({
                user_id: userId,
                device_id: deviceId,
                device_name: finalName,
                browser_info: meta.browserInfo,
                is_trusted: true,
                last_active_at: new Date().toISOString()
            }, { onConflict: 'user_id,device_id' });

        if (error) {
            console.error("Error autorizando dispositivo en base de datos:", error);
            return false;
        }

        // Marcar confianza local inmediata
        const sessionKey = `admin_auth_${userId}_${deviceId}`;
        const localTrustKey = `admin_trusted_${userId}_${deviceId}`;
        try {
            sessionStorage.setItem(sessionKey, 'true');
            localStorage.setItem(localTrustKey, 'true');
        } catch (e) {}

        return true;
    } catch (e) {
        console.error("Excepción autorizando dispositivo:", e);
        return false;
    }
};

/**
 * Obtiene la lista de todos los dispositivos autorizados para este administrador
 */
export const getAuthorizedDevices = async (userId: string): Promise<AuthorizedDevice[]> => {
    try {
        const { data, error } = await supabase
            .from('admin_authorized_devices')
            .select('*')
            .eq('user_id', userId)
            .order('last_active_at', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error("Error listando dispositivos:", e);
        return [];
    }
};

/**
 * Permite cambiar el nombre asignado a un dispositivo en la lista
 */
export const renameAuthorizedDevice = async (rowId: string, newName: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('admin_authorized_devices')
            .update({ device_name: newName.trim() })
            .eq('id', rowId);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error renombrando dispositivo:", e);
        return false;
    }
};

/**
 * Revoca el acceso a un dispositivo específico
 */
export const revokeAuthorizedDevice = async (rowId: string, targetDeviceId: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('admin_authorized_devices')
            .delete()
            .eq('id', rowId);

        if (error) throw error;

        // Si se revocó el dispositivo actual, limpiar identificador local y marcas de confianza
        if (targetDeviceId === getAdminDeviceId()) {
            try {
                localStorage.removeItem('deliexpress_admin_device_id');
                sessionStorage.clear();
            } catch (e) {}
            setCookie('deliexpress_admin_device_id', '', -1);
        }

        return true;
    } catch (e) {
        console.error("Error revocando dispositivo:", e);
        return false;
    }
};

/**
 * Actualiza el PIN Maestro de Seguridad en el perfil del administrador
 */
export const updateAdminSecurityPin = async (userId: string, newPin: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ admin_security_pin: newPin.trim() })
            .eq('id', userId);

        if (error) throw error;
        return true;
    } catch (e) {
        console.error("Error actualizando PIN:", e);
        return false;
    }
};
