import React from 'react';
import CpanelApp from './cpanel/CpanelApp';
import { Toaster } from 'react-hot-toast';

export default function App() {
  return (
    <>
      <Toaster position="top-center" reverseOrder={false} />
      <CpanelApp />
    </>
  );
}

