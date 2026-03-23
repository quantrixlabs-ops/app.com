import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { computeSocialProof, PRODUCT_TAG_META, type ProductWithSocialProof, type SocialProofTag } from '../utils/socialProof';

type Props = {
  product: ProductWithSocialProof;
  /** Priority order — first matching tag wins */
  priority?: SocialProofTag[];
};

const DEFAULT_PRIORITY: SocialProofTag[] = ['fast_moving', 'most_bought', 'trending'];

export default function SocialProofBadge({ product, priority = DEFAULT_PRIORITY }: Props) {
  const data = useMemo(() => computeSocialProof(product), [product.id, product.orders_last_24h, product.orders_last_7d]);

  if (!data || data.tags.length === 0) return null;

  const tag = priority.find((key) => data.tags.includes(key));
  if (!tag) return null;

  const meta = PRODUCT_TAG_META[tag];

  return (
    <motion.span
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] shadow-sm ${meta.className}`}
    >
      <span>{meta.emoji}</span>
      <span>{meta.label}</span>
    </motion.span>
  );
}
