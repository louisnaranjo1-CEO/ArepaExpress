-- Enable PostGIS para tracking y geolocalización
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Esquema de Usuarios y Roles (RBAC)
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '{}'
);

-- Insertar roles base
INSERT INTO roles (name, permissions) VALUES 
('Super_Admin', '{"all": true}'),
('Administrador_Local', '{"manage_local": true}'),
('Cajero', '{"manage_payments": true}'),
('Mesero', '{"manage_orders": true}'),
('Repartidor', '{"manage_deliveries": true}'),
('Cliente', '{"create_orders": true}')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE, -- Para facilitar migración desde Auth
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    role_id INT REFERENCES roles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Configuración de Tarifas de Delivery (Administrable por Super_Admin)
CREATE TABLE IF NOT EXISTS delivery_settings (
    id SERIAL PRIMARY KEY,
    base_fare DECIMAL(10, 2) DEFAULT 2.00,
    price_per_km DECIMAL(10, 2) DEFAULT 0.50,
    surge_multiplier DECIMAL(5, 2) DEFAULT 1.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insertar valores por defecto para delivery
INSERT INTO delivery_settings (id, base_fare, price_per_km, surge_multiplier)
VALUES (1, 2.00, 0.50, 1.00)
ON CONFLICT (id) DO NOTHING;

-- 3. Lógica de Pedidos
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('Pendiente', 'En Cocina', 'Listo', 'En Entrega', 'Completado', 'Cancelado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
    courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status order_status DEFAULT 'Pendiente',
    subtotal DECIMAL(10, 2) DEFAULT 0.00,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) DEFAULT 0.00,
    delivery_location geography(Point, 4326),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_name VARCHAR(255) NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    notes TEXT
);

-- =====================================================
-- 4. PILOTOS / CONDUCTORES — Migración desde Firestore
-- =====================================================

CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    cedula VARCHAR(20),
    rif VARCHAR(20),
    age INT,
    vehicle_type VARCHAR(20) CHECK (vehicle_type IN ('moto', 'carro', 'ejecutivo', 'bicicleta')),
    vehicle_plate VARCHAR(20),
    is_online BOOLEAN DEFAULT false,
    availability VARCHAR(20) DEFAULT 'offline' CHECK (availability IN ('active', 'busy', 'offline')),
    current_location geography(Point, 4326),
    current_heading FLOAT DEFAULT 0,
    current_speed FLOAT DEFAULT 0,
    location_updated_at TIMESTAMPTZ,
    selfie_url TEXT,
    vehicle_url TEXT,
    license_url TEXT,
    home_state VARCHAR(100),
    home_city VARCHAR(100),
    home_coords_lat FLOAT,
    home_coords_lng FLOAT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'inactive')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice optimizado para consultas de disponibilidad (lo que usa Taxi.tsx)
CREATE INDEX IF NOT EXISTS idx_drivers_available 
    ON drivers(vehicle_type) 
    WHERE is_online = true AND availability = 'active' AND status = 'active';

-- =====================================================
-- 5. HISTORIAL DE UBICACIÓN — Para tracking en tiempo real
-- =====================================================

CREATE TABLE IF NOT EXISTS driver_location_history (
    id BIGSERIAL PRIMARY KEY,
    driver_firebase_uid VARCHAR(128) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    heading FLOAT DEFAULT 0,
    speed FLOAT DEFAULT 0,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para obtener las últimas ubicaciones rápidamente
CREATE INDEX IF NOT EXISTS idx_driver_location_recent 
    ON driver_location_history(driver_firebase_uid, recorded_at DESC);

-- Auto-cleanup: eliminar historial de ubicación mayor a 24 horas (ahorro de storage)
-- Se ejecuta manualmente o con pg_cron
-- DELETE FROM driver_location_history WHERE recorded_at < NOW() - INTERVAL '24 hours';

-- =====================================================
-- 6. SOLICITUDES DE TRANSPORTE — Migración desde Firestore
-- =====================================================

CREATE TABLE IF NOT EXISTS transport_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_id VARCHAR(128), -- ID original de Firestore para compatibilidad temporal
    type VARCHAR(20) DEFAULT 'transport',
    user_firebase_uid VARCHAR(128) NOT NULL,
    user_name VARCHAR(255),
    user_phone VARCHAR(50),
    user_cedula VARCHAR(30),
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    origin_address TEXT,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    destination_address TEXT,
    vehicle_type VARCHAR(20) NOT NULL,
    route_distance_km DECIMAL(8, 2),
    route_duration TEXT,
    total DECIMAL(10, 2) DEFAULT 0.00,
    price DECIMAL(10, 2) DEFAULT 0.00,
    driver_payout DECIMAL(10, 2) DEFAULT 0.00,
    driver_firebase_uid VARCHAR(128),
    driver_paid BOOLEAN DEFAULT false,
    status VARCHAR(30) DEFAULT 'searching' CHECK (status IN (
        'searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress', 'completed', 'cancelled'
    )),
    payment_method VARCHAR(30),
    payment_ref VARCHAR(100),
    payment_proof_url TEXT,
    scheduled BOOLEAN DEFAULT false,
    scheduled_at TIMESTAMPTZ,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    rating_comment TEXT,
    rated_at TIMESTAMPTZ,
    driver_assigned_at TIMESTAMPTZ,
    driver_arrived_at TIMESTAMPTZ,
    arrival_duration INT, -- seconds
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    total_service_duration INT, -- seconds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transport_status ON transport_requests(status);
CREATE INDEX IF NOT EXISTS idx_transport_driver ON transport_requests(driver_firebase_uid) WHERE status IN ('accepted', 'arriving', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_transport_user ON transport_requests(user_firebase_uid) WHERE status IN ('searching', 'verifying_payment', 'accepted', 'arriving', 'in_progress');

-- =====================================================
-- Triggers y Funciones de Base de Datos
-- =====================================================

-- Función para calcular el precio total por item automáticamente
CREATE OR REPLACE FUNCTION calc_order_item_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_price := NEW.quantity * NEW.unit_price;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_order_item_total ON order_items;
CREATE TRIGGER trigger_calc_order_item_total
BEFORE INSERT OR UPDATE ON order_items
FOR EACH ROW
EXECUTE FUNCTION calc_order_item_total();

-- Función para recalcular el subtotal y total de un pedido
CREATE OR REPLACE FUNCTION update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
    new_subtotal DECIMAL(10,2);
BEGIN
    -- Sumar todos los items del pedido
    SELECT COALESCE(SUM(total_price), 0) INTO new_subtotal
    FROM order_items
    WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);

    -- Actualizar la tabla de pedidos
    UPDATE orders
    SET subtotal = new_subtotal,
        total_amount = new_subtotal + delivery_fee,
        updated_at = NOW()
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para recalcular después de modificar/agregar/eliminar items
DROP TRIGGER IF EXISTS trigger_update_order_totals ON order_items;
CREATE TRIGGER trigger_update_order_totals
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_totals();

-- Función para auto-update de updated_at en drivers
CREATE OR REPLACE FUNCTION update_driver_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_driver_updated_at ON drivers;
CREATE TRIGGER trigger_driver_updated_at
BEFORE UPDATE ON drivers
FOR EACH ROW
EXECUTE FUNCTION update_driver_timestamp();

-- Función para auto-update de updated_at en transport_requests
CREATE OR REPLACE FUNCTION update_transport_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transport_request_updated_at ON transport_requests;
CREATE TRIGGER trigger_transport_request_updated_at
BEFORE UPDATE ON transport_requests
FOR EACH ROW
EXECUTE FUNCTION update_transport_request_timestamp();
