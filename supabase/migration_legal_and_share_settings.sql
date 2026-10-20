-- Migración: Tabla de Términos y Condiciones Legales y Configuración de Link Compartir
-- Proyecto: Un 2x3 (xfialzrbbsdzzcjtefqo)

CREATE TABLE IF NOT EXISTS public.app_legal_and_share_settings (
    id text PRIMARY KEY DEFAULT 'current',
    terms_client text NOT NULL DEFAULT '',
    terms_driver text NOT NULL DEFAULT '',
    terms_business text NOT NULL DEFAULT '',
    share_link_url text NOT NULL DEFAULT 'https://un2x3.app',
    share_link_message text NOT NULL DEFAULT '¡Hola! Ya llegó a Calabozo Un 2x3, la nueva súper app todo en uno. ¡Descúbrela y gana premios por usarla!',
    updated_at timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.app_legal_and_share_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "p_read_app_legal_and_share_settings" ON public.app_legal_and_share_settings;
CREATE POLICY "p_read_app_legal_and_share_settings"
    ON public.app_legal_and_share_settings
    FOR SELECT
    TO public
    USING (true);

DROP POLICY IF EXISTS "p_insert_app_legal_and_share_settings" ON public.app_legal_and_share_settings;
CREATE POLICY "p_insert_app_legal_and_share_settings"
    ON public.app_legal_and_share_settings
    FOR INSERT
    TO authenticated, service_role
    WITH CHECK (
        (auth.role() = 'service_role')
        OR ((auth.jwt() ->> 'email') = ANY (ARRAY['louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com']))
        OR ((auth.jwt() ->> 'role') = 'admin')
        OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        OR (COALESCE(current_setting('request.jwt.claim.role', true), CURRENT_USER) = ANY (ARRAY['service_role', 'postgres']))
    );

DROP POLICY IF EXISTS "p_update_app_legal_and_share_settings" ON public.app_legal_and_share_settings;
CREATE POLICY "p_update_app_legal_and_share_settings"
    ON public.app_legal_and_share_settings
    FOR UPDATE
    TO authenticated, service_role
    USING (
        (auth.role() = 'service_role')
        OR ((auth.jwt() ->> 'email') = ANY (ARRAY['louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com']))
        OR ((auth.jwt() ->> 'role') = 'admin')
        OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        OR (COALESCE(current_setting('request.jwt.claim.role', true), CURRENT_USER) = ANY (ARRAY['service_role', 'postgres']))
    )
    WITH CHECK (
        (auth.role() = 'service_role')
        OR ((auth.jwt() ->> 'email') = ANY (ARRAY['louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com']))
        OR ((auth.jwt() ->> 'role') = 'admin')
        OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        OR (COALESCE(current_setting('request.jwt.claim.role', true), CURRENT_USER) = ANY (ARRAY['service_role', 'postgres']))
    );

DROP POLICY IF EXISTS "p_delete_app_legal_and_share_settings" ON public.app_legal_and_share_settings;
CREATE POLICY "p_delete_app_legal_and_share_settings"
    ON public.app_legal_and_share_settings
    FOR DELETE
    TO authenticated, service_role
    USING (
        (auth.role() = 'service_role')
        OR ((auth.jwt() ->> 'email') = ANY (ARRAY['louisnaranjo1@gmail.com', 'soundandart.publicidad@gmail.com']))
        OR ((auth.jwt() ->> 'role') = 'admin')
        OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'::user_role))
        OR (COALESCE(current_setting('request.jwt.claim.role', true), CURRENT_USER) = ANY (ARRAY['service_role', 'postgres']))
    );

-- Publicación Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'app_legal_and_share_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.app_legal_and_share_settings;
    END IF;
END $$;
