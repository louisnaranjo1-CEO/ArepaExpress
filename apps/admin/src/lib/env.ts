import { Capacitor } from '@capacitor/core';

export const isDemoMode = () => {
  if (import.meta.env.PROD) return false;
  if (Capacitor.isNativePlatform()) return false;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  return hostname === 'demo.deliexpress.app';
};

export const UN2X3_LOGO = "https://xfialzrbbsdzzcjtefqo.supabase.co/storage/v1/object/public/branding/logos/app_client_logo_1788875672174.png";
