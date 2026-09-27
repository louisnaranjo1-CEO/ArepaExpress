# Blueprint Arquitectónico y Diagramas de Flujo del Sistema

Este documento describe la arquitectura base, los ciclos de vida de negocio y las pipelines de infraestructura críticas para el funcionamiento de "Un 2x3". El sistema se divide funcionalmente en Ride-Hailing, E-Commerce con Despacho, y Tracking GPS, operando bajo un entorno híbrido React/Capacitor/Flutter respaldado exclusivamente por Supabase (PostgreSQL, Realtime, Storage, Auth), optimizado para alto rendimiento y máxima eficiencia operativa.

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

## 2. Flujo Híbrido de Comercio / Delivery y Chat Transaccional (ACTUALIZADO)
Este flujo integra el ciclo de e-commerce con checkout ágil, chat transaccional P2P en tiempo real, validación estricta de pagos y red de repartidores.

### 2.1. Arquitectura del Flujo de Checkout y Chat P2P
```mermaid
sequenceDiagram
    autonumber
    actor Cliente
    participant AppCliente (Cart & TrackOrder)
    participant Backend (Supabase Postgres & Realtime)
    participant AppComercio (OrderChatWindow & Dashboard)
    participant RedDrivers

    Note over Cliente, AppCliente: Paso 1: Carrito de Compras
    Cliente->>AppCliente: Selecciona Productos y avanza a Entrega
    Note over AppCliente: GPS Automático del dispositivo + Mapa de solo lectura (google-maps-optimizer)
    Cliente->>AppCliente: Confirma Método de Entrega ("Retiro en tienda" o "Delivery") + Referencias manuales
    Cliente->>Backend: Crea Orden ('pending') + Inyecta Mensaje Inicial con Desglose Completo del Carrito
    Backend-->>AppComercio: Notificación en Tiempo Real (Nuevo Pedido en Chat P2P)
    AppCliente->>AppCliente: Redirige automáticamente a /track/:orderId con Chat Transaccional abierto

    Note over Cliente, AppComercio: Paso 2: Chat Transaccional y Verificación Estricta de Pago
    AppComercio->>Backend: Envía Datos de Pago Móvil / Cashea QR / Audio / Texto
    Backend-->>AppCliente: Mensaje recibido en tiempo real
    Cliente->>AppCliente: Presiona botón "Ya pagué"
    Note over AppCliente: Validación Estricta: Requiere Comprobante (JPG/PNG) O Referencia (>= 4 dígitos)
    Cliente->>Backend: Sube Comprobante a Storage + Actualiza Orden ('verifying')
    Backend-->>AppComercio: Alerta en Chat con Comprobante y Referencia
    AppComercio->>Backend: Comercio valida y confirma pago ('preparing')

    Note over AppComercio, AppCliente: Paso 3: Contador de Preparación Sincronizado
    AppComercio->>Backend: Establece Tiempo de Preparación (ej. 20 min) -> 'estimated_ready_at'
    Backend-->>AppCliente: Supabase Realtime sincroniza Cuenta Regresiva (Banner persistente)

    Note over Cliente, AppComercio: Paso 4: Asignación de Driver (Opciones A y B)
    alt Opción B: Cliente sugiere Driver
        Cliente->>Backend: Sugiere driver preferido ('preferred_driver_id')
        Backend-->>AppComercio: Muestra sugerencia destacada en el modal de despacho
    end
    AppComercio->>AppComercio: Presiona "Enviar Pedido" (Driver Dispatch Modal)
    Note over AppComercio: Opción A: Selección final de Driver de la Red (Aplica regla de Envío Gratis vs Tarifa Cliente)
    AppComercio->>Backend: Asigna Driver ('delivering') + Emite mensaje al chat
    Backend-->>RedDrivers: Notifica al Driver Asignado

    Note over RedDrivers, Cliente: Paso 5: Entrega y Reseña
    RedDrivers->>Backend: Marca orden como 'delivered'
    Backend-->>AppCliente: Dispara Modal de Reseña (Calificación + Toggle de Autor Anónimo)
    Cliente->>Backend: Guarda Reseña pública para el comercio
```

### 2.2. Reglas de Negocio Implementadas
1. **Geolocalización Automática y Optimización de Mapas (`google-maps-optimizer`):**
   - El dispositivo obtiene las coordenadas GPS iniciales vía `@capacitor/geolocation` sin obligar al usuario a arrastrar pines complicados.
   - El mapa de Google Maps funciona como **confirmación visual en modo solo lectura** (`draggable: false`, sin uso innecesario de `Directions` ni `Distance Matrix`).
   - Se incluye un campo de texto para referencias manuales descriptivas (ej. color de fachada, número de casa, punto de referencia local).
2. **Selección Obligatoria de Entrega:**
   - La interfaz requiere bifurcar entre **"Retiro en tienda" (PickUp)** o **"Delivery"** antes de procesar el pedido.
3. **Inyección de Contexto en Chat Transaccional:**
   - Al generarse el pedido, el sistema inyecta en la tabla `messages` un primer mensaje formateado con todo el carrito (productos, cantidades, precios unitarios, subtotal, costo de envío si aplica, total y coordenadas/referencias de entrega).
4. **Validación Estricta de Pago ("Ya pagué"):**
   - No se permite avanzar el reporte sin adjuntar la captura del comprobante o sin ingresar un código de referencia bancaria válido (mínimo 4 caracteres).
   - El archivo se almacena en el bucket `documents` de Supabase Storage con fallback seguro a base64.
5. **Contador de Preparación Sincronizado:**
   - El comercio establece los minutos estimados de cocina (`15`, `20`, `30`, `45` o personalizados).
   - Se calcula `estimated_ready_at` en la orden y Supabase Realtime replica la cuenta regresiva en vivo en el banner superior del chat en ambos extremos.
6. **Despacho y Asignación de Conductor:**
   - **Opción A (Negocio elige):** El comercio selecciona al repartidor desde la lista en tiempo real. Si el comercio ofrece promoción de "Envío Gratis", el comercio asume la comisión de despacho; de lo contrario, la tarifa se transfiere al cliente.
   - **Opción B (Usuario elige/sugiere):** Mientras espera la preparación, el cliente puede explorar la lista de repartidores y proponer su conductor de confianza (`preferred_driver_id`), alertando al comercio en el chat y en el modal de despacho para su aprobación final.
7. **Sistema de Reseñas y Calificaciones con Anonimato:**
   - Al marcarse el pedido como `delivered`, se activa automáticamente el modal de calificación.
   - Cuenta con un switch "Publicar de forma anónima" que enmascara el nombre y avatar del usuario antes de persistir la reseña en la tabla pública del comercio.

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
        WS_Out --> |WSS| S_RLS[Supabase Realtime]
        S_RLS --> |Event: UPDATE| DB[(PostgreSQL)]
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
