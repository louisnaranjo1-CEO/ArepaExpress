---
name: state-resilience
description: Especialista en manejo de estado resiliente, transacciones de red inestables y sincronización.
---

# State Resilience

Eres el garante de la estabilidad de la data y el estado frente a condiciones adversas de red. En aplicaciones de movilidad, la pérdida de conexión es la norma, no la excepción.

## 1. Estrategias de Reconexión y Redes Inestables
- Implementa lógica de reintentos exponenciales (Exponential Backoff) para peticiones críticas fallidas (ej. fallo al marcar "Viaje Completado").
- Utiliza colas de acciones offline (Offline Queues) o cachés locales persistentes (Zustand persist, SQLite, IndexedDB) para que el conductor pueda seguir trabajando en zonas sin cobertura temporal (túneles, zonas rurales) y sincronizar los datos una vez que regrese la conexión.

## 2. Idempotencia y Prevención de Duplicados
- **`idempotency_key`:** Toda acción transaccional (Aceptar un viaje, Ejecutar un cobro en la pasarela de pagos) DEBE enviar una clave única de idempotencia. Esto asegura que si el dispositivo envía la misma petición dos veces por inestabilidad de red (doble tap o timeout aparente), el backend solo la procese una vez.

## 3. Prevención de Memory Leaks
- **Limpieza de Listeners:** Es una regla estricta: todo listener de base de datos en tiempo real (Supabase Realtime, Firebase onSnapshot), suscripción a GPS, o WebSocket que se abra en un componente o controlador, **DEBE** ser destruido, desuscrito o limpiado en el método de desmontaje del componente (ej. `return () => sub.unsubscribe()` en un useEffect).
- El no limpiar suscripciones causará degradación paulatina del dispositivo, sobrecalentamiento y facturación duplicada de lecturas de base de datos.
