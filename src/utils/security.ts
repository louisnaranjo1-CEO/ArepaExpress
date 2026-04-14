/**
 * Utilidades para autenticación biométrica usando la API de WebAuthn.
 * Estas funciones permiten registrar y verificar credenciales locales (huella, cara, etc.)
 */

export const isBiometricSupported = async (): Promise<boolean> => {
  if (!window.PublicKeyCredential) return false;
  
  // Verificar si el dispositivo soporta autenticadores de plataforma (TouchID, FaceID, etc.)
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
};

export const registerBiometric = async (userEmail: string): Promise<string | null> => {
  try {
    const isSupported = await isBiometricSupported();
    if (!isSupported) throw new Error("Biometría no soportada en este dispositivo.");

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const publicKeyOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "Arepa Express",
        id: window.location.hostname === 'localhost' ? 'localhost' : window.location.hostname,
      },
      user: {
        id: userId,
        name: userEmail,
        displayName: userEmail,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    };

    const credential = (await navigator.credentials.create({
      publicKey: publicKeyOptions,
    })) as PublicKeyCredential;

    return credential?.id || null;
  } catch (error) {
    console.error("Error registrando biometría:", error);
    return null;
  }
};

export const verifyBiometric = async (credentialId: string): Promise<boolean> => {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    
    // Convertir el ID de la credencial de string a buffer
    // Nota: WebAuthn usa IDs en formato binario internamente, pero el 'id' retornado es un string (id base64url)
    // Para 'get', necesitamos el allowCredentials con el id original.
    // Usaremos el decoder de base64url si es necesario, pero navigator.credentials.get acepta strings en algunos contextos? No, requiere Uint8Array.
    
    const publicKeyOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      allowCredentials: [
        {
          id: strToBuffer(credentialId),
          type: "public-key",
        },
      ],
      userVerification: "required",
      timeout: 60000,
    };

    await navigator.credentials.get({
      publicKey: publicKeyOptions,
    });

    return true; // Si no lanzó error, es exitoso
  } catch (error) {
    console.error("Error verificando biometría:", error);
    return false;
  }
};

// Helper para convertir string (ID) a buffer
function strToBuffer(str: string): Uint8Array {
  // El ID retornado por WebAuthn es base64url encoded.
  const binaryString = window.atob(str.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
