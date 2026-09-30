import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'deliexpress.app',
  appName: 'Un 2x3app',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    cleartext: true,
    allowNavigation: [
      'maps.googleapis.com',
      '*.googleapis.com',
      '*.gstatic.com',
      '*.google.com'
    ]
  }
};

export default config;
