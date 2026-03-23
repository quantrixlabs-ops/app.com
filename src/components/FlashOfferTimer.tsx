import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';

type Props = {
  basePrice: number;
};

const FLASH_DURATION_SECS = 60 * 60; // 60 minutes
const FLASH_DISCOUNT = 0.10;
const SESSION_KEY = 'fn_flash_expiry';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);

function getOrCreateExpiry(): number {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const expiry = Number(stored);
      if (expiry > Date.now()) return expiry;
    }
  } catch { /* sessionStorage unavailable */ }
  const newExpiry = Date.now() + FLASH_DURATION_SECS * 1000;
  try { sessionStorage.setItem(SESSION_KEY, String(newExpiry)); } catch { /* ignore */ }
  return newExpiry;
}

function resetExpiry(): number {
  const newExpiry = Date.now() + FLASH_DURATION_SECS * 1000;
  try { sessionStorage.setItem(SESSION_KEY, String(newExpiry)); } catch { /* ignore */ }
  return newExpiry;
}

function secsRemaining(expiry: number): number {
  return Math.max(0, Math.ceil((expiry - Date.now()) / 1000));
}

export default function FlashOfferTimer({ basePrice }: Props) {
  const [expiry, setExpiry] = useState<number>(() => getOrCreateExpiry());
  const [secs, setSecs] = useState<number>(() => secsRemaining(getOrCreateExpiry()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = secsRemaining(expiry);
      if (remaining === 0) {
        // Reset to a fresh 60-minute window
        const newExpiry = resetExpiry();
        setExpiry(newExpiry);
        setSecs(FLASH_DURATION_SECS);
      } else {
        setSecs(remaining);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiry]);

  const flashPrice = Math.round(basePrice * (1 - FLASH_DISCOUNT));
  const mins = String(Math.floor(secs / 60)).padStart(2, '0');
  const seconds = String(secs % 60).padStart(2, '0');

  return (
    <div className="space-y-3">
      {/* Dynamic price row */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-wrap items-baseline gap-3"
      >
        <p className="text-3xl font-black text-slate-950">{formatCurrency(flashPrice)}</p>
        <p className="text-lg font-medium text-slate-400 line-through">{formatCurrency(basePrice)}</p>
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
          10% OFF
        </span>
      </motion.div>

      {/* Flash offer countdown bar */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3"
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-100">
          <Zap size={16} className="fill-orange-500 text-orange-500" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-orange-800">
            Flash offer — order within{' '}
            <span className="font-mono tabular-nums text-orange-600">
              {mins}:{seconds}
            </span>{' '}
            to get extra 10% OFF
          </p>
          <p className="mt-0.5 text-xs font-medium text-orange-600">
            You save {formatCurrency(basePrice - flashPrice)} on this order
          </p>
        </div>
      </motion.div>
    </div>
  );
}
