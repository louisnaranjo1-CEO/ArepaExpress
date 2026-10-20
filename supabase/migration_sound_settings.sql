-- ==============================================================================
-- FASE 1: SISTEMA GLOBAL DE SONIDOS DINÁMICOS (Base de Datos y Storage)
-- Proyecto: Un 2x3 (xfialzrbbsdzzcjtefqo)
-- ==============================================================================

-- 1. CREACIÓN DE TABLA public.app_sound_settings
CREATE TABLE IF NOT EXISTS public.app_sound_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_key TEXT UNIQUE NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('notification', 'cycle_update', 'process_completed')),
    label TEXT NOT NULL,
    description TEXT,
    audio_url TEXT,
    default_tone TEXT NOT NULL CHECK (default_tone IN (
        'alert_loop', 'chat_pop', 'sos_siren', 'ticket_bell', 'push_chime',
        'cycle_accept', 'cycle_ready', 'cycle_driver', 'cycle_transit',
        'cycle_arrived', 'done_success', 'done_cash'
    )),
    volume NUMERIC NOT NULL DEFAULT 1.0 CHECK (volume >= 0.0 AND volume <= 1.0),
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    is_loop BOOLEAN NOT NULL DEFAULT false,
    target_roles TEXT[] DEFAULT ARRAY['all'],
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para mantener actualizado 'updated_at'
CREATE OR REPLACE FUNCTION public.set_app_sound_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_app_sound_settings_updated_at'
    ) THEN
        CREATE TRIGGER trg_app_sound_settings_updated_at
        BEFORE UPDATE ON public.app_sound_settings
        FOR EACH ROW
        EXECUTE FUNCTION public.set_app_sound_settings_updated_at();
    END IF;
END $$;

-- 2. HABILITAR PUBLICACIÓN SUPABASE REALTIME
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'app_sound_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.app_sound_settings;
    END IF;
END $$;

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.app_sound_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_sound_settings' AND policyname = 'p_read_app_sound_settings'
    ) THEN
        CREATE POLICY "p_read_app_sound_settings" 
        ON public.app_sound_settings FOR SELECT 
        TO public, anon, authenticated, service_role 
        USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_sound_settings' AND policyname = 'p_insert_app_sound_settings'
    ) THEN
        CREATE POLICY "p_insert_app_sound_settings" 
        ON public.app_sound_settings FOR INSERT 
        TO authenticated, service_role 
        WITH CHECK (
            auth.role() = 'service_role'
            OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
            OR (auth.jwt() ->> 'role') = 'admin'
            OR EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role = 'admin'::public.user_role
            )
            OR (COALESCE(current_setting('request.jwt.claim.role'::text, true), (CURRENT_USER)::text) = ANY (ARRAY['service_role'::text, 'postgres'::text]))
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_sound_settings' AND policyname = 'p_update_app_sound_settings'
    ) THEN
        CREATE POLICY "p_update_app_sound_settings" 
        ON public.app_sound_settings FOR UPDATE 
        TO authenticated, service_role 
        USING (
            auth.role() = 'service_role'
            OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
            OR (auth.jwt() ->> 'role') = 'admin'
            OR EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role = 'admin'::public.user_role
            )
            OR (COALESCE(current_setting('request.jwt.claim.role'::text, true), (CURRENT_USER)::text) = ANY (ARRAY['service_role'::text, 'postgres'::text]))
        )
        WITH CHECK (
            auth.role() = 'service_role'
            OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
            OR (auth.jwt() ->> 'role') = 'admin'
            OR EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role = 'admin'::public.user_role
            )
            OR (COALESCE(current_setting('request.jwt.claim.role'::text, true), (CURRENT_USER)::text) = ANY (ARRAY['service_role'::text, 'postgres'::text]))
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'app_sound_settings' AND policyname = 'p_delete_app_sound_settings'
    ) THEN
        CREATE POLICY "p_delete_app_sound_settings" 
        ON public.app_sound_settings FOR DELETE 
        TO authenticated, service_role 
        USING (
            auth.role() = 'service_role'
            OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
            OR (auth.jwt() ->> 'role') = 'admin'
            OR EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role = 'admin'::public.user_role
            )
            OR (COALESCE(current_setting('request.jwt.claim.role'::text, true), (CURRENT_USER)::text) = ANY (ARRAY['service_role'::text, 'postgres'::text]))
        );
    END IF;
END $$;

-- 4. BUCKET DE STORAGE SYSTEM-SOUNDS Y POLÍTICAS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'system-sounds',
    'system-sounds',
    true,
    15728640,
    ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/webm'];

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'p_select_system_sounds'
    ) THEN
        CREATE POLICY "p_select_system_sounds"
        ON storage.objects FOR SELECT
        TO public, anon, authenticated, service_role
        USING (bucket_id = 'system-sounds');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'p_insert_system_sounds'
    ) THEN
        CREATE POLICY "p_insert_system_sounds"
        ON storage.objects FOR INSERT
        TO authenticated, service_role
        WITH CHECK (
            bucket_id = 'system-sounds'
            AND (
                auth.role() = 'service_role'
                OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
                OR (auth.jwt() ->> 'role') = 'admin'
                OR EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE id = auth.uid() 
                      AND role = 'admin'::public.user_role
                )
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'p_update_system_sounds'
    ) THEN
        CREATE POLICY "p_update_system_sounds"
        ON storage.objects FOR UPDATE
        TO authenticated, service_role
        USING (
            bucket_id = 'system-sounds'
            AND (
                auth.role() = 'service_role'
                OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
                OR (auth.jwt() ->> 'role') = 'admin'
                OR EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE id = auth.uid() 
                      AND role = 'admin'::public.user_role
                )
            )
        )
        WITH CHECK (
            bucket_id = 'system-sounds'
            AND (
                auth.role() = 'service_role'
                OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
                OR (auth.jwt() ->> 'role') = 'admin'
                OR EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE id = auth.uid() 
                      AND role = 'admin'::public.user_role
                )
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'p_delete_system_sounds'
    ) THEN
        CREATE POLICY "p_delete_system_sounds"
        ON storage.objects FOR DELETE
        TO authenticated, service_role
        USING (
            bucket_id = 'system-sounds'
            AND (
                auth.role() = 'service_role'
                OR (auth.jwt() ->> 'email') IN ('louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com')
                OR (auth.jwt() ->> 'role') = 'admin'
                OR EXISTS (
                    SELECT 1 FROM public.profiles 
                    WHERE id = auth.uid() 
                      AND role = 'admin'::public.user_role
                )
            )
        );
    END IF;
