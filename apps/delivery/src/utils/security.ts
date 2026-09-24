import { NativeBiometric } from '@capgo/capacitor-native-biometric';

/**
 * Utilidades para autenticación biométrica usando Capacitor Native Biometric.
 * Estas funciones permiten registrar y verificar credenciales nativas (huella, cara, etc.)
 */

export const isIosDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    (window as any).Capacitor?.getPlatform() === 'ios' ||
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    ((navigator as any).platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

export const isBiometricSupported = async (): Promise<{ isAvailable: boolean; biometryType?: any; error?: string }> => {
  try {
    const result = await NativeBiometric.isAvailable();
    return { isAvailable: result.isAvailable, biometryType: result.biometryType };
  } catch (error: any) {
    console.error("Error checking biometric support:", error);
    return { isAvailable: false, error: error.message || "Error desconocido" };
  }
};

export const registerBiometric = async (userId: string, userEmail: string): Promise<{ id: string, type: string } | null> => {
  try {
    console.log("Checking biometric availability...");
    const support = await isBiometricSupported();
    if (!support.isAvailable) {
      throw new Error(support.error || "Biometría no soportada o configurada en este dispositivo.");
    }

    console.log("Requesting identity verification...");
    const isIos = isIosDevice();
    try {
      await NativeBiometric.verifyIdentity({
        reason: isIos ? "Registrar Face ID para acceso seguro" : "Registrar acceso biométrico",
        title: isIos ? "Face ID" : "Seguridad",
        subtitle: isIos ? "Confirma tu rostro para proteger tu cuenta" : "Usa tu huella o rostro para proteger tu cuenta",
        description: isIos ? "Mira fijamente a la cámara para verificar tu Face ID" : "Confirma tu identidad para activar el acceso rápido"
      });
    } catch (e: any) {
      console.error("verifyIdentity failed:", e);
      throw new Error(`Error de verificación: ${e.message || 'El usuario canceló o falló la identificación'}`);
    }

    console.log("Biometric verification successful");
    return {
      id: `bio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'biometric'
    };
  } catch (error: any) {
    console.error("Biometric registration error:", error);
    return null;
  }
};

export const verifyBiometric = async (): Promise<boolean> => {
  try {
    const support = await isBiometricSupported();
    if (!support.isAvailable) {
      throw new Error(support.error || "Biometría no disponible");
    }

    const isIos = isIosDevice();
    await NativeBiometric.verifyIdentity({
      reason: isIos ? "Ingresar con Face ID a Arepa Express" : "Ingresar a Arepa Express",
      title: isIos ? "Face ID" : "Autenticación Biométrica",
      subtitle: isIos ? "Confirma tu rostro con Face ID para ingresar" : "Usa tu huella o rostro para ingresar",
      description: isIos ? "Mira a la cámara para acceder" : "Por favor, verifica tu identidad",
    });

    return true;
  } catch (error: any) {
    console.error("Error verificando biometría:", error);
    throw error;
  }
};


