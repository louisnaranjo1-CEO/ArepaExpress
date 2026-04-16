import { NativeBiometric } from '@capgo/capacitor-native-biometric';

/**
 * Utilidades para autenticación biométrica usando Capacitor Native Biometric.
 * Estas funciones permiten registrar y verificar credenciales nativas (huella, cara, etc.)
 */

export const isBiometricSupported = async (): Promise<{ isAvailable: boolean; error?: string }> => {
  try {
    const result = await NativeBiometric.isAvailable();
    return { isAvailable: result.isAvailable };
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
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Registrar acceso biométrico",
        title: "Seguridad",
        subtitle: "Usa tu huella o rostro para proteger tu cuenta",
        description: "Confirma tu identidad para activar el acceso rápido"
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

    await NativeBiometric.verifyIdentity({
      reason: "Ingresar a Arepa Express",
      title: "Autenticación Biométrica",
      subtitle: "Usa tu huella o rostro para ingresar",
      description: "Por favor, verifica tu identidad",
    });

    return true;
  } catch (error: any) {
    console.error("Error verificando biometría:", error);
    throw error;
  }
};


