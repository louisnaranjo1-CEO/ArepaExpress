/**
 * Media compression utility for in-app chat, payment receipts, products and documents.
 * Uses HTML5 Canvas to resize high-resolution camera photos down to web-friendly sizes (<300KB),
 * saving mobile bandwidth, Supabase Storage quota and drastically speeding up uploads.
 */

export interface CompressionOptions {
    maxDimension?: number;
    quality?: number;
    maxSizeBytes?: number;
    format?: 'image/jpeg' | 'image/webp';
}

/**
 * Compresses an image File or Blob if it exceeds 1200px (width or height) or 300KB in size.
 * Resizes proportionally (max 1280px by default) and compresses at 80% quality.
 */
export async function compressImage(
    file: File | Blob,
    options: CompressionOptions = {}
): Promise<File | Blob> {
    const maxDimension = options.maxDimension ?? 1280;
    const quality = options.quality ?? 0.8;
    const maxSizeBytes = options.maxSizeBytes ?? 300 * 1024; // 300KB
    const format = options.format ?? 'image/jpeg';

    // If it's not an image, return original
    if (file.type && !file.type.startsWith('image/')) {
        return file;
    }

    // Safety fallback: if not running in a browser environment with Canvas
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return file;
    }

    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;

            img.onload = () => {
                let { width, height } = img;

                // If already under 300KB and within 1200x1200px, keep original
                if (file.size <= maxSizeBytes && width <= 1200 && height <= 1200) {
                    resolve(file);
                    return;
                }

                // Scale down keeping aspect ratio
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
                    resolve(file);
                    return;
                }

                // Fill white background in case of transparent PNG converted to JPEG
                if (format === 'image/jpeg') {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            if (file instanceof File) {
                                const ext = format === 'image/webp' ? '.webp' : '.jpg';
                                const baseName = file.name.replace(/\.[^/.]+$/, "");
                                const compressedFile = new File([blob], `${baseName}${ext}`, {
                                    type: format,
                                    lastModified: Date.now()
                                });
                                resolve(compressedFile);
                            } else {
                                resolve(blob);
                            }
                        } else {
                            resolve(file);
                        }
                    },
                    format,
                    quality
                );
            };

            img.onerror = () => resolve(file);
        };

        reader.onerror = () => resolve(file);
    });
}

export default compressImage;
