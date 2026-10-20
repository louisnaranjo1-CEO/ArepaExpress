import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.un2x3.negocio',
  appName: 'Un 2x3 Negocios',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true,
    allowNavigation: [
      '*.mapbox.com',
      'api.mapbox.com',
      'events.mapbox.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.google.com'
    ]
  }
};

export default config;
