// @ts-nocheck
// WebUSB Types (basic polyfill for TS)
declare global {
    interface Navigator {
        usb?: {
            requestDevice(options: { filters: any[] }): Promise<any>;
            getDevices(): Promise<any[]>;
        };
    }
}

export interface PrinterDevice {
    vendorId: number;
    productId: number;
    name: string;
}

export interface PrintItem {
    name: string;
    quantity: number;
    price?: number;
    notes?: string;
    category?: string;
}

export interface PrintOrder {
    id: string;
    userName?: string;
    userPhone?: string;
    items: PrintItem[];
    total?: number;
    orderNote?: string;
    tableNumber?: string;
    stationName: string;
    createdAt?: Date;
}

export interface PrinterTarget {
    id?: string;
    name?: string;
    type?: string;
    vendorId?: number | null;
    productId?: number | null;
    vendor_id?: number | null;
    product_id?: number | null;
    ipAddress?: string | null;
    ip_address?: string | null;
    categories?: string[];
    is_active?: boolean;
}

// RFC4122 version 4 compliant UUID generator for Android WebViews & non-secure contexts
export const generateUUID = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (_) {}
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

// ESC/POS Commands
const CMD = {
    INIT: [0x1b, 0x40],
    ALIGN_LEFT: [0x1b, 0x61, 0x00],
    ALIGN_CENTER: [0x1b, 0x61, 0x01],
    ALIGN_RIGHT: [0x1b, 0x61, 0x02],
    BOLD_ON: [0x1b, 0x45, 0x01],
    BOLD_OFF: [0x1b, 0x45, 0x00],
    TEXT_NORMAL: [0x1d, 0x21, 0x00],
    TEXT_DOUBLE_HEIGHT: [0x1d, 0x21, 0x01],
    TEXT_DOUBLE_WIDTH: [0x1d, 0x21, 0x10],
    TEXT_DOUBLE: [0x1d, 0x21, 0x11], // height and width
    CUT_PAPER: [0x1d, 0x56, 0x41, 0x03],
    NEWLINE: 0x0a,
};

class ESCPOSGenerator {
    private buffer: number[] = [];
    private encoder = new TextEncoder();

    constructor() {
        this.add(CMD.INIT);
    }

    private add(data: number | number[] | Uint8Array) {
        if (typeof data === 'number') {
            this.buffer.push(data);
        } else if (Array.isArray(data)) {
            this.buffer.push(...data);
        } else {
            for (let i = 0; i < data.length; i++) {
                this.buffer.push(data[i]);
            }
        }
    }

