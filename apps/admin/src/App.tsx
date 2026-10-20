import React, { useEffect } from 'react';
import CpanelApp from './cpanel/CpanelApp';
import { Toaster } from 'react-hot-toast';
import { useGlobalAudioAlerts } from './hooks/useGlobalAudioAlerts';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { handleDeepLinkAuthUrl } from './lib/auth-service';
import PermissionsModal from './components/PermissionsModal';

export default function App() {
  useGlobalAudioAlerts('cpanel');

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const sub = CapApp.addListener('appUrlOpen', async (event) => {
      if (event.url && (event.url.includes('auth/callback') || event.url.includes('access_token') || event.url.includes('code='))) {
        await handleDeepLinkAuthUrl(event.url);
      }
    });

    return () => {
      sub.then(s => s.remove());
    };
  }, []);

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <PermissionsModal />
      <CpanelApp />
    </>
  );
}
