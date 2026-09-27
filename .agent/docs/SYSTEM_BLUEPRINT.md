# Blueprint Arquitectónico y Diagramas de Flujo del Sistema

Este documento describe la arquitectura base, los ciclos de vida de negocio y las pipelines de infraestructura críticas para el funcionamiento de "Un 2x3". El sistema se divide funcionalmente en Ride-Hailing, E-Commerce con Despacho, y Tracking GPS, operando bajo un entorno híbrido React/Capacitor/Flutter respaldado por Supabase y Firebase.

## 1. Flujo de Ride-Hailing (Taxi)
El ciclo de vida del servicio de transporte desde la solicitud inicial hasta la confirmación del pago.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant AppCliente
    participant Backend (Supabase)
    participant AppDriver
    actor Driver

    Cliente->>AppCliente: Ingresa Origen, Destino y Tipo de Viaje
    AppCliente->>Backend: Crea Solicitud de Viaje (status: 'searching')
    Backend-->>AppDriver: Notifica a Drivers Cercanos (Radio Mínimo)
    Driver->>AppDriver: Visualiza Solicitud (Timeout: 15s)
    Driver->>AppDriver: Acepta Viaje (Idempotency Key)
    AppDriver->>Backend: Transacción de Asignación (Manejo de Concurrencia)
    Backend-->>AppCliente: Viaje Asignado (Muestra datos del Driver y Vehículo)
    Driver->>AppDriver: Inicia Navegación hacia Origen
    AppDriver->>Backend: Emite Coordenadas en Tiempo Real (status: 'en_ruta')
    Driver->>AppDriver: Marca "Llegada al Origen"
    Backend-->>AppCliente: Notificación: "El Driver ha llegado"
    Driver->>AppDriver: Inicia Viaje (Pasajero Abordo)
    AppDriver->>Backend: Actualiza estado a 'en_progreso'
    Driver->>AppDriver: Finaliza Viaje en Destino
    AppDriver->>Backend: Calcula Tarifa Final y Cobra (status: 'completado')
    Backend-->>AppCliente: Muestra Recibo y Solicita Calificación
    Cliente->>AppCliente: Califica y Deja Propina
```

## 2. Flujo Híbrido de Comercio / Delivery (CRÍTICO)
Este flujo integra el ciclo de e-commerce tradicional con la red de conductores del sistema Ride-Hailing.

```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant Tienda
    participant AdminComercio
    participant Backend (Supabase)
    participant RedDrivers

    Cliente->>Tienda: Añade Productos al Carrito
    Cliente->>Tienda: Completa Checkout y Paga
    Tienda->>Backend: Crea Pedido de Comercio (status: 'pendiente')
    Backend-->>AdminComercio: Notifica Nuevo Pedido
    AdminComercio->>AdminComercio: Acepta Pedido y Comienza Preparación
    AdminComercio->>Backend: Actualiza estado a 'en_preparacion'
    Note over AdminComercio, Backend: El admin termina de empaquetar el producto.
    AdminComercio->>Backend: Presiona "Envío de Paquete"
    Note over Backend, RedDrivers: [TRIGGER] Creación Automática de Solicitud de Ride-Hailing
    Backend->>Backend: Transforma Pedido en Viaje de Paquetería (status: 'searching_driver')
    Backend-->>RedDrivers: Notifica a Drivers Cercanos para Delivery
    RedDrivers->>Backend: Un Driver Acepta el Delivery
    Backend-->>AdminComercio: Driver Asignado (Muestra ETA de llegada a la tienda)
    Backend-->>Cliente: Pedido Despachado (Muestra Tracking del Driver)
    RedDrivers->>Backend: Recoge Paquete en Tienda
    RedDrivers->>Backend: Entrega Paquete a Cliente
    Backend->>Backend: Marca Viaje y Pedido como 'entregado'
```

## 3. Pipeline de Tracking GPS
Gestión de geolocalización de alta frecuencia con mitigación de costos operativos y optimización de rendimiento.

```mermaid
graph TD
    subgraph Driver Device
        GPS[Hardware GPS] --> BG[Background Geolocation Plugin]
        BG --> Filter[Filtro Local: Haversine > 10m o > 5s]
        Filter --> WS_Out[WebSocket Emisor]
    end

    subgraph Infrastructure
        WS_Out --> |WSS| S_RLS[Supabase Realtime / Firebase]
        S_RLS --> |Event: UPDATE| DB[(PostgreSQL / Firestore)]
    end

    subgraph Consumers
        S_RLS --> |Subscription| WS_In_C[App Cliente]
        S_RLS --> |Subscription| WS_In_A[App Admin Comercio]
        WS_In_C --> MapUI_C[Renderizado Interpolar en Mapa 60fps]
        WS_In_A --> MapUI_A[Vista de Flota]
    end
```
**Lógica Técnica:**
- **Throttling:** Se limita la emisión de coordenadas desde el dispositivo del conductor (ej. solo emitir si el cambio es > 10 metros o han pasado > 5 segundos).
- **Interpolación:** Las apps consumidoras (Cliente/Comercio) utilizan animaciones para suavizar el movimiento del marcador del driver en el mapa, evitando la percepción de saltos debido al throttling.

## 4. Matriz de Roles y Permisos

| Rol | Entorno Principal | Permisos Clave | Restricciones |
| :--- | :--- | :--- | :--- |
| **Cliente** | App Móvil / PWA | - Solicitar viajes y pedir en tiendas.<br>- Trackear estado y ubicación.<br>- Gestionar métodos de pago. | Solo accede a sus propios datos e historial. No puede ver datos de otros usuarios. |
| **Driver** | App Móvil Nativa | - Recibir y aceptar/rechazar viajes/deliveries.<br>- Emitir GPS en 2do plano.<br>- Gestionar estado de disponibilidad (Online/Offline). | Solo ve los datos necesarios para completar el viaje asignado. No accede al catálogo interno del comercio. |
| **Admin de Comercio** | Panel Web / Tablet | - Gestionar catálogo de productos.<br>- Aceptar/rechazar pedidos entrantes.<br>- Disparar el Trigger de "Envío de Paquete". | Solo visualiza su tienda. No puede asignar drivers manualmente (el sistema lo hace). |
| **Super Admin** | Panel Web (CPanel) | - Acceso total al sistema, métricas, comisiones, bloqueos y auditorías.<br>- CRUD completo de todas las tablas. | Uso restringido por 2FA. |
