import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { computeSocialProof, simulatePurchaseCount, type ProductWithSocialProof } from '../utils/socialProof';

type Props = { product: ProductWithSocialProof };

type MessageConfig = {
  key: string;
  text: string;
  urgent: boolean;
  bg: string;
  text_color: string;
};

function buildMessages(
  views: number,
  bought30m: number,
  stock: number,
  productId: number,
): MessageConfig[] {
  // Use real purchase count if available, otherwise simulate
  const purchaseCount = bought30m > 0 ? bought30m : simulatePurchaseCount(productId);

  const all: MessageConfig[] = [
    {
      key: 'viewing',
      text: `👀 ${views} ${views === 1 ? 'person is' : 'people are'} viewing this right now`,
      urgent: false,
      bg: 'bg-amber-50 border-amber-200',
      text_color: 'text-amber-800',
    },
    {
      key: 'bought',
      text: `🔥 ${purchaseCount} ${purchaseCount === 1 ? 'person' : 'people'} bought this in the last 30 mins`,
      urgent: purchaseCount >= 6,
      bg: 'bg-rose-50 border-rose-200',
      text_color: 'text-rose-700',
    },
    {
      key: 'popular',
      text: '💡 Popular choice in your area',
      urgent: false,
      bg: 'bg-slate-50 border-slate-200',
      text_color: 'text-slate-600',
    },
  ];

  // Stock alert: injected at position 0 when stock is low (priority: show first)
  if (stock > 0 && stock < 5) {
    all.unshift({
      key: 'stock',
      text: `⚡ Only ${stock} left in stock — order soon!`,
      urgent: true,
      bg: 'bg-red-50 border-red-300',
      text_color: 'text-red-700',
    });
  }

  return all;
}

export default function LiveActivity({ product }: Props) {
  const stock = typeof product.stock === 'number' ? product.stock : 99;

  // View seed rotates every 10 s (driven by setTimeout to randomise interval)
  const [viewSeed, setViewSeed] = useState(() => Math.floor(Date.now() / 10_000));
  const viewTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const tick = () => {
      setViewSeed(Math.floor(Date.now() / 10_000));
      // Next update in 10 s (fixed for view count per spec)
      viewTimer.current = window.setTimeout(tick, 10_000);
    };
    viewTimer.current = window.setTimeout(tick, 10_000);
    return () => window.clearTimeout(viewTimer.current);
  }, []);

  // Message index — advances on a random 3–5 s interval
  const [msgIndex, setMsgIndex] = useState(0);
  const rotateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const tick = () => {
      setMsgIndex((prev) => prev + 1);
      const next = 3_000 + Math.floor(Math.random() * 2_000); // 3–5 s
      rotateTimer.current = window.setTimeout(tick, next);
    };
    const first = 3_000 + Math.floor(Math.random() * 2_000);
    rotateTimer.current = window.setTimeout(tick, first);
    return () => window.clearTimeout(rotateTimer.current);
  }, []);

  const data = computeSocialProof(product, viewSeed);
  const messages = buildMessages(data.recent_bought_30m, data.orders_last_24h, stock, product.id);
  const current = messages[msgIndex % messages.length];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.key + msgIndex}
        initial={{ opacity: 0, y: 7 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -7 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        className={`relative overflow-hidden rounded-2xl border px-4 py-3 ${current.bg}`}
      >
        {/* Pulse ring on urgent messages */}
        {current.urgent && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
          </span>
        )}
        <p className={`text-sm font-semibold ${current.urgent ? 'pl-5' : ''} ${current.text_color}`}>
          {current.text}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
