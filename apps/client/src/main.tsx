import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';
import { CurrencyProvider } from './context/CurrencyContext.tsx';
import { AuthProvider } from './context/AuthContext';
import { BrandingProvider } from './context/BrandingContext';
import ErrorBoundary from './components/ErrorBoundary';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <CurrencyProvider>
          <BrandingProvider>
            <App />
          </BrandingProvider>
        </CurrencyProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
