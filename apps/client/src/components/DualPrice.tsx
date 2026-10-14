import React from 'react';
import { useCurrency } from '../context/CurrencyContext';

interface DualPriceProps {
    usdAmount: number;
    className?: string;
    usdClassName?: string;
    bsClassName?: string;
    showDivider?: boolean;
    customRate?: number;
    fixedBsAmount?: number;
}

export default function DualPrice({ 
    usdAmount, 
    className = "flex flex-wrap items-center gap-1.5", 
    usdClassName = "text-inherit", 
    bsClassName = "text-[0.85em] font-medium opacity-80",
    showDivider = true,
    customRate,
    fixedBsAmount
}: DualPriceProps) {
    const { bcvRate, loadingRate } = useCurrency();
    const rateToUse = (customRate && customRate > 0) ? customRate : bcvRate;

    return (
        <span className={className}>
            <span className={usdClassName}>${usdAmount.toFixed(2)}</span>
            {showDivider && <span className="opacity-40">|</span>}
            <span className={bsClassName}>
                {fixedBsAmount != null
                    ? `${Number(fixedBsAmount).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`
                    : (loadingRate || !rateToUse ? '... Bs' : `${(usdAmount * rateToUse).toFixed(2)} Bs`)}
            </span>
        </span>
    );
}
