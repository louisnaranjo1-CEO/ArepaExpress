import React, { createContext, useContext, useEffect, useState } from 'react';

interface CurrencyContextType {
  bcvRate: number;
  loadingRate: boolean;
  errorRate: string | null;
}

const CurrencyContext = createContext<CurrencyContextType>({
  bcvRate: 0,
  loadingRate: true,
  errorRate: null
});

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [bcvRate, setBcvRate] = useState<number>(0);
  const [loadingRate, setLoadingRate] = useState<boolean>(true);
  const [errorRate, setErrorRate] = useState<string | null>(null);

  useEffect(() => {
    const fetchBCVRate = async () => {
      try {
        const response = await fetch('https://pydolarvenezuela-api.vercel.app/api/v1/dollar/page?page=bcv');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        const price = data?.monitors?.usd?.price;

        if (price) {
          setBcvRate(Number(price));
        } else {
          throw new Error('Formato de API inválido');
        }
      } catch (err) {
        console.error("Error obteniendo tasa BCV:", err);
        setErrorRate('No se pudo cargar la tasa oficial');
      } finally {
        setLoadingRate(false);
      }
    };

    fetchBCVRate();
  }, []);

  return (
    <CurrencyContext.Provider value={{ bcvRate, loadingRate, errorRate }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
