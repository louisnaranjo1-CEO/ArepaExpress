import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { CurrencyProvider } from './context/CurrencyContext.tsx';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <CurrencyProvider>
        <BrandingProvider>
          <App />
        </BrandingProvider>
      </CurrencyProvider>
    </AuthProvider>
  </StrictMode>,
);
