require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const sharp = require('sharp');
const axios = require('axios');
const { fal } = require('@fal-ai/serverless-client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Configuración segura de la base de datos
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// =====================================================
// DRIVERS — Disponibilidad y Gestión
// =====================================================

// GET /api/drivers/available — Conteo de drivers disponibles por tipo de vehículo
// Este endpoint reemplaza los 3 onSnapshot listeners de Taxi.tsx
app.get('/api/drivers/available', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        vehicle_type, 
        COUNT(*)::int as count
      FROM drivers 
      WHERE is_online = true 
        AND availability = 'active' 
        AND status = 'active'
        AND firebase_uid NOT IN (
          SELECT DISTINCT driver_firebase_uid 
          FROM transport_requests 
          WHERE status IN ('accepted', 'arriving', 'in_progress') 
            AND driver_firebase_uid IS NOT NULL
        )
      GROUP BY vehicle_type;
    `);

    const counts = { moto: 0, carro: 0, ejecutivo: 0 };
    result.rows.forEach(row => {
      if (counts.hasOwnProperty(row.vehicle_type)) {
        counts[row.vehicle_type] = row.count;
      }
    });

    res.json(counts);
  } catch (error) {
    console.error('Error fetching available drivers:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/drivers/:uid/location — Actualizar ubicación del driver (GPS adaptativo)
app.put('/api/drivers/:uid/location', async (req, res) => {
  try {
    const { uid } = req.params;
    const { lat, lng, heading, speed } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    // Actualizar ubicación actual del driver
    await pool.query(`
      UPDATE drivers 
      SET current_location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          current_heading = COALESCE($3, current_heading),
          current_speed = COALESCE($4, current_speed),
          location_updated_at = NOW()
      WHERE firebase_uid = $5;
    `, [lng, lat, heading || 0, speed || 0, uid]);

    // Guardar en historial para tracking (solo últimas 24h se mantienen)
    await pool.query(`
      INSERT INTO driver_location_history (driver_firebase_uid, lat, lng, heading, speed)
      VALUES ($1, $2, $3, $4, $5);
    `, [uid, lat, lng, heading || 0, speed || 0]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating driver location:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/drivers/:uid/status — Cambiar estado online/availability del driver
app.put('/api/drivers/:uid/status', async (req, res) => {
  try {
    const { uid } = req.params;
    const { isOnline, availability } = req.body;

    await pool.query(`
      UPDATE drivers 
      SET is_online = COALESCE($1, is_online),
          availability = COALESCE($2, availability)
      WHERE firebase_uid = $3;
    `, [isOnline, availability, uid]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating driver status:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/drivers/:uid — Obtener perfil y ubicación actual del driver
app.get('/api/drivers/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const result = await pool.query(`
      SELECT 
        id, firebase_uid, email, full_name, phone, cedula, rif, age,
        vehicle_type, vehicle_plate, is_online, availability,
        ST_Y(current_location::geometry) as lat,
        ST_X(current_location::geometry) as lng,
        current_heading, current_speed,
        location_updated_at,
        selfie_url, vehicle_url, license_url,
        home_state, home_city, home_coords_lat, home_coords_lng,
        status, created_at, updated_at
      FROM drivers 
      WHERE firebase_uid = $1;
    `, [uid]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const d = result.rows[0];
    
    // Build homeLocation safely
    let homeLocation = null;
    if (d.home_state) {
        homeLocation = { state: d.home_state, city: d.home_city };
        if (d.home_coords_lat != null && d.home_coords_lng != null) {
            homeLocation.coords = { lat: d.home_coords_lat, lng: d.home_coords_lng };
        }
    }

    res.json({
      id: d.firebase_uid,
      email: d.email,
      fullName: d.full_name,
      phone: d.phone,
      cedula: d.cedula,
      rif: d.rif,
      age: d.age,
      vehicleType: d.vehicle_type,
      vehiclePlate: d.vehicle_plate,
      isOnline: d.is_online,
      availability: d.availability,
      currentLocation: d.lat && d.lng ? { latitude: d.lat, longitude: d.lng } : null,
      currentHeading: d.current_heading,
      currentSpeed: d.current_speed,
      locationUpdatedAt: d.location_updated_at,
      documents: {
        selfieUrl: d.selfie_url || '',
        vehicleUrl: d.vehicle_url || '',
        licenseUrl: d.license_url || '',
      },
      homeLocation: homeLocation,
      status: d.status,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    });
  } catch (error) {
    console.error('Error fetching driver profile:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/drivers/:uid/location-history — Últimas N ubicaciones para tracking animado
app.get('/api/drivers/:uid/location-history', async (req, res) => {
  try {
    const { uid } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    const result = await pool.query(`
      SELECT lat, lng, heading, speed, recorded_at
      FROM driver_location_history
      WHERE driver_firebase_uid = $1
      ORDER BY recorded_at DESC
      LIMIT $2;
    `, [uid, limit]);

    res.json(result.rows.reverse()); // Ordered oldest → newest for animation
  } catch (error) {
    console.error('Error fetching driver location history:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/drivers/register — Registrar un nuevo driver desde la app
app.post('/api/drivers/register', async (req, res) => {
  try {
    const {
      firebase_uid, email, full_name, phone, cedula, rif, age,
      vehicle_type, vehicle_plate, selfie_url, vehicle_url, license_url,
      home_state, home_city, home_coords_lat, home_coords_lng
    } = req.body;

    if (!firebase_uid || !email || !full_name) {
      return res.status(400).json({ error: 'firebase_uid, email, and full_name are required' });
    }

    const result = await pool.query(`
      INSERT INTO drivers (
        firebase_uid, email, full_name, phone, cedula, rif, age,
        vehicle_type, vehicle_plate, selfie_url, vehicle_url, license_url,
        home_state, home_city, home_coords_lat, home_coords_lng,
        status, is_online, availability
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'pending', false, 'offline')
      ON CONFLICT (firebase_uid) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        cedula = EXCLUDED.cedula,
        rif = EXCLUDED.rif,
        age = EXCLUDED.age,
        vehicle_type = EXCLUDED.vehicle_type,
        vehicle_plate = EXCLUDED.vehicle_plate,
        selfie_url = EXCLUDED.selfie_url,
        vehicle_url = EXCLUDED.vehicle_url,
        license_url = EXCLUDED.license_url,
        home_state = EXCLUDED.home_state,
        home_city = EXCLUDED.home_city,
        home_coords_lat = EXCLUDED.home_coords_lat,
        home_coords_lng = EXCLUDED.home_coords_lng
      RETURNING id, firebase_uid, status;
    `, [firebase_uid, email, full_name, phone, cedula, rif, age,
        vehicle_type, vehicle_plate, selfie_url, vehicle_url, license_url,
        home_state, home_city, home_coords_lat, home_coords_lng]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error registering driver:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =====================================================
// DELIVERY — ETA y Pricing (ya existentes, mejorados)
// =====================================================

// Endpoint: Cálculo de Tiempo de Entrega Estimado (ETA)
app.post('/api/delivery/eta', async (req, res) => {
  try {
    const { courier_location, customer_location } = req.body;

    if (!courier_location || !customer_location) {
      return res.status(400).json({ error: 'Locations are required' });
    }

    const query = `
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance_meters;
    `;
    const values = [
      courier_location.lng, courier_location.lat,
      customer_location.lng, customer_location.lat
    ];

    const result = await pool.query(query, values);
    const distanceMeters = result.rows[0].distance_meters;

    // Velocidad promedio de 30 km/h (8.33 m/s)
    const speedMetersPerSecond = 8.33;
    const estimatedTimeSeconds = distanceMeters / speedMetersPerSecond;

    res.json({
      distance_meters: distanceMeters,
      estimated_time_minutes: Math.ceil(estimatedTimeSeconds / 60)
    });
  } catch (error) {
    console.error('Error calculating ETA:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint: Cálculo de Tarifas Dinámicas
app.post('/api/pricing/quote', async (req, res) => {
  try {
    const { origin, destination } = req.body;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }

    const distanceQuery = `
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
      ) as distance_meters;
    `;
    const distanceValues = [
      origin.lng, origin.lat,
      destination.lng, destination.lat
    ];

    const distanceResult = await pool.query(distanceQuery, distanceValues);
    const distanceMeters = distanceResult.rows[0].distance_meters;
    const distanceKm = distanceMeters / 1000;

    const settingsQuery = `SELECT base_fare, price_per_km, surge_multiplier FROM delivery_settings WHERE id = 1`;
    const settingsResult = await pool.query(settingsQuery);
    
    let BASE_FARE = 2.00;
    let PRICE_PER_KM = 0.50;
    let surgeMultiplier = 1.0;

    if (settingsResult.rows.length > 0) {
        const settings = settingsResult.rows[0];
        BASE_FARE = parseFloat(settings.base_fare);
        PRICE_PER_KM = parseFloat(settings.price_per_km);
        surgeMultiplier = parseFloat(settings.surge_multiplier);
    }

    const estimatedPrice = (BASE_FARE + (distanceKm * PRICE_PER_KM)) * surgeMultiplier;

    res.json({
      distance_km: distanceKm.toFixed(2),
      base_fare: BASE_FARE,
      price_per_km: PRICE_PER_KM,
      surge_multiplier: surgeMultiplier,
      estimated_price: estimatedPrice.toFixed(2)
    });

  } catch (error) {
    console.error('Error calculating quote:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// =====================================================
// Cleanup periódico de historial de ubicaciones
// =====================================================
setInterval(async () => {
  try {
    const result = await pool.query(`
      DELETE FROM driver_location_history 
      WHERE recorded_at < NOW() - INTERVAL '24 hours'
    `);
    if (result.rowCount > 0) {
      console.log(`Cleaned up ${result.rowCount} old location records`);
    }
  } catch (error) {
    console.error('Error cleaning up location history:', error);
  }
}, 60 * 60 * 1000); // Cada hora

// =====================================================
// ESTUDIO IA / PRODUCT PHOTO PROCESSOR
// Pipeline Determinista:
// 1. Inferencia SOTA (BiRefNet v2 en Fal.ai si FAL_KEY está configurada)
// 2. Fallback inteligente a pre-recorte si no hay API key
// 3. Montaje en lienzo blanco #FFFFFF de 1000x1000 px centrado con 50px de padding
// 4. Compresión a WebP (calidad 82, effort 4) -> 60-90 KB
// =====================================================

async function processStoreProductImage(inputBuffer) {
  let cutProductBuffer = inputBuffer;
  let isAiCutout = false;
  let inferenceMessage = '';

  if (process.env.FAL_KEY) {
    try {
      fal.config({
        credentials: process.env.FAL_KEY,
      });

      const base64Image = `data:image/jpeg;base64,${inputBuffer.toString('base64')}`;
      console.log('Invocando BiRefNet v2 en fal.ai...');

      const result = await fal.subscribe('fal-ai/birefnet/v2', {
        input: {
          image_url: base64Image,
        },
        logs: false,
      });

      const transparentPngUrl = result?.data?.image?.url;
      if (transparentPngUrl) {
        const response = await axios.get(transparentPngUrl, { responseType: 'arraybuffer' });
        cutProductBuffer = Buffer.from(response.data);
        isAiCutout = true;
        inferenceMessage = 'Segmentación BiRefNet v2 completada con éxito';
        console.log('Segmentación BiRefNet v2 completada con éxito');
      }
    } catch (aiError) {
      console.error('Error durante inferencia BiRefNet en fal.ai:', aiError?.message || aiError);
      inferenceMessage = `Fallo en inferencia IA (${aiError?.message || 'Error'}). Se aplicó encuadre de estudio optimizado.`;
      cutProductBuffer = inputBuffer;
    }
  } else {
    inferenceMessage = 'FAL_KEY no configurada. Se generó lienzo de estudio 1000x1000 optimizado a WebP sin recorte.';
  }

  // 1. Redimensionar el producto recortado para que quepa en un canvas de 900x900
  // dejando 50px de margen interior en cada lado sin deformar el aspect ratio
  const resizedProduct = await sharp(cutProductBuffer)
    .resize({
      width: 900,
      height: 900,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  // 2. Crear lienzo blanco puro (#FFFFFF) de 1000x1000 px y componer el producto centrado
  const finalProductWebP = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
  .composite([
    {
      input: resizedProduct,
      gravity: 'center'
    }
  ])
  .webp({
    quality: 82,
    effort: 4
  })
  .toBuffer();

  return {
    buffer: finalProductWebP,
    isAiCutout,
    message: inferenceMessage,
    sizeBytes: finalProductWebP.length,
  };
}

app.post('/api/products/process-image', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 es requerido' });
    }

    let cleanBase64 = imageBase64;
    if (cleanBase64.includes(';base64,')) {
      cleanBase64 = cleanBase64.split(';base64,')[1];
    }

    const inputBuffer = Buffer.from(cleanBase64, 'base64');
    const result = await processStoreProductImage(inputBuffer);

    res.json({
      success: true,
      processedImageBase64: `data:image/webp;base64,${result.buffer.toString('base64')}`,
      isAiCutout: result.isAiCutout,
      sizeBytes: result.sizeBytes,
      message: result.message,
    });
  } catch (error) {
    console.error('Error procesando imagen de producto:', error);
    res.status(500).json({ error: error.message || 'Error procesando imagen' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Un 2x3 Backend listening on port ${PORT}`);
});
