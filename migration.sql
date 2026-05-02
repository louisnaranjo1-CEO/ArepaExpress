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
CREATE TYPE order_status AS ENUM ('Pendiente', 'En Cocina', 'Listo', 'En Entrega', 'Completado', 'Cancelado');

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

-- Tabla para seguimiento de repartidores en tiempo real
CREATE TABLE IF NOT EXISTS delivery_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    courier_id UUID REFERENCES users(id) ON DELETE CASCADE,
    current_location geography(Point, 4326) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Triggers y Funciones de Base de Datos

-- Función para calcular el precio total por item automáticamente
CREATE OR REPLACE FUNCTION calc_order_item_total()
RETURNS TRIGGER AS $$
BEGIN
    NEW.total_price := NEW.quantity * NEW.unit_price;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
CREATE TRIGGER trigger_update_order_totals
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_order_totals();
