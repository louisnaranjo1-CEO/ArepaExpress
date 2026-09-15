// Servicio del Clima en Tiempo Real (Open-Meteo API)
// Compatible con coordenadas de Venezuela y el mundo. Sin claves API ni cuotas restrictivas.

export interface WeatherInfo {
    temperature: number;          // °C
    apparentTemperature: number;  // °C (Sensación térmica)
    humidity: number;             // %
    windSpeed: number;            // km/h
    weatherCode: number;          // WMO Code
    conditionText: string;        // Descripción en español
    conditionEmoji: string;       // Emoji representativo
    isRaining: boolean;           // True si llueve en este momento
    rainProbability: number;      // % de probabilidad en la hora actual
    isDay: boolean;               // True si es de día según sol
    precipitationMm: number;      // mm de precipitación actual
    cityName?: string;
    updatedAt: string;
}

// Mapeo WMO (Organización Meteorológica Mundial) en Español
export function interpretWeatherCode(code: number): { text: string; emoji: string; isRaining: boolean } {
    switch (code) {
        case 0:
            return { text: 'Cielo despejado', emoji: '☀️', isRaining: false };
        case 1:
            return { text: 'Mayormente soleado', emoji: '🌤️', isRaining: false };
        case 2:
            return { text: 'Parcialmente nublado', emoji: '⛅', isRaining: false };
        case 3:
            return { text: 'Nublado', emoji: '☁️', isRaining: false };
        case 45:
        case 48:
            return { text: 'Niebla / Neblina', emoji: '🌫️', isRaining: false };
        case 51:
            return { text: 'Llovizna ligera', emoji: '🌦️', isRaining: true };
        case 53:
            return { text: 'Llovizna moderada', emoji: '🌦️', isRaining: true };
        case 55:
            return { text: 'Llovizna densa', emoji: '🌧️', isRaining: true };
        case 56:
        case 57:
            return { text: 'Llovizna helada', emoji: '🌧️', isRaining: true };
        case 61:
            return { text: 'Lluvia ligera', emoji: '🌧️', isRaining: true };
        case 63:
            return { text: 'Lluvia moderada', emoji: '🌧️', isRaining: true };
        case 65:
            return { text: 'Lluvia fuerte', emoji: '🌧️', isRaining: true };
        case 66:
        case 67:
            return { text: 'Lluvia helada', emoji: '🌧️', isRaining: true };
        case 71:
        case 73:
        case 75:
            return { text: 'Nevada ligera a intensa', emoji: '🌨️', isRaining: false };
        case 80:
            return { text: 'Chubascos ligeros', emoji: '🌦️', isRaining: true };
        case 81:
            return { text: 'Chubascos moderados', emoji: '🌧️', isRaining: true };
        case 82:
            return { text: 'Chubascos torrenciales', emoji: '⛈️', isRaining: true };
        case 95:
            return { text: 'Tormenta eléctrica', emoji: '⛈️', isRaining: true };
        case 96:
        case 99:
            return { text: 'Tormenta eléctrica con granizo', emoji: '⛈️', isRaining: true };
        default:
            return { text: 'Clima variable', emoji: '🌤️', isRaining: false };
    }
}

// Caché en memoria para evitar peticiones repetidas (5 minutos de validez)
const weatherCache: { [key: string]: { data: WeatherInfo; timestamp: number } } = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Consulta el clima en tiempo real para las coordenadas dadas usando Open-Meteo
 */
