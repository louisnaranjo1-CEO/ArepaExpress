import fs from 'fs';
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
          name: 'Deliexpress',
          short_name: 'Deliexpress',
          description: 'Pide comida, envíos y transporte en un 2x3 con Deliexpress',
          theme_color: '#facc15',
          background_color: '#ffffff',
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
          maximumFileSizeToCacheInBytes: 5242880, // 5 MiB
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/.*supabase\.co\/storage\/v1\/object\/public\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'supabase-store-images-cache',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'unsplash-images-cache',
                expiration: {
                  maxEntries: 250,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-app-images',
                expiration: {
                  maxEntries: 500,
                  maxAgeSeconds: 60 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/(?:maps\.googleapis\.com|maps\.gstatic\.com|khms[0-9]?\.google\.com|mts[0-9]?\.google\.com|cbks[0-9]?\.google\.com|lh[0-9]?\.googleusercontent\.com)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-maps-tiles-cache',
                expiration: {
                  maxEntries: 2500,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        }
      }),
      {
        name: 'sync-dist-to-root',
        closeBundle() {
          try {
            const clientDist = path.resolve(__dirname, 'dist');
            const rootDist = path.resolve(__dirname, '../../dist');
            if (fs.existsSync(clientDist)) {
              fs.cpSync(clientDist, rootDist, { recursive: true, force: true });
            }
          } catch (e) {
            console.warn('Could not mirror client dist to root dist:', e);
          }
        }
      }
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
      port: 3000,
      host: '0.0.0.0',
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      chunkSizeWarningLimit: 1000,
    },
  };
});
