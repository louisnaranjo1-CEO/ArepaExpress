/**
 * Sistema de Tarifas Dinámicas Inteligentes (Estilo Yango / Uber)
 * Deliexpress - Cálculo de tarifas para Delivery Restaurante y Taxi (Moto, Standard, Ejecutivo)
 */

export interface ServicePricingConfig {
    baseFare: number;       // Tarifa mínima / arranque en USD (ej. 1.50)
    baseKm: number;         // Kilómetros incluidos en la tarifa base (ej. 2.0 km)
    pricePerKm: number;     // Costo por cada km adicional en USD (ej. 0.50)
    driverCutPercent: number; // Porcentaje que recibe el piloto/conductor (ej. 80 para 80%)
}

export interface DynamicFactorsConfig {
    rainModeActive: boolean;              // Switch manual o automático de lluvia
    rainSurchargePercent: number;         // % de recargo por lluvia (ej. 25%)
    dynamicDemandActive: boolean;         // Ajuste automático por unidades en línea
    lowSupplySurchargePercent: number;    // % si hay 1 o 2 unidades disponibles (ej. 15%)
    criticalSupplySurchargePercent: number; // % si hay 0 unidades disponibles (ej. 30%)
    nightShift: {
        enabled: boolean;
        start: string;                    // ej. "20:00"
        end: string;                      // ej. "06:00"
        surchargePercent: number;         // % de recargo nocturno (ej. 20%)
    };
}

export interface SmartPricingSettings {
    pricingModel?: 'smart' | 'legacy';
    delivery: ServicePricingConfig;
    transport: {
        moto: ServicePricingConfig;
        carro: ServicePricingConfig;
        ejecutivo: ServicePricingConfig;
    };
    dynamicFactors: DynamicFactorsConfig;
    // Retrocompatibilidad con campos antiguos si existen
    dayShift?: any;
    nightShift?: any;
    transportRates?: any;
    deliveryRadius?: number;
    whatsappMessageTemplate?: string;
}

export const DEFAULT_PRICING_SETTINGS: SmartPricingSettings = {
    pricingModel: 'smart',
    delivery: {
        baseFare: 1.50,
        baseKm: 2.0,
        pricePerKm: 0.50,
        driverCutPercent: 80 // Conductor recibe $1.20 base + $0.40/km
    },
    transport: {
        moto: {
            baseFare: 1.80,
            baseKm: 2.0,
            pricePerKm: 0.50,
            driverCutPercent: 85 // Conductor recibe $1.53 base + $0.42/km
        },
        carro: {
            baseFare: 3.00,
            baseKm: 2.0,
            pricePerKm: 0.80,
            driverCutPercent: 85 // Conductor recibe $2.55 base + $0.68/km
        },
        ejecutivo: {
            baseFare: 5.00,
            baseKm: 2.0,
            pricePerKm: 1.20,
            driverCutPercent: 85 // Conductor recibe $4.25 base + $1.02/km
        }
    },
    dynamicFactors: {
        rainModeActive: false,
        rainSurchargePercent: 25,
        dynamicDemandActive: true,
        lowSupplySurchargePercent: 15,
        criticalSupplySurchargePercent: 30,
        nightShift: {
            enabled: true,
            start: "20:00",
            end: "06:00",
            surchargePercent: 20
        }
    },
    deliveryRadius: 15
};

export interface FareCalculationResult {
    clientTotal: number;
    driverPayout: number;
    platformFee: number;
    basePrice: number;
    distancePrice: number;
    surgeMultiplier: number;
    activeFactors: {
        isRain: boolean;
        rainPercent: number;
        isNight: boolean;
        nightPercent: number;
        demandLevel: 'normal' | 'low_supply' | 'critical_supply';
        demandPercent: number;
    };
}

/**
 * Verifica si una hora actual (HH:MM) está dentro de un rango horario.
 */
export function isCurrentTimeInShift(startStr: string = "20:00", endStr: string = "06:00"): boolean {
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const [sH, sM] = startStr.split(':').map(Number);
    const [eH, eM] = endStr.split(':').map(Number);
    const startMin = (sH || 0) * 60 + (sM || 0);
    const endMin = (eH || 0) * 60 + (eM || 0);

    if (startMin <= endMin) {
        return currentMin >= startMin && currentMin <= endMin;
    }
    // Cruce de medianoche (ej. 20:00 a 06:00)
    return currentMin >= startMin || currentMin <= endMin;
}

/**
 * Calcula la tarifa exacta y justa para cualquier servicio (delivery, moto, carro, ejecutivo)
 * aplicando la fórmula base más los multiplicadores dinámicos estilo Yango.
 */
export function calculateDynamicFare(params: {
    serviceType: 'delivery' | 'moto' | 'carro' | 'ejecutivo';
    distanceKm: number;
    settings?: any;
    availableDriversCount?: number;
    forceRain?: boolean;
    forceNight?: boolean;
}): FareCalculationResult {
    const {
        serviceType,
        distanceKm,
        settings,
        availableDriversCount,
        forceRain,
        forceNight
    } = params;

    const safeDistance = Math.max(0.1, Number(distanceKm) || 1.0);

    // Obtener la configuración del servicio
    let serviceConfig: ServicePricingConfig;
    const smartSettings: SmartPricingSettings = {
        ...DEFAULT_PRICING_SETTINGS,
        ...(settings || {})
    };

    if (serviceType === 'delivery') {
        serviceConfig = smartSettings.delivery || DEFAULT_PRICING_SETTINGS.delivery;
    } else {
        serviceConfig = smartSettings.transport?.[serviceType] || DEFAULT_PRICING_SETTINGS.transport[serviceType];
    }

    // 1. Tarifa Base + Km Adicionales
    const baseFare = Number(serviceConfig.baseFare) || 1.5;
    const baseKm = Number(serviceConfig.baseKm) || 2.0;
    const pricePerKm = Number(serviceConfig.pricePerKm) || 0.5;
    const driverCut = Number(serviceConfig.driverCutPercent) || 80;

    const additionalKm = Math.max(0, safeDistance - baseKm);
    const distancePrice = Number((additionalKm * pricePerKm).toFixed(2));
    const basePrice = Number(baseFare.toFixed(2));
    const rawSubtotal = basePrice + distancePrice;

    // 2. Factores Dinámicos: Por especificación, el clima ni el tráfico afectan a la tarifa.
    // El clima se monitorea en pantalla como valor informativo en tiempo real pero no infla los precios.
    const dyn = smartSettings.dynamicFactors || DEFAULT_PRICING_SETTINGS.dynamicFactors || ({} as any);
    const isRain = forceRain !== undefined ? forceRain : Boolean(dyn.rainModeActive);
    const isNight = forceNight !== undefined
        ? forceNight
        : Boolean(dyn.nightShift?.enabled && isCurrentTimeInShift(dyn.nightShift?.start, dyn.nightShift?.end));

    const surgeMultiplier = 1.0;

    // 3. Totales
    const clientTotal = Number((rawSubtotal * surgeMultiplier).toFixed(2));
    const baseDriverPayout = (clientTotal * (driverCut / 100));
    const driverPayout = Number(baseDriverPayout.toFixed(2));
    const platformFee = Number(Math.max(0, clientTotal - driverPayout).toFixed(2));

    return {
        clientTotal,
        driverPayout,
        platformFee,
        basePrice,
        distancePrice,
        surgeMultiplier,
        activeFactors: {
            isRain,
            rainPercent: 0,
            isNight,
            nightPercent: 0,
            demandLevel: 'normal',
            demandPercent: 0
        }
    };
}
