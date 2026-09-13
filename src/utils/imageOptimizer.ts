/**
 * Image Optimizer Service
 * 
 * Pipeline de 3 capas para optimización de fotos de productos:
 * 1. Pre-compresión local en Canvas (móvil/web): reduce fotos de 8-10MB a ~200KB en <100ms.
 * 2. Invocación de API de Estudio (BiRefNet v2 + Sharp en backend) para recorte y lienzo 1000x1000.
 * 3. Fallback tolerante a fallos si el backend o la IA no están disponibles.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export interface CompressedImageResult {
    file: File;
    dataUrl: string;
    width: number;
    height: number;
    originalSize: number;
    compressedSize: number;
}

export interface StudioProcessResult {
    file: File;
    dataUrl: string;
    isAiCutout: boolean;
    sizeBytes: number;
    message?: string;
}

/**
 * Comprime una imagen en el cliente utilizando Canvas HTML5.
 * Reduce el lado mayor a maxDimension manteniendo la relación de aspecto.
 */
export async function compressClientImage(
    file: File,
    maxDimension: number = 1200,
    quality: number = 0.85
): Promise<CompressedImageResult> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let { width, height } = img;

            // Calcular dimensiones respetando aspect ratio
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round((height * maxDimension) / width);
                    width = maxDimension;
                } else {
                    width = Math.round((width * maxDimension) / height);
                    height = maxDimension;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                reject(new Error('No se pudo obtener el contexto 2D de Canvas'));
                return;
            }

            // Configurar interpolación de alta calidad
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            // Exportar a JPEG comprimido
            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('Error generando Blob comprimido'));
                        return;
                    }

                    const baseName = file.name.replace(/\.[^/.]+$/, "");
                    const compressedFile = new File([blob], `${baseName}_opt.jpg`, {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });

                    const reader = new FileReader();
                    reader.onloadend = () => {
                        resolve({
                            file: compressedFile,
                            dataUrl: reader.result as string,
                            width,
                            height,
                            originalSize: file.size,
                            compressedSize: compressedFile.size,
                        });
                    };
                    reader.readAsDataURL(blob);
                },
                'image/jpeg',
                quality
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Error al cargar la imagen para pre-compresión'));
        };

        img.src = objectUrl;
    });
}

/**
 * Convierte un DataURI (base64) a un objeto File.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

/**
 * Envía la imagen al backend para procesarla con el pipeline de Estudio IA:
 * 1. BiRefNet v2 (si FAL_KEY está configurado)
 * 2. Montaje en lienzo blanco #FFFFFF 1000x1000 con padding y WebP (82% de calidad)
 * 3. Fallback tolerante si el backend no responde
 */
export async function processProductStudioImage(
    file: File,
    onProgress?: (status: string) => void
): Promise<StudioProcessResult> {
    onProgress?.('Comprimiendo imagen en dispositivo...');
    const compressed = await compressClientImage(file, 1200, 0.85);

    onProgress?.('Enviando a Estudio IA (BiRefNet SOTA)...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000); // 35s timeout para inferencia

    try {
        const response = await fetch(`${API_BASE}/api/products/process-image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                imageBase64: compressed.dataUrl,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Error del servidor: ${response.status}`);
        }

        const data = await response.json();
        const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const finalFile = dataUrlToFile(data.processedImageBase64, `${baseName}_studio.webp`);

        return {
            file: finalFile,
            dataUrl: data.processedImageBase64,
            isAiCutout: !!data.isAiCutout,
            sizeBytes: data.sizeBytes || finalFile.size,
            message: data.message,
        };
    } catch (error: any) {
        clearTimeout(timeoutId);
        console.warn('Fallo en endpoint de estudio o backend offline. Usando imagen pre-comprimida como fallback:', error);

        // Fallback: usar la imagen pre-comprimida en el cliente
        return {
            file: compressed.file,
            dataUrl: compressed.dataUrl,
            isAiCutout: false,
            sizeBytes: compressed.compressedSize,
            message: 'Se aplicó pre-compresión rápida (backend no disponible)',
        };
    }
}
