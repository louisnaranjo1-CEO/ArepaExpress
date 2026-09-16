-- Migración: Creación de Tiendas por Super Admin y Sistema de Comisiones WhatsApp

-- 1. Agregar columnas a comercios
ALTER TABLE public.comercios 
ADD COLUMN IF NOT EXISTS reviews INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS deuda_comisiones_acumulada NUMERIC(10,2) DEFAULT 0.00;

-- 2. Agregar columnas a orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS whatsapp_order BOOLEAN DEFAULT false;

-- 3. Función RPC para que el Super Admin cree tiendas con credenciales
CREATE OR REPLACE FUNCTION admin_create_comercio_with_auth(
    p_email text,
    p_password text,
    p_name text,
    p_category text DEFAULT 'Varios',
    p_whatsapp text DEFAULT '',
    p_address text DEFAULT '',
    p_city text DEFAULT '',
    p_state text DEFAULT '',
    p_logo_url text DEFAULT '',
    p_description text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_user_id uuid := gen_random_uuid();
    encrypted_pw text;
    existing_user_id uuid;
BEGIN
    -- Validar si el correo ya existe
    SELECT id INTO existing_user_id FROM auth.users WHERE lower(email) = lower(p_email);
    IF existing_user_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'El correo electrónico ya está registrado en la plataforma.'
        );
    END IF;

    -- Cifrar contraseña usando pgcrypto
    encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

    -- Insertar en auth.users
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        lower(p_email),
        encrypted_pw,
        NOW(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('full_name', p_name, 'name', p_name, 'role', 'aliado'),
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    );

    -- Insertar en auth.identities
    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at,
        email
    ) VALUES (
        gen_random_uuid(),
        new_user_id,
        jsonb_build_object('sub', new_user_id::text, 'email', lower(p_email)),
        'email',
        new_user_id::text,
        NOW(),
        NOW(),
        NOW(),
        lower(p_email)
    );

    -- Crear / actualizar perfil en profiles
    INSERT INTO public.profiles (
        id, 
        email, 
        full_name, 
        role,
        referral_code,
        created_at,
        updated_at
    ) VALUES (
        new_user_id, 
        lower(p_email), 
        p_name, 
        'aliado',
        UPPER(SUBSTRING(new_user_id::text, 1, 6)),
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET role = 'aliado', full_name = p_name, email = lower(p_email);

    -- Insertar en public.comercios
    INSERT INTO public.comercios (
        id,
        name,
        description,
        address,
        is_active,
        owner_uid,
        email,
        business_type,
        whatsapp,
        rating,
        reviews,
        image,
        logo_url,
        category,
        is_approved,
        is_visible,
        "isVisible",
        is_verified,
        "isVerified",
        verification_status,
        delivery_time,
        location,
        deuda_comisiones_acumulada,
        deuda_delivery_acumulada,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        p_name,
        p_description,
        p_address,
        true,
        new_user_id,
        lower(p_email),
        'restaurant',
        p_whatsapp,
        5.0,
        0,
        p_logo_url,
        p_logo_url,
        p_category,
        true,
        true,
        true,
        true,
        true,
        'verified',
        '30-45 min',
        jsonb_build_object('address', p_address, 'city', p_city, 'state', p_state),
        0.00,
        0.00,
        NOW(),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'comercio_id', new_user_id,
        'email', lower(p_email),
        'name', p_name
    );
END;
$$;

-- 4. Función para confirmar venta de WhatsApp, cobrar comisión y registrar reseña pública
CREATE OR REPLACE FUNCTION confirm_whatsapp_order_and_review(
    p_order_id uuid,
    p_restaurant_id uuid,
    p_user_id uuid,
    p_user_name text,
    p_user_avatar text,
    p_total_amount numeric,
    p_payment_method text,
    p_payment_proof_url text DEFAULT NULL,
    p_payment_reference text DEFAULT NULL,
    p_rating int DEFAULT 5,
    p_comment text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_commission numeric(10,2);
    v_is_pago_movil boolean := (lower(p_payment_method) = 'pago_movil');
    v_points_earned int := 0;
    v_new_rating numeric(3,1) := 5.0;
    v_new_reviews_count int := 0;
    v_restaurant_name text := 'Comercio';
BEGIN
    -- 1. Obtener nombre del comercio
    SELECT name INTO v_restaurant_name FROM public.comercios WHERE id = p_restaurant_id;

    -- 2. Calcular comisión de la app
    -- Menor a $10: $0.50 | Mayor o igual a $10: $1.00
    IF p_total_amount < 10.00 THEN
        v_commission := 0.50;
    ELSE
        v_commission := 1.00;
    END IF;

    -- 3. Acumular comisión en la cuenta del comercio
    UPDATE public.comercios
    SET deuda_comisiones_acumulada = COALESCE(deuda_comisiones_acumulada, 0) + v_commission
    WHERE id = p_restaurant_id;

    -- 4. Calcular puntos (1 punto por cada dólar gastado, mínimo 1 si total > 0)
    IF p_total_amount > 0 THEN
        v_points_earned := GREATEST(1, ROUND(p_total_amount)::int);
    END IF;

    -- 5. Si NO es pago móvil (efectivo, divisa, punto de venta), otorgar puntos inmediatamente
    IF NOT v_is_pago_movil AND p_user_id IS NOT NULL AND v_points_earned > 0 THEN
        PERFORM public.increment_user_and_restaurant_points(p_user_id, p_restaurant_id, v_points_earned);
    END IF;

    -- 6. Insertar o actualizar pedido (Upsert)
    INSERT INTO public.orders (
        id,
        restaurant_id,
        restaurant_name,
        user_id,
        user_name,
        total,
        subtotal,
        payment_method,
        payment_reference,
        payment_proof_url,
        commission_amount,
        status,
        payment_status,
        whatsapp_order,
        points_credited,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        p_restaurant_id,
        COALESCE(v_restaurant_name, 'Comercio'),
        p_user_id,
        COALESCE(p_user_name, 'Cliente'),
        p_total_amount,
        p_total_amount,
        p_payment_method,
        p_payment_reference,
        p_payment_proof_url,
        v_commission,
        'completed',
        CASE WHEN v_is_pago_movil THEN 'pending_verification' ELSE 'completed' END,
        true,
        NOT v_is_pago_movil,
        NOW(),
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        restaurant_id = EXCLUDED.restaurant_id,
        restaurant_name = COALESCE(v_restaurant_name, orders.restaurant_name),
        total = p_total_amount,
        subtotal = p_total_amount,
        payment_method = p_payment_method,
        payment_reference = p_payment_reference,
        payment_proof_url = p_payment_proof_url,
        commission_amount = v_commission,
        status = 'completed',
        payment_status = CASE WHEN v_is_pago_movil THEN 'pending_verification' ELSE 'completed' END,
        whatsapp_order = true,
        points_credited = NOT v_is_pago_movil,
        updated_at = NOW();

    -- 7. Insertar reseña pública
    IF p_rating IS NOT NULL AND p_rating >= 1 THEN
        INSERT INTO public.reviews (
            id,
            restaurant_id,
            user_id,
            order_id,
            rating,
            comment,
            user_name,
            user_avatar,
            is_hidden,
            created_at
        ) VALUES (
            gen_random_uuid(),
            p_restaurant_id,
            p_user_id,
            p_order_id,
            p_rating,
            COALESCE(p_comment, ''),
            COALESCE(p_user_name, 'Cliente'),
            p_user_avatar,
            false,
            NOW()
        );

        -- Recalcular promedio de estrellas y total de reseñas para el comercio
        SELECT 
            COALESCE(ROUND(AVG(rating)::numeric, 1), 5.0),
            COUNT(*)
        INTO v_new_rating, v_new_reviews_count
        FROM public.reviews
        WHERE restaurant_id = p_restaurant_id AND (is_hidden IS FALSE OR is_hidden IS NULL);

        UPDATE public.comercios
        SET 
            rating = v_new_rating,
            reviews = v_new_reviews_count
        WHERE id = p_restaurant_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'commission_applied', v_commission,
        'points_awarded', CASE WHEN NOT v_is_pago_movil THEN v_points_earned ELSE 0 END,
        'points_pending', CASE WHEN v_is_pago_movil THEN v_points_earned ELSE 0 END,
        'new_rating', v_new_rating,
        'new_reviews_count', v_new_reviews_count
    );
END;
$$;

-- 5. Función para que el Super Admin apruebe Pago Móvil y asigne puntos
CREATE OR REPLACE FUNCTION verify_pago_movil_points(
    p_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order record;
    v_points int := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;

    IF v_order.points_credited = true THEN
        RETURN jsonb_build_object('success', false, 'message', 'Los puntos de este pedido ya fueron acreditados');
    END IF;

    IF v_order.total > 0 THEN
        v_points := GREATEST(1, ROUND(v_order.total)::int);
    END IF;

    -- Acreditar puntos
    IF v_order.user_id IS NOT NULL AND v_points > 0 THEN
        PERFORM public.increment_user_and_restaurant_points(v_order.user_id, v_order.restaurant_id, v_points);
    END IF;

    -- Marcar como verificado y acreditado
    UPDATE public.orders
    SET 
        payment_status = 'completed',
        points_credited = true,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'points_credited', v_points,
        'user_id', v_order.user_id
    );
END;
$$;
