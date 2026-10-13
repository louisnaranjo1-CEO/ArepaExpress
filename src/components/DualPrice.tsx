import React from 'react';
import { useCurrency } from '../context/CurrencyContext';

interface DualPriceProps {
    usdAmount: number;
    className?: string;
    usdClassName?: string;
    bsClassName?: string;
    showDivider?: boolean;
    customRate?: number;
}

export default function DualPrice({ 
    usdAmount, 
    className = "flex flex-wrap items-center gap-1.5", 
    usdClassName = "text-inherit", 
    bsClassName = "text-[0.85em] font-medium opacity-80",
    showDivider = true,
    customRate
}: DualPriceProps) {
    const { bcvRate, loadingRate } = useCurrency();
    const effectiveRate = customRate && customRate > 0 ? customRate : bcvRate;

    return (
        <span className={className}>
            <span className={usdClassName}>${usdAmount.toFixed(2)}</span>
            {showDivider && <span className="opacity-40">|</span>}
            <span className={bsClassName}>
                {(!effectiveRate || (loadingRate && !customRate)) ? '... Bs' : `${(usdAmount * effectiveRate).toFixed(2)} Bs`}
            </span>
        </span>
    );
}
