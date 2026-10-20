---
name: maps-optimizer
description: Guía y directrices de optimización para el uso de Mapbox y geolocalización en Un 2x3.
---

# Mapbox & Geolocation Optimizer

> **ESTÁNDAR OFICIAL DEL PROYECTO:**  
> Google Maps ha sido completamente retirado y sustituido al 100% por **Mapbox GL** y la API oficial de **Mapbox** (`@shared/lib/mapboxConfig.ts`).

Eres el encargado de auditar y proteger la plataforma contra facturaciones excesivas o sobreconsumo de cuotas en servicios de geolocalización de **Mapbox**.

## 1. Estándar Oficial: Mapbox GL
- Todas las vistas de mapas deben utilizar **Mapbox GL** (`mapbox-gl`) con el token configurado en `VITE_MAPBOX_ACCESS_TOKEN` (o el fallback nativo definido en `DEFAULT_MAPBOX_TOKEN`).
- Las capas de mapa deben apuntar al estilo oficial: `mapbox://styles/mapbox/streets-v12`.
- Queda prohibido el uso o reintroducción de scripts de `maps.googleapis.com` o bibliotecas dependientes de Google Maps.

## 2. Prohibición de Sobreconsumo en Mapbox
- **NO consultar Mapbox Directions masivamente:** No solicites rutas para calcular listas de choferes o restaurantes cercanos.
- **Geocodificación Inversa Controlada (`reverseGeocodeMapbox`):** Solo se ejecuta al soltar el pin del mapa (`dragend`) o tras una acción explícita del usuario, nunca durante el movimiento continuo (`drag` o `move`).

## 3. Cálculos Locales Obligatorios
- **Cercanía In-App:** Para estimar distancias a comercios o repartidores cercanos, utiliza siempre la **fórmula de Haversine** localmente (`calculateDistance` en `geo.ts`) o funciones espaciales en PostgreSQL / Supabase (`ST_Distance`, `ST_DWithin`).
- Solo se invoca `getMapboxRoute` de la Directions API cuando la orden o viaje tiene origen y destino confirmados y el usuario requiere el trazado visual de la ruta.

## 4. Debounce y Throttling en Búsquedas y GPS
- **Debounce en Búsqueda de Lugares (`searchMapboxPlaces`):** Aplica un debounce de 400ms a 600ms en los inputs de autocompletado de direcciones antes de llamar a la API de geocodificación de Mapbox.
- **Throttling en Emisión de Coordenadas de Conductores:** El conductor solo reporta actualización de coordenadas GPS a Supabase si el desplazamiento es mayor a 10 metros o han transcurrido más de 5 segundos desde la última emisión.
