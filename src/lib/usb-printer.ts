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
        // En un entorno real idealmente se usa un encoder que soporte páginas de códigos de la impresora (ej. CP850).
        // TextEncoder usa UTF-8, lo cual funciona para ASCII básico pero puede fallar con acentos dependiendo de la impresora.
        // Un reemplazo simple de acentos a ASCII ayuda temporalmente:
        const normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
        .text(order.stationName)
        .newline()
        .size('normal')
        .text('------------------------------------------')
        .newline()
        .size('double_height')
        .text(`PEDIDO #${order.id.slice(-4).toUpperCase()}`)
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
    order.items.forEach(item => {
        // Formato: [Q] x [Name]
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
            .bold(true).text('NOTAS: ').newline()
            .bold(false).text(order.orderNote).newline();
    }

    // Footer
    printer.text('------------------------------------------').newline()
        .align('center')
        .text('*** Ticket de Cocina ***')
        .cut();

    return printer.generate();
};

export const requestUsbDevice = async (): Promise<PrinterDevice | null> => {
    try {
        if (!navigator.usb) {
            throw new Error('WebUSB no soportado en este navegador.');
        }

        const device = await navigator.usb.requestDevice({ filters: [] });
        return {
            vendorId: device.vendorId,
            productId: device.productId,
            name: device.productName || 'Impresora Térmica Desconocida'
        };
    } catch (error) {
        console.error("Error solicitando dispositivo USB:", error);
        return null;
    }
};

export const getConnectedDevices = async (): Promise<USBDevice[]> => {
    try {
        if (!navigator.usb) return [];
        return await navigator.usb.getDevices();
    } catch (error) {
        console.error("Error listando dispositivos:", error);
        return [];
    }
};

export const printToUsbDevice = async (vendorId: number, productId: number, dataBytes: Uint8Array): Promise<boolean> => {
    try {
        if (!navigator.usb) throw new Error("WebUSB no soportado");

        const devices = await navigator.usb.getDevices();
        const device = devices.find(d => d.vendorId === vendorId && d.productId === productId);

        if (!device) {
            console.error(`Dispositivo no encontrado (VID: ${vendorId}, PID: ${productId})`);
            return false;
        }

        await device.open();

        if (device.configuration === null) {
            await device.selectConfiguration(1);
        }

        // Generalmente la interfaz 0 es la de la impresora
        await device.claimInterface(0);

        // Buscar el endpoint de salida
        const interfaces = device.configuration?.interfaces;
        if (!interfaces) throw new Error("No interfaces found");

        const endpoints = interfaces[0].alternates[0].endpoints;
        const outEndpoint = endpoints.find(e => e.direction === 'out');

        if (!outEndpoint) {
            throw new Error("No OUT endpoint found");
        }

        await device.transferOut(outEndpoint.endpointNumber, dataBytes);
        await device.close();
        return true;

    } catch (error) {
        console.error("Error imprimiendo en dispositivo USB:", error);
        return false;
    }
};