export async function getWeatherByCoordinates(lat: number, lng: number): Promise<WeatherInfo> {
    const cacheKey = `${lat.toFixed(2)}_${lng.toFixed(2)}`;
    const now = Date.now();

    if (weatherCache[cacheKey] && (now - weatherCache[cacheKey].timestamp) < CACHE_TTL_MS) {
        return weatherCache[cacheKey].data;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,wind_speed_10m&hourly=precipitation_probability&timezone=auto`;

        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Error en API del clima: ${res.statusText}`);
        }

        const data = await res.json();
        const current = data.current || {};
        const hourly = data.hourly || {};

        const weatherCode = current.weather_code ?? 0;
        const info = interpretWeatherCode(weatherCode);

        // Detectar si está lloviendo actualmente según código o milímetros de agua
        const precip = Number(current.precipitation || current.rain || current.showers || 0);
        const isRaining = info.isRaining || precip > 0.05;

        // Obtener probabilidad de lluvia para la hora actual
        let rainProbability = 0;
        if (hourly.time && hourly.precipitation_probability && current.time) {
            const currentHourPrefix = current.time.substring(0, 13); // "YYYY-MM-DDTHH"
            const matchIndex = hourly.time.findIndex((t: string) => t.startsWith(currentHourPrefix));
            if (matchIndex !== -1) {
                rainProbability = hourly.precipitation_probability[matchIndex] ?? 0;
            } else if (hourly.precipitation_probability.length > 0) {
                rainProbability = hourly.precipitation_probability[0];
            }
        }

        // Si ya está lloviendo en tiempo real pero la probabilidad horaria es baja, asegurar mínimo 90%
        if (isRaining && rainProbability < 80) {
            rainProbability = 95;
        }

        const weatherResult: WeatherInfo = {
            temperature: Math.round(current.temperature_2m ?? 28),
            apparentTemperature: Math.round(current.apparent_temperature ?? current.temperature_2m ?? 28),
            humidity: Math.round(current.relative_humidity_2m ?? 60),
            windSpeed: Math.round(current.wind_speed_10m ?? 5),
            weatherCode,
            conditionText: info.text,
            conditionEmoji: isRaining ? '🌧️' : info.emoji,
            isRaining,
            rainProbability: Math.min(100, Math.max(0, rainProbability)),
            isDay: current.is_day === 1,
            precipitationMm: Number(precip.toFixed(1)),
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        weatherCache[cacheKey] = {
            data: weatherResult,
            timestamp: now
        };

        return weatherResult;
    } catch (error) {
        console.error("Error al obtener clima desde Open-Meteo:", error);
        // Fallback seguro en caso de desconexión
        return {
            temperature: 28,
            apparentTemperature: 30,
            humidity: 65,
            windSpeed: 8,
            weatherCode: 1,
            conditionText: 'Despejado',
            conditionEmoji: '🌤️',
            isRaining: false,
            rainProbability: 10,
            isDay: !isNightTime(),
            precipitationMm: 0,
            updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
    }
}

/**
 * Determina si son pasadas las 7:00 p.m. (19:00) o antes de las 6:00 a.m. (06:00)
 * para cambiar el mapa a tema oscuro automáticamente.
 */
export function isNightTime(): boolean {
    const now = new Date();
    const hour = now.getHours(); // 0 a 23
    return hour >= 19 || hour < 6;
}

// Estilo Claro de Google Maps (Estilo Yango diurno)
export const yangoDayMapStyles: google.maps.MapTypeStyle[] = [
    {
        featureType: 'poi',
        elementType: 'labels',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'transit',
        elementType: 'labels.icon',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ lightness: 15 }]
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#cde2f5' }]
    }
];

// Estilo Oscuro Nocturno de Google Maps (Modo Noche: 7:00 PM a 6:00 AM)
// Tonos azul medianoche y negro profundo para máxima legibilidad nocturna
export const yangoDarkMapStyles: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#161e2e' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#111827' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#9ca3af' }] },
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#f3f4f6' }]
    },
    {
        featureType: 'poi',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'road',
        elementType: 'geometry',
        stylers: [{ color: '#283548' }]
    },
    {
        featureType: 'road',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1a2232' }]
    },
    {
        featureType: 'road',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#e5e7eb' }]
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry',
        stylers: [{ color: '#374151' }]
    },
    {
        featureType: 'road.highway',
        elementType: 'geometry.stroke',
        stylers: [{ color: '#1f2937' }]
    },
    {
        featureType: 'road.highway',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#f9fafb' }]
    },
    {
        featureType: 'transit',
        stylers: [{ visibility: 'off' }]
    },
    {
        featureType: 'water',
        elementType: 'geometry',
        stylers: [{ color: '#0b1120' }]
    },
    {
        featureType: 'water',
        elementType: 'labels.text.fill',
        stylers: [{ color: '#6b7280' }]
    }
];
