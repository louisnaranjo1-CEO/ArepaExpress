import React from 'react';
import { useCurrency } from '../context/CurrencyContext';

interface DualPriceProps {
    usdAmount: number;
    className?: string;
    usdClassName?: string;
    bsClassName?: string;
    showDivider?: boolean;
}

export default function DualPrice({ 
    usdAmount, 
    className = "flex flex-wrap items-center gap-1.5", 
    usdClassName = "text-inherit", 
    bsClassName = "text-[0.85em] font-medium opacity-80",
    showDivider = true
}: DualPriceProps) {
    const { bcvRate, loadingRate } = useCurrency();

    return (
        <span className={className}>
            <span className={usdClassName}>${usdAmount.toFixed(2)}</span>
            {showDivider && <span className="opacity-40">|</span>}
            <span className={bsClassName}>
                {loadingRate || !bcvRate ? 'Bs ...' : `Bs ${(usdAmount * bcvRate).toFixed(2)}`}
            </span>
        </span>
    );
}
