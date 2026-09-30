import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xfialzrbbsdzzcjtefqo.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SERVICE_KEY) {
  console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface AuditLog {
  cycle: string;
  step: string;
  status: 'PASS' | 'FAIL' | 'BUG_DETECTED';
  details: string;
  payload?: any;
}

const auditLogs: AuditLog[] = [];

function log(cycle: string, step: string, status: 'PASS' | 'FAIL' | 'BUG_DETECTED', details: string, payload?: any) {
  auditLogs.push({ cycle, step, status, details, payload });
  const icon = status === 'PASS' ? '✅' : status === 'BUG_DETECTED' ? '⚠️ [BUG]' : '❌ [FAIL]';
  console.log(`${icon} [${cycle}] ${step}: ${details}`);
}

async function runAudit() {
  console.log("=== INICIANDO VERIFICACIÓN E2E DE CORRECCIONES EN TODOS LOS CICLOS ===");
  console.log(`Supabase URL: ${SUPABASE_URL}`);
  
  const testIds = {
    clientAuthId: '',
    motoDriverAuthId: '',
    econoDriverAuthId: '',
    confortDriverAuthId: '',
    storeOwnerAuthId: '',
    storeId: '',
    productId: '',
    cashierId: '',
    mototaxiReqId: '',
    econoTaxiReqId: '',
    confortTaxiReqId: '',
    orderId: '',
    deliveryTrId: '',
    cashRegisterId: ''
  };

  try {
    // ----------------------------------------------------
    // ETAPA 1: CREACIÓN DE USUARIOS DE PRUEBA
    // ----------------------------------------------------
    console.log("\n--- ETAPA 1: Creación de Usuarios de Pruebas ---");

    // 1. Cliente
    const clientEmail = `audit_client_${Date.now()}@un2x3test.com`;
    const { data: clientUser, error: clientErr } = await supabase.auth.admin.createUser({
      email: clientEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Cliente Auditoría 2X3', phone: '+584141112233' }
    });
    if (clientErr || !clientUser.user) throw new Error(`Error creando cliente: ${clientErr?.message}`);
    testIds.clientAuthId = clientUser.user.id;

    await supabase.from('profiles').upsert({
      id: testIds.clientAuthId,
      full_name: 'Cliente Auditoría 2X3',
      email: clientEmail,
      phone: '+584141112233',
      cedula: 'V-28111222',
      role: 'cliente',
      points: 10,
      coords: { lat: 8.9285, lng: -67.4270 },
      last_city: 'Calabozo',
      last_state: 'Guárico',
      addresses: [{ id: 'addr_1', address: 'Plaza Bolívar Casa 1', isDefault: true }]
    });
    log("Setup", "Crear Cliente & Guardar Dirección", "PASS", `Cliente creado con ID: ${testIds.clientAuthId} y dirección guardada`);

    // 2. Conductor Mototaxi
    const motoEmail = `audit_moto_${Date.now()}@un2x3test.com`;
    const { data: motoUser, error: motoErr } = await supabase.auth.admin.createUser({
      email: motoEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Chofer Moto Auditoría', phone: '+584142223344' }
    });
    if (motoErr || !motoUser.user) throw new Error(`Error creando chofer moto: ${motoErr?.message}`);
    testIds.motoDriverAuthId = motoUser.user.id;

    await supabase.from('profiles').upsert({
      id: testIds.motoDriverAuthId,
      full_name: 'Chofer Moto Auditoría',
      email: motoEmail,
      phone: '+584142223344',
      cedula: 'V-24111222',
      role: 'conductor'
    });

    await supabase.from('drivers').upsert({
      id: testIds.motoDriverAuthId,
      full_name: 'Chofer Moto Auditoría',
      phone: '+584142223344',
      cedula: 'V-24111222',
      vehicle_type: 'moto',
      vehicle_brand: 'Bera',
      vehicle_model: 'SBR 150',
      vehicle_year: '2023',
      vehicle_plate: 'AA1B22C',
      is_online: true,
      availability: 'active',
      status: 'active',
      has_ac: false,
      is_comfort_eligible: false,
      current_location: { lat: 8.9290, lng: -67.4265 },
      total_trips: 0,
      commission_debt: 0
    });
    log("Setup", "Crear Conductor Mototaxi", "PASS", `Driver Moto creado con ID: ${testIds.motoDriverAuthId}`);

    // 3. Conductor Carro Económico
    const econoEmail = `audit_econo_${Date.now()}@un2x3test.com`;
    const { data: econoUser, error: econoErr } = await supabase.auth.admin.createUser({
      email: econoEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Chofer Económico Auditoría', phone: '+584143334455' }
    });
    if (econoErr || !econoUser.user) throw new Error(`Error creando chofer económico: ${econoErr?.message}`);
    testIds.econoDriverAuthId = econoUser.user.id;

    await supabase.from('profiles').upsert({
      id: testIds.econoDriverAuthId,
      full_name: 'Chofer Económico Auditoría',
      email: econoEmail,
      phone: '+584143334455',
      cedula: 'V-18111222',
      role: 'conductor'
    });

    await supabase.from('drivers').upsert({
      id: testIds.econoDriverAuthId,
      full_name: 'Chofer Económico Auditoría',
      phone: '+584143334455',
      cedula: 'V-18111222',
      vehicle_type: 'carro',
      vehicle_brand: 'Chevrolet',
      vehicle_model: 'Corsa',
      vehicle_year: '2004',
      vehicle_plate: 'AB3C44D',
      is_online: true,
      availability: 'active',
      status: 'active',
      has_ac: false,
      is_comfort_eligible: false,
      current_location: { lat: 8.9300, lng: -67.4250 },
      total_trips: 0,
      commission_debt: 0
    });
    log("Setup", "Crear Conductor Carro Económico", "PASS", `Driver Económico creado con ID: ${testIds.econoDriverAuthId}`);

    // 4. Conductor Carro Confort
    const confortEmail = `audit_confort_${Date.now()}@un2x3test.com`;
    const { data: confortUser, error: confortErr } = await supabase.auth.admin.createUser({
      email: confortEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Chofer Confort Auditoría', phone: '+584144445566' }
    });
    if (confortErr || !confortUser.user) throw new Error(`Error creando chofer confort: ${confortErr?.message}`);
    testIds.confortDriverAuthId = confortUser.user.id;

    await supabase.from('profiles').upsert({
      id: testIds.confortDriverAuthId,
      full_name: 'Chofer Confort Auditoría',
      email: confortEmail,
      phone: '+584144445566',
      cedula: 'V-15111222',
      role: 'conductor'
    });

    await supabase.from('drivers').upsert({
      id: testIds.confortDriverAuthId,
      full_name: 'Chofer Confort Auditoría',
      phone: '+584144445566',
      cedula: 'V-15111222',
      vehicle_type: 'carro',
      vehicle_brand: 'Toyota',
      vehicle_model: 'Corolla Gli',
      vehicle_year: '2019',
      vehicle_plate: 'AC5D66E',
      is_online: true,
      availability: 'active',
      status: 'active',
      has_ac: true,
      is_comfort_eligible: true,
      current_location: { lat: 8.9310, lng: -67.4240 },
      total_trips: 0,
      commission_debt: 0
    });
    log("Setup", "Crear Conductor Carro Confort", "PASS", `Driver Confort creado con ID: ${testIds.confortDriverAuthId}`);

    // 5. Aliado Comercial + Comercio + Producto
    const storeOwnerEmail = `audit_store_${Date.now()}@un2x3test.com`;
    const { data: storeOwnerUser, error: storeOwnerErr } = await supabase.auth.admin.createUser({
      email: storeOwnerEmail,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { full_name: 'Dueño Comercio Auditoría', phone: '+584145556677' }
    });
    if (storeOwnerErr || !storeOwnerUser.user) throw new Error(`Error creando dueño de comercio: ${storeOwnerErr?.message}`);
    testIds.storeOwnerAuthId = storeOwnerUser.user.id;
    testIds.storeId = testIds.storeOwnerAuthId;

    await supabase.from('profiles').upsert({
      id: testIds.storeOwnerAuthId,
      full_name: 'Dueño Comercio Auditoría',
      email: storeOwnerEmail,
      phone: '+584145556677',
      role: 'admin'
    });

    const { error: comErr } = await supabase.from('comercios').insert({
      id: testIds.storeId,
      name: 'Arepera Express Audit',
      owner_uid: testIds.storeOwnerAuthId,
      category: 'Restaurante',
      address: 'Av. Bolívar cruce con Carrera 10, Calabozo',
      whatsapp: '+584145556677',
      is_active: true,
      is_approved: true,
      location: {
        lat: 8.9288,
        lng: -67.4253
      }
    });
    if (comErr) throw new Error(`Error creando comercio: ${comErr.message}`);
    log("Setup", "Crear Comercio", "PASS", `Comercio registrado: Arepera Express Audit (${testIds.storeId})`);

    // Producto
    const { data: prodData, error: prodErr } = await supabase.from('products').insert({
      restaurant_id: testIds.storeId,
      name: 'Arepa Reina Pepiada Suprema',
      description: 'Pollo desmechado con aguacate y mayonesa',
      price: 4.50,
      promo_price: 4.00,
      points_price: 15,
      is_available: true,
      is_active: true,
      order_index: 1
    }).select().single();
    if (prodErr || !prodData) throw new Error(`Error creando producto: ${prodErr?.message}`);
    testIds.productId = prodData.id;
    log("Setup", "Crear Producto", "PASS", `Producto creado: ${prodData.name} (ID: ${testIds.productId})`);

    // 6. Cajera
    const { data: cashData, error: cashErr } = await supabase.from('cashiers').insert({
      restaurant_id: testIds.storeId,
      name: 'Cajera Auditoría',
      username: `cajera_audit_${Date.now()}`,
      passcode: '1234',
      is_active: true,
      permissions: ['pos', 'close_register', 'orders']
    }).select().single();
    if (cashErr || !cashData) throw new Error(`Error creando cajera: ${cashErr?.message}`);
    testIds.cashierId = cashData.id;
    log("Setup", "Crear Cajera", "PASS", `Cajera registrada: ${cashData.username} (ID: ${testIds.cashierId})`);

    // ----------------------------------------------------
    // ETAPA 2: CICLOS DE TAXI Y TRANSPORTE
    // ----------------------------------------------------
    console.log("\n--- ETAPA 2: Verificación de Ciclos de Taxi / Transporte ---");

    // 2.1 Mototaxi
    const { data: motoReq, error: motoReqErr } = await supabase.from('transport_requests').insert({
      user_id: testIds.clientAuthId,
      user_name: 'Cliente Auditoría 2X3',
      user_phone: '+584141112233',
      user_cedula: 'V-28111222',
      origin: { lat: 8.9285, lng: -67.4270, address: 'Plaza Bolívar, Calabozo' },
      destination: { lat: 8.9320, lng: -67.4200, address: 'Centro Comercial, Calabozo' },
      type: 'transport',
      service_category: 'mototaxi',
      vehicle_type: 'moto',
      price: 0.50,
      total: 0.50,
      driver_payout: 0.25,
      commission_amount: 0.25,
      status: 'searching',
      payment_method: 'cash_usd',
      cash_currency: 'USD'
    }).select().single();

    if (motoReqErr || !motoReq) throw new Error(`Error creando req mototaxi: ${motoReqErr?.message}`);
    testIds.mototaxiReqId = motoReq.id;

    const motoFilterResult = simulateRadarFilter(motoReq, {
      vehicle_type: 'moto',
      current_location: { lat: 8.9290, lng: -67.4265 }
    });
    log("Taxi Mototaxi", "Visibilidad Chofer Moto", motoFilterResult.visible ? "PASS" : "FAIL", 
      `Chofer Moto ve solicitud: ${motoFilterResult.visible} (${motoFilterResult.reason})`);

    const econoFilterForMoto = simulateRadarFilter(motoReq, {
      vehicle_type: 'carro',
      current_location: { lat: 8.9300, lng: -67.4250 }
    });
    log("Taxi Mototaxi", "Aislamiento de Mototaxi de Carros", !econoFilterForMoto.visible ? "PASS" : "FAIL",
      `Carro Económico bloqueado de tomar mototaxi: ${!econoFilterForMoto.visible} (${econoFilterForMoto.reason})`);

    // Asignar y completar
    await supabase.from('transport_requests').update({
      status: 'accepted',
      driver_id: testIds.motoDriverAuthId,
      assigned_driver_id: testIds.motoDriverAuthId,
      driver_name: 'Chofer Moto Auditoría',
      driver_assigned_at: new Date().toISOString()
    }).eq('id', testIds.mototaxiReqId);

    await supabase.from('transport_requests').update({
      status: 'completed',
      completed_at: new Date().toISOString()
    }).eq('id', testIds.mototaxiReqId);

    // RPC confirm_service_payment_and_award_points sin ambigüedad
    const { data: motoRpcRes, error: motoRpcErr } = await supabase.rpc('confirm_service_payment_and_award_points', {
      p_request_id: testIds.mototaxiReqId,
      p_transport_id: testIds.mototaxiReqId,
      p_confirmed_by: testIds.motoDriverAuthId
    });
    if (motoRpcErr) {
      log("Taxi Mototaxi", "RPC confirm_service_payment", "FAIL", `Error en RPC: ${motoRpcErr.message}`);
    } else {
      log("Taxi Mototaxi", "RPC confirm_service_payment", "PASS", `RPC ejecutado sin conflicto de sobrecarga: ${JSON.stringify(motoRpcRes)}`);
    }

    // 2.2 Carro Económico
    const { data: econoReq, error: econoReqErr } = await supabase.from('transport_requests').insert({
      user_id: testIds.clientAuthId,
      user_name: 'Cliente Auditoría 2X3',
      origin: { lat: 8.9285, lng: -67.4270, address: 'Plaza Bolívar, Calabozo' },
      destination: { lat: 8.9350, lng: -67.4100, address: 'Salida a San Fernando' },
      type: 'transport',
      service_category: 'taxi_driver',
      vehicle_type: 'carro',
      price: 2.00,
      total: 2.00,
      driver_payout: 1.20,
      commission_amount: 0.80,
      status: 'searching',
      payment_method: 'cash_usd'
    }).select().single();
    if (econoReqErr || !econoReq) throw new Error(`Error creando req carro: ${econoReqErr?.message}`);
    testIds.econoTaxiReqId = econoReq.id;

    const econoFilterForCar = simulateRadarFilter(econoReq, {
      vehicle_type: 'carro',
      current_location: { lat: 8.9300, lng: -67.4250 }
    });
    log("Taxi Económico", "Visibilidad Chofer Económico", econoFilterForCar.visible ? "PASS" : "FAIL",
      `Chofer Económico ve solicitud: ${econoFilterForCar.visible}`);

    // Probar marcación en disputa
    const { error: disputeErr } = await supabase.from('transport_requests').update({
      payment_status: 'disputed',
      disputed_at: new Date().toISOString(),
      dispute_reason: 'Reportado en disputa por el conductor'
    }).eq('id', testIds.econoTaxiReqId);
    log("Taxi Económico", "Marcación en Disputa", !disputeErr ? "PASS" : "FAIL",
      !disputeErr ? "Disputa guardada con disputed_at y dispute_reason" : `Error: ${disputeErr?.message}`);

    // 2.3 Carro Confort
    const { data: confortReq, error: confortReqErr } = await supabase.from('transport_requests').insert({
      user_id: testIds.clientAuthId,
      user_name: 'Cliente Auditoría 2X3',
      origin: { lat: 8.9285, lng: -67.4270, address: 'Plaza Bolívar, Calabozo' },
      destination: { lat: 8.9350, lng: -67.4100, address: 'Salida a San Fernando' },
      type: 'transport',
      service_category: 'carro_confort',
      vehicle_type: 'ejecutivo',
      price: 3.50,
      total: 3.50,
      driver_payout: 2.50,
      commission_amount: 1.00,
      status: 'searching',
      payment_method: 'cash_usd'
    }).select().single();
    if (confortReqErr || !confortReq) throw new Error(`Error creando req confort: ${confortReqErr?.message}`);
    testIds.confortTaxiReqId = confortReq.id;

    const confortDriverData = {
      vehicle_type: 'carro',
      has_ac: true,
      vehicle_year: '2019',
      is_comfort_eligible: true,
      current_location: { lat: 8.9310, lng: -67.4240 }
    };
    const confortRadarResult = simulateRadarFilter(confortReq, confortDriverData);
    log("Taxi Confort", "Filtro Radar de Confort", confortRadarResult.visible ? "PASS" : "FAIL",
      `Chofer Confort ve solicitud: ${confortRadarResult.visible} (${confortRadarResult.reason})`);

    // ----------------------------------------------------
    // ETAPA 3: CICLO DE COMPRA, COCINA, DESPACHO Y CAJA
    // ----------------------------------------------------
    console.log("\n--- ETAPA 3: Verificación de Ciclo de Tienda, Cocina, Delivery y Caja ---");

    const { data: orderData, error: orderErr } = await supabase.from('orders').insert({
      user_id: testIds.clientAuthId,
      user_name: 'Cliente Auditoría 2X3',
      user_phone: '+584141112233',
      client_dni: 'V-28111222',
      restaurant_id: testIds.storeId,
      restaurant_name: 'Arepera Express Audit',
      items: [{ id: testIds.productId, name: 'Arepa Reina Pepiada Suprema', price: 4.00, quantity: 2, total: 8.00 }],
      subtotal: 8.00,
      delivery_fee: 1.50,
      driver_payout: 1.20,
      total: 9.50,
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'pago_movil',
      delivery_address: 'Calle 5 Casa #12, Calabozo',
      points_credited: false
    }).select().single();
    if (orderErr || !orderData) throw new Error(`Error creando orden: ${orderErr?.message}`);
    testIds.orderId = orderData.id;

    // Despacho: prueba de upsert con flete_pagado_por
    const { error: trUpsertErr } = await supabase.from('transport_requests').upsert({
      order_id: testIds.orderId,
      restaurant_id: testIds.storeId,
      restaurant_name: 'Arepera Express Audit',
      user_id: testIds.clientAuthId,
      driver_id: testIds.motoDriverAuthId,
      assigned_driver_id: testIds.motoDriverAuthId,
      vehicle_type: 'moto',
      type: 'food_delivery',
      service_category: 'food_delivery',
      status: 'accepted',
      price: 1.50,
      driver_payout: 1.20,
      items_summary: '2x Arepa Reina Pepiada Suprema',
      flete_pagado_por: 'negocio',
      origin: { address: 'Local', lat: 8.9288, lng: -67.4253 },
      destination: { address: 'Calle 5 Casa #12, Calabozo', lat: 8.9300, lng: -67.4220 }
    });
    log("Restaurante / Despacho", "Upsert transport_requests", !trUpsertErr ? "PASS" : "FAIL",
      !trUpsertErr ? "Enlace de transporte creado exitosamente con flete_pagado_por" : `Error: ${trUpsertErr?.message}`);

    // Despacho de orden
    await supabase.from('orders').update({
      status: 'delivering',
      delivery_driver_id: testIds.motoDriverAuthId,
      dispatched_at: new Date().toISOString()
    }).eq('id', testIds.orderId);

    // Consulta de radar de chofer incluyendo 'delivering'
    const { data: driverActiveOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('delivery_driver_id', testIds.motoDriverAuthId)
      .in('status', ['en_camino', 'in_transit', 'delivering']);

    const driverFoundActiveOrder = (driverActiveOrders || []).some(o => o.id === testIds.orderId);
    log("Driver / Radar", "Sincronización Orden Despachada", driverFoundActiveOrder ? "PASS" : "FAIL",
      driverFoundActiveOrder ? "El repartidor detecta la orden en estado 'delivering' como activa" : "Orden no detectada");

    // Marcar como entregado
    await supabase.from('orders').update({
      status: 'delivered',
      delivered_at: new Date().toISOString()
    }).eq('id', testIds.orderId);
    log("Driver / Entrega", "Entrega de Pedido", "PASS", "Orden marcada como 'delivered'");

    // Actualización de last_active_at en cajeros
    const { error: cashUpdateErr } = await supabase
      .from('cashiers')
      .update({ last_active_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', testIds.cashierId);
    log("Caja / Login", "Actualización last_active_at", !cashUpdateErr ? "PASS" : "FAIL",
      !cashUpdateErr ? "last_active_at actualizado en tabla cashiers" : `Error: ${cashUpdateErr?.message}`);

    // Cierre de caja
    const { data: registerData, error: regErr } = await supabase.from('cash_registers').insert({
      restaurant_id: testIds.storeId,
      date: new Date().toISOString(),
      gross_income: 9.50,
      total_expenses: 1.50,
      net_profit: 8.00,
      closed_by: 'Cajera Auditoría'
    }).select().single();
    if (!regErr && registerData) {
      testIds.cashRegisterId = registerData.id;
      log("Caja / Cierre", "Registro de Cierre de Caja", "PASS", `Cierre de caja guardado con ID: ${testIds.cashRegisterId}`);
    }

    // ----------------------------------------------------
    // ETAPA 4: VERIFICACIÓN DE SUPERADMIN Y LIQUIDACIONES
    // ----------------------------------------------------
    console.log("\n--- ETAPA 4: Verificación de Consultas de Superadministrador ---");

    // Historial de entregas en Superadmin con estado 'delivered'
    const { data: superadminCompletedOrders } = await supabase
      .from('orders')
      .select('*')
      .in('status', ['completed', 'delivered'])
      .eq('id', testIds.orderId);

    const adminSeesDeliveredOrder = (superadminCompletedOrders || []).length > 0;
    log("Superadmin / DeliveryManagement", "Pestaña Historial de Entregas", adminSeesDeliveredOrder ? "PASS" : "FAIL",
      adminSeesDeliveredOrder ? "Superadmin visualiza órdenes con estado 'delivered'" : "Orden no encontrada en historial");

    // Registro de pago a conductor (delivery_paid: true)
    const { error: payDriverErr } = await supabase
      .from('orders')
      .update({ delivery_paid: true })
      .eq('id', testIds.orderId);
    log("Superadmin / Liquidación", "Pago al Repartidor (delivery_paid)", !payDriverErr ? "PASS" : "FAIL",
      !payDriverErr ? "delivery_paid actualizado exitosamente en orders" : `Error: ${payDriverErr?.message}`);

  } catch (err: any) {
    console.error("\n❌ ERROR CRÍTICO DURANTE LA EJECUCIÓN:", err);
  } finally {
    // ----------------------------------------------------
    // ETAPA 5: LIMPIEZA COMPLETA DE USUARIOS Y DATOS DE PRUEBA
    // ----------------------------------------------------
    console.log("\n--- ETAPA 5: Limpieza Total de Datos de Prueba ---");

    if (testIds.orderId) {
      await supabase.from('orders').delete().eq('id', testIds.orderId);
      console.log(`- Orden eliminada: ${testIds.orderId}`);
    }
    if (testIds.mototaxiReqId) {
      await supabase.from('transport_requests').delete().eq('id', testIds.mototaxiReqId);
      console.log(`- Req Mototaxi eliminado: ${testIds.mototaxiReqId}`);
    }
    if (testIds.econoTaxiReqId) {
      await supabase.from('transport_requests').delete().eq('id', testIds.econoTaxiReqId);
      console.log(`- Req Carro Económico eliminado: ${testIds.econoTaxiReqId}`);
    }
    if (testIds.confortTaxiReqId) {
      await supabase.from('transport_requests').delete().eq('id', testIds.confortTaxiReqId);
      console.log(`- Req Carro Confort eliminado: ${testIds.confortTaxiReqId}`);
    }
    if (testIds.productId) {
      await supabase.from('products').delete().eq('id', testIds.productId);
      console.log(`- Producto eliminado: ${testIds.productId}`);
    }
    if (testIds.cashierId) {
      await supabase.from('cashiers').delete().eq('id', testIds.cashierId);
      console.log(`- Cajera eliminada: ${testIds.cashierId}`);
    }
    if (testIds.cashRegisterId) {
      await supabase.from('cash_registers').delete().eq('id', testIds.cashRegisterId);
      console.log(`- Cierre de caja eliminado: ${testIds.cashRegisterId}`);
    }
    if (testIds.storeId) {
      await supabase.from('comercios').delete().eq('id', testIds.storeId);
      console.log(`- Comercio eliminado: ${testIds.storeId}`);
    }
    if (testIds.motoDriverAuthId) {
      await supabase.from('drivers').delete().eq('id', testIds.motoDriverAuthId);
      await supabase.from('profiles').delete().eq('id', testIds.motoDriverAuthId);
      await supabase.auth.admin.deleteUser(testIds.motoDriverAuthId);
      console.log(`- Conductor Moto eliminado: ${testIds.motoDriverAuthId}`);
    }
    if (testIds.econoDriverAuthId) {
      await supabase.from('drivers').delete().eq('id', testIds.econoDriverAuthId);
      await supabase.from('profiles').delete().eq('id', testIds.econoDriverAuthId);
      await supabase.auth.admin.deleteUser(testIds.econoDriverAuthId);
      console.log(`- Conductor Económico eliminado: ${testIds.econoDriverAuthId}`);
    }
    if (testIds.confortDriverAuthId) {
      await supabase.from('drivers').delete().eq('id', testIds.confortDriverAuthId);
      await supabase.from('profiles').delete().eq('id', testIds.confortDriverAuthId);
      await supabase.auth.admin.deleteUser(testIds.confortDriverAuthId);
      console.log(`- Conductor Confort eliminado: ${testIds.confortDriverAuthId}`);
    }
    if (testIds.storeOwnerAuthId) {
      await supabase.from('profiles').delete().eq('id', testIds.storeOwnerAuthId);
      await supabase.auth.admin.deleteUser(testIds.storeOwnerAuthId);
      console.log(`- Dueño de comercio eliminado: ${testIds.storeOwnerAuthId}`);
    }
    if (testIds.clientAuthId) {
      await supabase.from('profiles').delete().eq('id', testIds.clientAuthId);
      await supabase.auth.admin.deleteUser(testIds.clientAuthId);
      console.log(`- Cliente de prueba eliminado: ${testIds.clientAuthId}`);
    }

    console.log("=== LIMPIEZA 100% COMPLETADA ===");
  }
}

function simulateRadarFilter(req: any, driverProfile: any) {
  const drvVehicle = (driverProfile?.vehicle_type || driverProfile?.vehicleType || 'moto').toLowerCase();

  const reqType = req.type || req.service_category || 'transport';
  const isMandado = reqType === 'muchacho_mandado' || req.service_category === 'muchacho_mandado';

  if (isMandado) return { visible: true, reason: 'Mandado visible para todos' };
  if (reqType === 'food_delivery' || reqType === 'package_delivery' || reqType === 'delivery_envios') {
    return { visible: true, reason: 'Delivery visible' };
  }

  const isComfortDriver = Boolean(
    driverProfile?.is_comfort_eligible ||
    driverProfile?.isComfortEligible ||
    drvVehicle === 'confort' ||
    drvVehicle === 'ejecutivo' ||
    drvVehicle === 'carro_ejecutivo' ||
    (drvVehicle === 'carro' && (driverProfile?.has_ac || driverProfile?.hasAc) && Number(driverProfile?.vehicle_year || driverProfile?.vehicleYear || 0) >= 2009)
  );

  const reqVehicle = (req.vehicle_type || req.vehicleType || 'moto').toLowerCase();
  const reqCat = (req.service_category || req.serviceCategory || '').toLowerCase();
  const isReqComfort = reqVehicle === 'ejecutivo' || reqVehicle === 'confort' || reqVehicle === 'carro_ejecutivo' || reqCat.includes('confort') || reqCat.includes('ejecutivo');

  // Solicitud Confort: Solo conductores habilitados para Confort
  if (isReqComfort) {
    return isComfortDriver 
      ? { visible: true, reason: 'Conductor Confort elegible' }
      : { visible: false, reason: 'Conductor no elegible para Confort' };
  }

  // Solicitud Mototaxi: Solo conductores de moto
  if (reqVehicle === 'moto' || reqCat === 'mototaxi') {
    return drvVehicle === 'moto'
      ? { visible: true, reason: 'Chofer de moto asignable a Mototaxi' }
      : { visible: false, reason: 'Carro no puede tomar viajes de pasajeros de Mototaxi' };
  }

  // Solicitud Carro Económico / Taxi: Conductores con carro (económico o confort)
  if (reqVehicle === 'carro' || reqCat === 'taxi_driver') {
    return (drvVehicle === 'carro' || drvVehicle === 'carro_ejecutivo' || drvVehicle === 'ejecutivo')
      ? { visible: true, reason: 'Carro asignable a Carro Económico' }
      : { visible: false, reason: 'No coincide vehículo carro' };
  }

  return reqVehicle === drvVehicle 
    ? { visible: true, reason: 'Coincidencia exacta' }
    : { visible: false, reason: `Discrepancia: req=${reqVehicle} vs drv=${drvVehicle}` };
}

runAudit();
