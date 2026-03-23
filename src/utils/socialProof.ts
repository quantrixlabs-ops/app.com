export type SocialProofTag = 'fast_moving' | 'most_bought' | 'trending';

export type SocialProofData = {
  product_id: number;
  orders_last_24h: number;
  orders_last_7d: number;
  recent_bought_30m: number;
  views_simulated: number;
  tags: SocialProofTag[];
};

export type ProductWithSocialProof = {
  id: number;
  stock?: number;
  orders_last_24h?: number;
  orders_last_7d?: number;
  last_purchased_timestamps?: string[];
  [key: string]: unknown;
};

export const PRODUCT_TAG_META: Record<SocialProofTag, { label: string; emoji: string; className: string }> = {
  fast_moving: { label: 'Fast Moving', emoji: '🔥', className: 'bg-orange-500/90 text-white' },
  most_bought: { label: 'Most Bought', emoji: '⭐', className: 'bg-amber-500/90 text-white' },
  trending:    { label: 'Trending Now', emoji: '📈', className: 'bg-rose-500/90 text-white' },
};

function countRecentTimestamps(timestamps: string[], minutes: number): number {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return timestamps.filter((ts) => new Date(ts).getTime() >= cutoff).length;
}

/** Stable simulated view count 5–15, seeded by product id + a slowly-rotating seed (changes every 15s) */
export function simulateViewCount(productId: number, seed: number): number {
  return ((productId * 7 + seed) % 11) + 5; // 5–15
}

/** Stable simulated recent-purchase count 3–10, seeded by product id */
export function simulatePurchaseCount(productId: number): number {
  return ((productId * 13 + 7) % 8) + 3; // 3–10
}

/** Compute all social proof data from fields already present on the product object */
export function computeSocialProof(product: ProductWithSocialProof, viewSeed = 0): SocialProofData {
  const orders24h = product.orders_last_24h ?? 0;
  const orders7d  = product.orders_last_7d  ?? 0;
  const timestamps: string[] = Array.isArray(product.last_purchased_timestamps)
    ? product.last_purchased_timestamps
    : [];

  const recent30m = countRecentTimestamps(timestamps, 30);
  const recent60m = countRecentTimestamps(timestamps, 60);

  const tags: SocialProofTag[] = [];
  if (orders24h > 20) tags.push('fast_moving');
  if (orders7d  > 50) tags.push('most_bought');
  if (recent60m >  5) tags.push('trending');

  return {
    product_id: product.id,
    orders_last_24h: orders24h,
    orders_last_7d: orders7d,
    recent_bought_30m: recent30m,
    views_simulated: simulateViewCount(product.id, viewSeed),
    tags,
  };
}

// ── Optional single-product refresh (used only by ProductDetail for real-time update) ──

const cache = new Map<number, { data: SocialProofData; fetchedAt: number }>();
const CACHE_TTL = 30_000;

export async function fetchSocialProof(productDbId: number): Promise<SocialProofData | null> {
  const hit = cache.get(productDbId);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL) return hit.data;
  try {
    const res = await fetch(`/api/products/${productDbId}/social-proof`);
    if (!res.ok) return null;
    const raw = await res.json();
    const data: SocialProofData = { ...raw, views_simulated: simulateViewCount(productDbId, 0) };
    cache.set(productDbId, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}
