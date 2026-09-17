import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

/**
 * Utilidades para autenticación biométrica híbrida:
 * - Plataforma Nativa (Capacitor): Usa @capgo/capacitor-native-biometric
 * - Plataforma Web / Móvil PWA (iOS Safari / Chrome Android): Usa WebAuthn (PublicKeyCredential)
 */

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export const isWebAuthnAvailable = async (): Promise<boolean> => {
  try {
    if (typeof window === 'undefined') return false;
    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      console.warn("WebAuthn requires a secure context (HTTPS or localhost).");
      return false;
    }
    if (typeof window.PublicKeyCredential === 'undefined') {
      return false;
    }
    if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
      return false;
    }
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    console.warn("WebAuthn availability check failed:", err);
    return false;
  }
};

export const isBiometricSupported = async (): Promise<{ isAvailable: boolean; type?: 'native' | 'webauthn'; error?: string }> => {
  try {
    // 1. Nativo (Capacitor iOS/Android)
    if (Capacitor.isNativePlatform()) {
      try {
        const result = await NativeBiometric.isAvailable();
        if (result.isAvailable) {
          return { isAvailable: true, type: 'native' };
        }
        return { isAvailable: false, error: "Sensor biométrico nativo no configurado o no disponible." };
      } catch (err: any) {
        return { isAvailable: false, error: err.message || "Error al verificar biometría nativa." };
      }
    }

    // 2. Web Móvil / PWA (Safari iOS, Chrome Android)
    const webAuthnOk = await isWebAuthnAvailable();
    if (webAuthnOk) {
      return { isAvailable: true, type: 'webauthn' };
    }

    return {
      isAvailable: false,
      error: "Este dispositivo no cuenta con Face ID, Touch ID o sensor biométrico activo en el navegador."
    };
  } catch (error: any) {
    console.error("Error checking biometric support:", error);
    return { isAvailable: false, error: error.message || "Error desconocido al verificar biometría" };
  }
};

export const registerBiometric = async (userId: string, userEmail: string): Promise<{ id: string; type: string } | null> => {
  try {
    console.log("Checking biometric availability...");
    const support = await isBiometricSupported();
    if (!support.isAvailable) {
      throw new Error(support.error || "Biometría no soportada o configurada en este dispositivo.");
    }

    // Caso 1: Nativo Capacitor
    if (support.type === 'native' && Capacitor.isNativePlatform()) {
      await NativeBiometric.verifyIdentity({
        reason: "Registrar acceso biométrico",
        title: "Seguridad",
        subtitle: "Usa tu huella o rostro para proteger tu cuenta",
        description: "Confirma tu identidad para activar el acceso rápido"
      });

      const credId = `native_bio_${userId.slice(0, 8)}_${Date.now()}`;
      localStorage.setItem('deliexpress_bio_cred_id', credId);
      return {
        id: credId,
        type: 'native'
      };
    }

    // Caso 2: Web / PWA con WebAuthn (iOS Safari / Chrome Android)
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const encoder = new TextEncoder();
    const userIdBuffer = encoder.encode(userId.slice(0, 32));

    const hostname = window.location.hostname;
    let rpId: string | undefined = undefined;
    if (hostname && hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (hostname.endsWith('.deliexpress.app')) {
        rpId = 'deliexpress.app';
      } else {
        rpId = hostname;
      }
    }

    const creationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'Arepa Express',
        ...(rpId ? { id: rpId } : {})
      },
      user: {
        id: userIdBuffer,
        name: userEmail || 'usuario@deliexpress.app',
        displayName: userEmail ? userEmail.split('@')[0] : 'Usuario Arepa Express'
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },  // ES256 (P-256) Apple FaceID/TouchID standard
        { alg: -257, type: 'public-key' } // RS256 Windows Hello
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    };

    const credential = (await navigator.credentials.create({
      publicKey: creationOptions
    })) as PublicKeyCredential | null;

    if (!credential) {
      throw new Error("No se pudo completar el registro biométrico.");
    }

    const credId = credential.id || bufferToBase64Url(credential.rawId);
    localStorage.setItem('deliexpress_bio_cred_id', credId);

    return {
      id: credId,
      type: 'webauthn'
    };
  } catch (error: any) {
    console.error("Biometric registration error:", error);
    if (
      error.name === 'NotAllowedError' ||
      error.message?.includes('not allowed') ||
      error.message?.includes('canceled') ||
      error.message?.includes('aborted')
    ) {
      throw new Error("Registro biométrico cancelado.");
    }
    throw error;
  }
};

export const verifyBiometric = async (storedCredentialId?: string): Promise<boolean> => {
  try {
    const support = await isBiometricSupported();
    if (!support.isAvailable) {
      throw new Error(support.error || "Biometría no disponible");
    }

    // Caso 1: Nativo Capacitor
    if (support.type === 'native' && Capacitor.isNativePlatform()) {
      await NativeBiometric.verifyIdentity({
        reason: "Ingresar a Arepa Express",
        title: "Autenticación Biométrica",
        subtitle: "Usa tu huella o rostro para ingresar",
        description: "Por favor, verifica tu identidad",
      });
      return true;
    }

    // Caso 2: WebAuthn en móvil web / PWA
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const credId = storedCredentialId || localStorage.getItem('deliexpress_bio_cred_id');

    const hostname = window.location.hostname;
    let rpId: string | undefined = undefined;
    if (hostname && hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (hostname.endsWith('.deliexpress.app')) {
        rpId = 'deliexpress.app';
      } else {
        rpId = hostname;
      }
    }

    let allowCredentialsList: PublicKeyCredentialDescriptor[] | undefined = undefined;
    if (credId && !credId.startsWith('native_bio_')) {
      try {
        allowCredentialsList = [{
          id: base64UrlToBuffer(credId),
          type: 'public-key',
          transports: ['internal']
        }];
      } catch (e) {
        console.warn("No se pudo formatear el ID de credencial guardado:", e);
      }
    }

    const requestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      ...(rpId ? { rpId } : {}),
      userVerification: 'required',
      timeout: 60000,
      ...(allowCredentialsList ? { allowCredentials: allowCredentialsList } : {})
    };

    let assertion: Credential | null = null;
    try {
      assertion = await navigator.credentials.get({
        publicKey: requestOptions
      });
    } catch (firstErr: any) {
      // Si falló por allowCredentials específico, reintentar sin lista de credenciales (discoverable)
      if (allowCredentialsList && (firstErr.name === 'InvalidStateError' || firstErr.name === 'NotAllowedError')) {
        try {
          assertion = await navigator.credentials.get({
            publicKey: {
              challenge,
              ...(rpId ? { rpId } : {}),
              userVerification: 'required',
              timeout: 60000
            }
          });
        } catch {
          throw firstErr;
        }
      } else {
        throw firstErr;
      }
    }

    return assertion !== null;
  } catch (error: any) {
    console.error("Error verificando biometría:", error);
    if (
      error.name === 'NotAllowedError' ||
      error.message?.includes('not allowed') ||
      error.message?.includes('canceled') ||
      error.message?.includes('aborted')
    ) {
      throw new Error("Verificación biométrica cancelada.");
    }
    throw error;
  }
};


