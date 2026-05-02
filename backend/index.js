const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Configuración de la base de datos
const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'postgres',
});

// Endpoint 1: Cálculo de Tiempo de Entrega Estimado (ETA)
app.post('/api/delivery/eta', async (req, res) => {
  try {
    const { courier_location, customer_location } = req.body;

    if (!courier_location || !customer_location) {
      return res.status(400).json({ error: 'Locations are required' });
    }

    // Calcular la distancia usando PostGIS
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

// Endpoint 2: Cálculo de Tarifas Dinámicas consultando la Base de Datos
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

    // Obtener configuración de tarifas desde la base de datos (Controlado por Super_Admin)
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

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Un 2x3 Backend listening on port ${PORT}`);
});