    text(str: string) {
        const normalized = (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        this.add(this.encoder.encode(normalized));
        return this;
    }

    newline() {
        this.add(CMD.NEWLINE);
        return this;
    }

    align(mode: 'left' | 'center' | 'right') {
        if (mode === 'center') this.add(CMD.ALIGN_CENTER);
        else if (mode === 'right') this.add(CMD.ALIGN_RIGHT);
        else this.add(CMD.ALIGN_LEFT);
        return this;
    }

    bold(on: boolean) {
        this.add(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
        return this;
    }

    size(mode: 'normal' | 'double_height' | 'double_width' | 'double') {
        if (mode === 'double_height') this.add(CMD.TEXT_DOUBLE_HEIGHT);
        else if (mode === 'double_width') this.add(CMD.TEXT_DOUBLE_WIDTH);
        else if (mode === 'double') this.add(CMD.TEXT_DOUBLE);
        else this.add(CMD.TEXT_NORMAL);
        return this;
    }

    cut() {
        this.newline();
        this.newline();
        this.newline();
        this.add(CMD.CUT_PAPER);
        return this;
    }

    generate(): Uint8Array {
        return new Uint8Array(this.buffer);
    }
}

export const formatTicket = (order: PrintOrder): Uint8Array => {
    const printer = new ESCPOSGenerator();

    // Header
    printer.align('center')
        .size('double')
        .bold(true)
        .text(order.stationName || 'ESTACION DE COMANDA')
        .newline()
        .size('normal')
        .text('------------------------------------------')
        .newline()
        .size('double_height')
        .text(`PEDIDO #${(order.id || '').slice(-4).toUpperCase()}`)
        .newline()
        .size('normal');

    if (order.tableNumber) {
        printer.newline()
            .size('double')
            .text(`MESA: ${order.tableNumber}`)
            .newline()
            .size('normal');
    } else {
        printer.newline()
            .size('double')
            .text('PARA LLEVAR')
            .newline()
            .size('normal');
    }

    const date = order.createdAt || new Date();
    printer.text(`${date.toLocaleDateString()} - ${date.toLocaleTimeString()}`)
        .newline()
        .text('------------------------------------------')
        .newline()
        .align('left');

    // Client Info
    printer.bold(true).text('CLIENTE: ').bold(false).text(order.userName || 'Cliente General').newline();
    if (order.userPhone) {
        printer.bold(true).text('TEL: ').bold(false).text(order.userPhone).newline();
    }
    printer.text('------------------------------------------').newline();

    // Items
    printer.size('double_height');
    (order.items || []).forEach(item => {
        printer.bold(true)
            .text(`${item.quantity} `)
            .bold(false)
            .text(`x ${item.name}`)
            .newline();
    });
    printer.size('normal');

    // Notes
    if (order.orderNote) {
        printer.text('------------------------------------------').newline()
            .bold(true).text('NOTAS: ').bold(false).text(order.orderNote).newline();
    }

    // Footer
    printer.text('------------------------------------------').newline()
        .align('center')
        .text('*** Comanda de Preparacion ***')
        .cut();

    return printer.generate();
};

export const formatTicketText = (order: PrintOrder): string => {
    let result = '';
    result += `${order.stationName || 'Comanda'}\n`;
    result += `------------------------------------------\n`;
    result += `PEDIDO #${(order.id || '').slice(-4).toUpperCase()}\n`;
    
    if (order.tableNumber) {
        result += `MESA: ${order.tableNumber}\n`;
    } else {
        result += `PARA LLEVAR\n`;
    }
    
    const date = order.createdAt || new Date();
    result += `${date.toLocaleDateString()} - ${date.toLocaleTimeString()}\n`;
    result += `------------------------------------------\n`;
    result += `CLIENTE: ${order.userName || 'Cliente General'}\n`;
    if (order.userPhone) {
        result += `TEL: ${order.userPhone}\n`;
    }
    result += `------------------------------------------\n`;
    
    (order.items || []).forEach(item => {
        result += `${item.quantity} x ${item.name}\n`;
    });
    
    if (order.orderNote) {
        result += `------------------------------------------\n`;
        result += `NOTAS:\n${order.orderNote}\n`;
    }
    
    result += `------------------------------------------\n`;
    result += `*** Comanda de Preparacion ***\n`;
    
    return result;
};

export const downloadTicketText = (order: PrintOrder) => {
    try {
        const textData = formatTicketText(order);
        const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Comanda-${(order.stationName || 'Cocina').replace(/\s+/g, '')}-${(order.id || '0000').slice(-4).toUpperCase()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        console.warn("[Printer] Error descargando comanda de texto:", e);
    }
};

export const downloadTicketImage = (order: PrintOrder) => {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = 450;
        let height = 320; 
        height += (order.items || []).length * 30; 
        if (order.orderNote) height += 80 + order.orderNote.split('\n').length * 24;
        
        canvas.width = width;
        canvas.height = height;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#000000';
        let y = 40;
        let lineSpacing = 24;
        
        const drawText = (text: string, align: 'left' | 'center' = 'left', bold: boolean = false, size: number = 16) => {
            ctx.font = `${bold ? '900 ' : '500 '}${size}px Courier New, monospace`;
            if (align === 'center') {
                const textWidth = ctx.measureText(text).width;
                ctx.fillText(text, (width - textWidth) / 2, y);
            } else {
                ctx.fillText(text, 20, y);
            }
            y += lineSpacing;
        };
        
        const drawDivider = () => {
            drawText('------------------------------------', 'center', false, 18);
        };

        drawText(order.stationName || 'Comanda', 'center', true, 22);
        drawDivider();
        drawText(`PEDIDO #${(order.id || '').slice(-4).toUpperCase()}`, 'center', true, 26);
        lineSpacing = 30;
        
        if (order.tableNumber) {
            drawText(`MESA: ${order.tableNumber}`, 'center', true, 22);
        } else {
            drawText(`PARA LLEVAR`, 'center', true, 22);
        }
        
        lineSpacing = 24;
        const date = order.createdAt || new Date();
        drawText(`${date.toLocaleDateString()} - ${date.toLocaleTimeString()}`, 'center', false, 14);
        drawDivider();
        
        drawText(`CLIENTE: ${order.userName || 'Cliente General'}`, 'left', true, 16);
        if (order.userPhone) {
            drawText(`TEL: ${order.userPhone}`, 'left', false, 16);
        }
        drawDivider();
        
        lineSpacing = 30;
        (order.items || []).forEach(item => {
            drawText(`${item.quantity} x ${item.name}`, 'left', true, 18);
        });
        
        if (order.orderNote) {
            lineSpacing = 24;
            drawDivider();
            drawText('NOTAS:', 'left', true, 16);
            const lines = order.orderNote.split('\n');
            lines.forEach(line => {
                drawText(line, 'left', false, 16);
            });
        }
        
        lineSpacing = 24;
        drawDivider();
        drawText('*** Comanda de Preparacion ***', 'center', false, 16);
        
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `Comanda-${(order.stationName || 'Cocina')}-${(order.id || '0000').slice(-4)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (e) {
        console.warn("[Printer] Error generando ticket de imagen:", e);
    }
};

/**
 * Checks whether WebUSB is supported in the current environment / WebView.
 * Native Android WebViews typically lack WebUSB support unless a native plugin is used.
 */
export const isUsbSupported = (): boolean => {
    return typeof navigator !== 'undefined' && 'usb' in navigator && !!navigator.usb;
};

/**
 * Requests access to a USB device via WebUSB.
 * Fails safely returning null if WebUSB is unsupported or user rejects.
 */
export const requestUsbDevice = async (): Promise<PrinterDevice | null> => {
    try {
        if (!isUsbSupported()) {
            console.warn("[Printer] WebUSB no soportado en este navegador/WebView nativo.");
            return null;
        }

        const device = await navigator.usb!.requestDevice({ filters: [] });
        return {
            vendorId: device.vendorId,
            productId: device.productId,
            name: device.productName || 'Impresora Termica Desconocida'
        };
    } catch (error) {
        console.warn("[Printer] Solicitud de dispositivo USB cancelada o no permitida:", error);
        return null;
    }
};

/**
 * Lists previously paired USB devices.
 */
export const getConnectedDevices = async (): Promise<any[]> => {
    try {
        if (!isUsbSupported()) return [];
        return await navigator.usb!.getDevices();
    } catch (error) {
        console.warn("[Printer] Error listando dispositivos USB:", error);
        return [];
    }
};

/**
 * Prints raw ESC/POS byte array to a USB printer with robust error handling.
 * Never throws unhandled exceptions; returns boolean and does not block checkout.
 */
export const printToUsbDevice = async (vendorId: number, productId: number, dataBytes: Uint8Array): Promise<boolean> => {
    if (!isUsbSupported()) {
        console.warn(`[Printer] WebUSB no disponible en este WebView de Android. Omitiendo impresion USB (VID: ${vendorId}, PID: ${productId}).`);
        return false;
    }

    let device: any = null;
    try {
        const devices = await navigator.usb!.getDevices();
        device = devices.find(d => d.vendorId === vendorId && d.productId === productId);

        if (!device) {
            try {
                device = await navigator.usb!.requestDevice({
                    filters: [{ vendorId, productId }]
                });
            } catch (err) {
                console.warn("[Printer] Permiso USB denegado o dispositivo no seleccionado:", err);
            }
        }

        if (!device) {
            console.warn(`[Printer] Dispositivo USB no encontrado (VID: ${vendorId}, PID: ${productId})`);
            return false;
        }

        await device.open();

        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        await device.claimInterface(0);

        const interfaces = device.configuration?.interfaces;
        if (!interfaces || interfaces.length === 0) {
            throw new Error("No USB interfaces found");
        }

        const endpoints = interfaces[0].alternates[0].endpoints;
        const outEndpoint = endpoints.find((e: any) => e.direction === 'out');

        if (!outEndpoint) {
            throw new Error("No OUT endpoint found on USB printer");
        }

        await device.transferOut(outEndpoint.endpointNumber, dataBytes);
        return true;
    } catch (error: any) {
        console.warn("[Printer] Error no bloqueante al imprimir en dispositivo USB:", error?.message || error);
        return false;
    } finally {
        if (device && device.opened) {
            try {
                await device.close();
            } catch (_) {}
        }
    }
};

/**
 * Prints raw ESC/POS byte array to a local network thermal printer (ESC/POS over IP)
 * with a strict 4000ms timeout using AbortController.
 * Does not block order closing if printer is offline, disconnected or unreachable.
 */
export const printToNetworkDevice = async (
    ipAddress: string,
    dataBytes: Uint8Array,
    options: { port?: number; timeoutMs?: number } = {}
): Promise<boolean> => {
    const { port, timeoutMs = 4000 } = options;

    if (!ipAddress || typeof ipAddress !== 'string' || !ipAddress.trim()) {
        console.warn("[Printer] Direccion IP de impresora no especificada o invalida.");
        return false;
    }

    const trimmed = ipAddress.trim();
    const cleanHost = trimmed.replace(/^https?:\/\//, '').split('/')[0];
    const targetPort = port || (cleanHost.includes(':') ? parseInt(cleanHost.split(':')[1], 10) : 9100);
    const hostOnly = cleanHost.includes(':') ? cleanHost.split(':')[0] : cleanHost;

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const targetUrl = `http://${hostOnly}:${targetPort}/`;
        console.log(`[Printer] Conectando a impresora de red IP: ${targetUrl} (timeout: ${timeoutMs}ms)...`);

        await fetch(targetUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/octet-stream'
            },
            body: dataBytes,
            signal: controller.signal
        });

        clearTimeout(timeoutTimer);
        console.log(`[Printer] Impresion de red enviada con exito a ${hostOnly}:${targetPort}`);
        return true;
    } catch (error: any) {
        clearTimeout(timeoutTimer);
        if (error.name === 'AbortError' || controller.signal.aborted) {
            console.warn(`[Printer] Timeout de ${timeoutMs}ms agotado al comunicar con impresora IP (${hostOnly}). Se continua sin bloquear la orden.`);
        } else {
            console.warn(`[Printer] Fallo de comunicacion con impresora IP (${hostOnly}):`, error?.message || error);
        }
        return false;
    }
};

