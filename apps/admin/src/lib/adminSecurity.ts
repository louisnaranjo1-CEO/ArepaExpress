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

export const getAdminDeviceId = (): string => {
    let id = localStorage.getItem('deliexpress_admin_device_id');
    if (!id) {
        id = 'dev_adm_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
        localStorage.setItem('deliexpress_admin_device_id', id);
    }
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
 * Verifica si el dispositivo actual se encuentra en la lista de equipos autorizados
 */
export const checkDeviceAuthorization = async (userId: string): Promise<boolean> => {
    const deviceId = getAdminDeviceId();
    try {
        const { data, error } = await supabase
            .from('admin_authorized_devices')
            .select('*')
            .eq('user_id', userId)
            .eq('device_id', deviceId)
            .eq('is_trusted', true)
            .maybeSingle();

        if (error) {
            console.warn("Error al verificar dispositivo autorizado:", error);
            return false;
        }

        if (data) {
            // Actualizar último acceso
            supabase
                .from('admin_authorized_devices')
                .update({ last_active_at: new Date().toISOString() })
                .eq('id', data.id)
                .then(() => {});
            return true;
        }

        return false;
    } catch (e) {
        console.error("Excepción verificando autorización de dispositivo:", e);
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
            return false;
        }

        const cleanDbPin = (data.admin_security_pin || '202600').trim();
        return cleanDbPin === pin.trim();
    } catch (e) {
        console.error("Error validando PIN:", e);
        return false;
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
            console.error("Error autorizando dispositivo:", error);
            return false;
        }

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
 * Revoca el acceso a un dispositivo específico
 */
export const revokeAuthorizedDevice = async (rowId: string, targetDeviceId: string): Promise<boolean> => {
    try {
        const { error } = await supabase
            .from('admin_authorized_devices')
            .delete()
            .eq('id', rowId);

        if (error) throw error;

        // Si se revocó el dispositivo actual, limpiar identificador local
        if (targetDeviceId === getAdminDeviceId()) {
            localStorage.removeItem('deliexpress_admin_device_id');
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