END $$;

-- 5. INSERTAR SEEDS (15 EVENTOS BASE)
INSERT INTO public.app_sound_settings (
    event_key, category, label, description, audio_url, default_tone, volume, is_enabled, is_loop, target_roles
) VALUES
('notif_new_order', 'notification', 'Nuevo Pedido Entrante', 'Alerta continua de alta prioridad cuando un cliente genera una nueva orden en el comercio o CPanel.', NULL, 'alert_loop', 1.0, true, true, ARRAY['admin', 'cashier']),
('notif_new_chat', 'notification', 'Nuevo Mensaje de Chat', 'Notificación breve e instantánea al recibir un mensaje en el chat de pedidos o carreras de transporte.', NULL, 'chat_pop', 1.0, true, false, ARRAY['all']),
('notif_emergency_sos', 'notification', 'Alerta de Emergencia / SOS', 'Sirena de alerta crítica en bucle continuo ante situaciones de auxilio o botón de pánico SOS.', NULL, 'sos_siren', 1.0, true, true, ARRAY['admin']),
('notif_support_ticket', 'notification', 'Nuevo Ticket de Soporte', 'Campana de aviso cuando un usuario, conductor o aliado comercial abre un nuevo ticket de soporte.', NULL, 'ticket_bell', 1.0, true, false, ARRAY['admin']),
('notif_general_push', 'notification', 'Notificación General / Sistema', 'Chime suave para avisos informativos, campañas push masivas y anuncios globales del sistema.', NULL, 'push_chime', 1.0, true, false, ARRAY['all']),
('cycle_order_accepted', 'cycle_update', 'Ciclo: Pedido Aceptado / En Cocina', 'Sonido de confirmación cuando el establecimiento comercial acepta el pedido e inicia la preparación.', NULL, 'cycle_accept', 1.0, true, false, ARRAY['client', 'admin']),
('cycle_order_ready', 'cycle_update', 'Ciclo: Pedido Listo para Retirar', 'Aviso cuando la cocina o tienda empaqueta el pedido y lo marca listo para retiro del repartidor.', NULL, 'cycle_ready', 1.0, true, false, ARRAY['driver', 'admin', 'client']),
('cycle_driver_assigned', 'cycle_update', 'Ciclo: Repartidor / Piloto Asignado', 'Notificación sonora cuando un conductor o piloto de delivery acepta y se enlaza al pedido/viaje.', NULL, 'cycle_driver', 1.0, true, false, ARRAY['client', 'admin']),
('cycle_order_in_transit', 'cycle_update', 'Ciclo: Pedido en Camino al Cliente', 'Aviso cuando el repartidor retira la orden en el comercio y emprende el trayecto de entrega.', NULL, 'cycle_transit', 1.0, true, false, ARRAY['client', 'admin']),
('cycle_driver_arrived', 'cycle_update', 'Ciclo: Repartidor Llegó al Destino', 'Chime sonoro cuando el repartidor o vehículo llega a la puerta del cliente o punto de encuentro.', NULL, 'cycle_arrived', 1.0, true, false, ARRAY['client']),
('cycle_ride_started', 'cycle_update', 'Ciclo: Viaje de Transporte Iniciado', 'Sonido de inicio cuando el pasajero aborda y el piloto marca el inicio formal de la carrera.', NULL, 'cycle_transit', 1.0, true, false, ARRAY['client', 'driver']),
('done_order_delivered', 'process_completed', 'Terminado: Pedido Entregado con Éxito', 'Melodía de éxito y gratificación cuando la orden es recibida y completada con satisfacción.', NULL, 'done_success', 1.0, true, false, ARRAY['all']),
('done_ride_completed', 'process_completed', 'Terminado: Viaje de Transporte Finalizado', 'Sonido de culminación exitosa cuando el pasajero y el conductor completan el viaje.', NULL, 'done_success', 1.0, true, false, ARRAY['all']),
('done_payment_verified', 'process_completed', 'Terminado: Pago o Liquidación Verificada', 'Efecto de caja registradora cuando un pago móvil, transferencia o liquidación es aprobada.', NULL, 'done_cash', 1.0, true, false, ARRAY['admin', 'driver', 'client']),
('done_cashier_closed', 'process_completed', 'Terminado: Orden de Caja Completada', 'Efecto de cobro finalizado en terminal de caja física o punto de venta del comercio.', NULL, 'done_cash', 1.0, true, false, ARRAY['admin', 'cashier'])
ON CONFLICT (event_key) DO NOTHING;