/**
 * Unified printer dispatcher that routes printing to Network (IP) or USB
 * according to the printer configuration, ensuring failures never block checkout.
 */
export const printToPrinterDevice = async (
    printer: PrinterTarget,
    dataBytes: Uint8Array,
    options: { timeoutMs?: number } = {}
): Promise<boolean> => {
    if (!printer) return false;

    const ip = printer.ipAddress || printer.ip_address;
    const vId = printer.vendorId ?? printer.vendor_id;
    const pId = printer.productId ?? printer.product_id;

    // 1. Prioritize network IP printing if configured
    if (ip && typeof ip === 'string' && ip.trim()) {
        const netSuccess = await printToNetworkDevice(ip, dataBytes, { timeoutMs: options.timeoutMs ?? 4000 });
        if (netSuccess) return true;
        // If IP fails, fall back to USB if device has VID/PID
        if (!vId || !pId) return false;
    }

    // 2. Fall back or route to USB if VID/PID are present
    if (vId != null && pId != null && vId > 0 && pId > 0) {
        return await printToUsbDevice(Number(vId), Number(pId), dataBytes);
    }

    console.warn(`[Printer] Impresora '${printer.name || 'Sin nombre'}' no tiene IP valida ni VID/PID USB configurado.`);
    return false;
};
