-- ==============================================================================
-- MIGRACIÓN DE SEGURIDAD RLS (Row Level Security) PARA SUPABASE
-- Aplica esta consulta en el SQL Editor de tu consola de Supabase
-- Proyecto: Un 2x3 (xfialzrbbsdzzcjtefqo)
-- ==============================================================================

-- 1. TABLA: ORDERS (Pedidos)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Clientes ven sus propios pedidos
CREATE POLICY "Users can read own orders" 
ON public.orders FOR SELECT 
TO authenticated 
USING (user_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'admin');

-- Clientes pueden crear pedidos
CREATE POLICY "Users can create orders" 
ON public.orders FOR INSERT 
TO authenticated 
WITH CHECK (user_id = auth.uid()::text);

-- Comercios y Drivers pueden ver los pedidos asignados a ellos
CREATE POLICY "Drivers and stores can view their orders" 
ON public.orders FOR SELECT 
TO authenticated 
USING (
  driver_id = auth.uid()::text 
  OR restaurant_id = auth.uid()::text 
  OR status = 'buscando_piloto'
);

-- Comercios y Drivers pueden actualizar el estado de sus pedidos
CREATE POLICY "Drivers and stores can update their orders" 
ON public.orders FOR UPDATE 
TO authenticated 
USING (
  driver_id = auth.uid()::text 
  OR restaurant_id = auth.uid()::text 
  OR auth.jwt() ->> 'role' = 'admin'
);


-- 2. TABLA: TRANSPORT_REQUESTS (Taxis y Carreras)
ALTER TABLE public.transport_requests ENABLE ROW LEVEL SECURITY;

-- Usuarios ven sus propias carreras
CREATE POLICY "Users can view own transport requests" 
ON public.transport_requests FOR SELECT 
TO authenticated 
USING (user_id = auth.uid()::text OR driver_id = auth.uid()::text OR auth.jwt() ->> 'role' = 'admin');

-- Usuarios pueden pedir transporte
CREATE POLICY "Users can create transport requests" 
ON public.transport_requests FOR INSERT 
TO authenticated 
WITH CHECK (user_id = auth.uid()::text);

-- Conductores activos pueden ver carreras buscando piloto
CREATE POLICY "Drivers can view available ride requests" 
ON public.transport_requests FOR SELECT 
TO authenticated 
USING (status = 'searching');

-- Conductor y usuario pueden actualizar estado
CREATE POLICY "Involved parties can update ride requests" 
ON public.transport_requests FOR UPDATE 
TO authenticated 
USING (user_id = auth.uid()::text OR driver_id = auth.uid()::text OR status = 'searching' OR auth.jwt() ->> 'role' = 'admin');


-- 3. TABLA: MESSAGES (Chat)
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Solo los participantes del chat pueden leer los mensajes
CREATE POLICY "Chat participants can read messages" 
ON public.messages FOR SELECT 
TO authenticated 
USING (
  sender_id = auth.uid()::text 
  OR recipient_id = auth.uid()::text 
  OR auth.jwt() ->> 'role' = 'admin'
);

-- Solo el autor autenticado puede enviar mensajes
CREATE POLICY "Users can send messages" 
ON public.messages FOR INSERT 
TO authenticated 
WITH CHECK (sender_id = auth.uid()::text);
