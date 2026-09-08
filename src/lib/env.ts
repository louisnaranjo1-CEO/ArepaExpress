import { Capacitor } from '@capacitor/core';

export const isDemoMode = () => {
  if (Capacitor.isNativePlatform()) return false;
  const hostname = window.location.hostname;
  return hostname === 'demo.deliexpress.app' || hostname === 'localhost';
};

export const UN2X3_LOGO = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_client_logo_1788875672174.png";
