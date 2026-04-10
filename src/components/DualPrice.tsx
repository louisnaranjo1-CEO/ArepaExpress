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
    const amount = typeof usdAmount === 'number' ? usdAmount : 0;

    return (
        <span className={className}>
            <span className={usdClassName}>${amount.toFixed(2)}</span>
            {showDivider && <span className="opacity-40">|</span>}
            <span className={bsClassName}>
                {loadingRate || !bcvRate ? '... Bs' : `${(amount * bcvRate).toFixed(2)} Bs`}
            </span>
        </span>
    );
}
