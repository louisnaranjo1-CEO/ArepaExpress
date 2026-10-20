import React from 'react';
import CpanelApp from './cpanel/CpanelApp';
import { Toaster } from 'react-hot-toast';
import { useGlobalAudioAlerts } from './hooks/useGlobalAudioAlerts';

export default function App() {
  useGlobalAudioAlerts('cpanel');

  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <CpanelApp />
    </>
  );
}
