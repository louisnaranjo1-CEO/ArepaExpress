import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../../'), '');
  return {
    root: __dirname,
    publicDir: path.resolve(__dirname, 'public'),
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          name: 'Deliexpress Repartidor',
          short_name: 'Repartidor',
          description: 'Panel de Repartidores y Conductores Deliexpress',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,json}'],
          maximumFileSizeToCacheInBytes: 5242880,
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/(?:maps\.googleapis\.com|maps\.gstatic\.com|khms[0-9]?\.google\.com|mts[0-9]?\.google\.com|cbks[0-9]?\.google\.com|lh[0-9]?\.googleusercontent\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'delivery-google-maps-tiles-cache',
                expiration: {
                  maxEntries: 2500,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, '../../packages/shared/src'),
      },
    },
    server: {
      port: 3002,
      host: '0.0.0.0',
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1200,
    },
  };
});
