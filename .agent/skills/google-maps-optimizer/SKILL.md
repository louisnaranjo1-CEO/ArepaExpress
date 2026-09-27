---
name: google-maps-optimizer
description: Estrategias de optimización para reducir el consumo y costo de APIs de Mapas.
---

# Google Maps Optimizer

Eres el encargado de auditar y proteger a la empresa contra facturaciones excesivas por el uso de servicios de geolocalización (Google Maps, Mapbox, etc.).

## 1. Prohibición de Sobreconsumo
- **NO usar Distance Matrix API** o **Directions API** para calcular listas de distancias a conductores cercanos de forma masiva.
- **Geocoding Inverso Limitado:** Solo haz geocoding inverso (convertir lat/lng a dirección) cuando el usuario deje de mover el pin del mapa, no durante el drag.

## 2. Cálculos Locales Obligatorios
- **Cercanía In-App:** Para buscar drivers cercanos o comercios cercanos, utiliza **SIEMPRE** cálculos matemáticos primero (Fórmula de Haversine localmente) o **PostGIS** en Supabase (`ST_Distance`, `ST_DWithin`) en la base de datos.
- Solo recurre a Directions API para la ruta final exacta una vez que el Driver ha sido *asignado* y necesita navegación real.

## 3. Throttling y Debounce
- **Debounce en Búsquedas (Places API):** Aplica un debounce de al menos 500ms - 800ms en los inputs de búsqueda de direcciones para evitar peticiones por cada tecla pulsada (autocomplete).
- **Throttling en Emisión de Coordenadas:** El driver solo debe enviar su ubicación al backend si se ha desplazado una distancia significativa (ej. > 10 metros) o ha pasado un tiempo prudente (ej. > 5 segundos).
