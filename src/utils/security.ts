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

export const registerBiometric = async (userId: string, userEmail: string): Promise<{ id: string } | null> => {
  try {
    const support = await isBiometricSupported();
    if (!support.isAvailable) {
      throw new Error(support.error || "Biometría no soportada o configurada en este dispositivo.");
    }

    const result = await NativeBiometric.verifyIdentity({
      reason: "Configurar acceso biométrico para Arepa Express",
      title: "Autenticación Biométrica",
      subtitle: "Usa tu huella o rostro para proteger tu cuenta",
      description: "Confirma tu identidad para activar el bloqueo biométrico",
    });

    if (result) {
      return { id: `native_${userId}` };
    }
    return null;
  } catch (error: any) {
    console.error("Error registrando biometría:", error);
    throw error; // Throw to handle in the UI and show the message
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


