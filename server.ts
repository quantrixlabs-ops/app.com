import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import multer from 'multer';
import Razorpay from 'razorpay';
import { v2 as cloudinary } from 'cloudinary';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = !!process.env.VERCEL;

// ── Supabase Server Client (service role for full access) ─────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY);

// ── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '12mb' }));

const uploadsDir = isVercel ? '/tmp/uploads' : path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

const isProduction = process.env.NODE_ENV === 'production';
const deliveryServiceRegex = /^560\d{3}$/;

// ── Multer Upload ─────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadsDir),
    filename: (_req, file, callback) => {
      const safeBase = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '-');
      callback(null, `${Date.now()}-${safeBase}`);
    },
  }),
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith('image/'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ── Helper Functions ──────────────────────────────────────────────────────────
const roundCurrency = (value: number) => Math.round(value * 100) / 100;
const normalizePhone = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-10) : '';
};

const inferCategory = (title: string) => {
  const value = title.toLowerCase();
  if (value.includes('blouse')) return 'Blouses';
  if (value.includes('kurta set') || value.includes('co-ord') || value.includes('coord') || value.includes('set')) return 'Kurta Sets';
  if (value.includes('dress')) return 'Dresses';
  if (value.includes('kurta')) return 'Kurtas';
  return 'Sarees';
};

const inferSubcategory = (title: string, category?: string) => {
  const value = title.toLowerCase();
  const resolvedCategory = category || inferCategory(title);
  if (resolvedCategory === 'Sarees') {
    if (value.includes('kanchi') || value.includes('kanjee') || value.includes('kanchipuram')) return 'Kanchipuram Sarees';
    if (value.includes('banarasi')) return 'Banarasi Sarees';
    if (value.includes('linen')) return 'Linen Sarees';
    if (value.includes('organza')) return 'Organza Sarees';
    return 'Cotton Sarees';
  }
  if (resolvedCategory === 'Blouses') {
    if (value.includes('brocade')) return 'Brocade Blouses';
    if (value.includes('cotton')) return 'Cotton Blouses';
    if (value.includes('ready')) return 'Readymade Blouses';
    if (value.includes('designer')) return 'Designer Blouses';
    return 'Silk Blouses';
  }
  if (resolvedCategory === 'Kurtas') {
    if (value.includes('anarkali')) return 'Anarkali Kurtas';
    if (value.includes('straight')) return 'Straight Kurtas';
    if (value.includes('embroider')) return 'Embroidered Kurtas';
    if (value.includes('a-line') || value.includes('aline')) return 'A-Line Kurtas';
    return 'Printed Kurtas';
  }
  if (resolvedCategory === 'Dresses') {
    if (value.includes('anarkali')) return 'Anarkali Dresses';
    if (value.includes('indo')) return 'Indo-Western Dresses';
    if (value.includes('festive')) return 'Festive Dresses';
    if (value.includes('printed')) return 'Printed Dresses';
    return 'Ethnic Maxi Dresses';
  }
  if (value.includes('chanderi')) return 'Chanderi Kurta Sets';
  if (value.includes('festive')) return 'Festive Kurta Sets';
  if (value.includes('printed')) return 'Printed Kurta Sets';
  if (value.includes('anarkali')) return 'Anarkali Kurta Sets';
  return 'Cotton Kurta Sets';
};

const fallbackProductId = (id: number) => `FASHIONNEST-${String(id).padStart(4, '0')}`;

const serializeProduct = (product: any) => ({
  ...product,
  productId: product.product_id || fallbackProductId(product.id),
  name: product.title,
  image: product.image_url,
  subcategory: product.subcategory || inferSubcategory(product.title, product.category),
  orders_last_24h: product.orders_last_24h || 0,
  orders_last_7d: product.orders_last_7d || 0,
  last_purchased_timestamps: Array.isArray(product.last_purchased_timestamps) ? product.last_purchased_timestamps : (() => {
    try { return JSON.parse(product.last_purchased_timestamps || '[]'); } catch { return []; }
  })(),
});

const serializeAddress = (address: any) => {
  if (!address) return null;
  return {
    id: address.address_id,
    address_id: address.address_id,
    recipient_name: address.recipient_name,
    phone_number: address.phone_number,
    house_number: address.house_number,
    street: address.street,
    area: address.area,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
    latitude: address.latitude,
    longitude: address.longitude,
    address_type: address.address_type,
    is_default: Boolean(address.is_default),
    location_label: [address.area, address.city].filter(Boolean).join(', ') || address.city || 'Add address',
    full_address: [address.house_number, address.street, address.area, address.city, address.state, address.postal_code, address.country].filter(Boolean).join(', '),
  };
};

const singularCategoryLabel = (category: string) => {
  if (category === 'Sarees') return 'saree';
  if (category === 'Kurtas') return 'kurta';
  if (category === 'Blouses') return 'blouse';
  if (category === 'Dresses') return 'dress';
  if (category === 'Kurta Sets') return 'kurta set';
  return 'fashion item';
};

const getEffectiveRole = (user: any) => {
  if (!user) return '';
  if (user.role === 'admin') return 'admin';
  if (user.role === 'customer') return 'customer';
  const cr = String(user.community_role || '').trim().toLowerCase();
  return cr === 'resident' ? 'rwa_resident' : 'rwa_coordinator';
};

const getCommunityRole = (user: any) => {
  if (!user) return '';
  if (user.role === 'admin') return 'admin';
  if (user.role !== 'rwa') return 'customer';
  return String(user.community_role || '').trim().toLowerCase() === 'resident' ? 'resident' : 'coordinator';
};

const formatApartmentBlock = (value: any, societyName: string) => String(value || '').trim() || String(societyName || '').trim() || 'Apartment resident';

const serializeAuthUser = (user: any) => ({
  id: user.id,
  user_id: user.id,
  name: user.name,
  role: user.role,
  effective_role: getEffectiveRole(user),
  email: user.email,
  phone: normalizePhone(user.phone || ''),
  society_name: user.society_name,
  community_role: getCommunityRole(user),
  apartment_block: formatApartmentBlock(user.apartment_block, user.society_name),
});

const buildAssetUrl = (req: any, fileName: string) => `${req.protocol}://${req.get('host')}/uploads/${fileName}`;

type DiscountSlab = { min: number; discount: number };

const normalizeDiscountSlabs = (rawSlabs: any, fallbackMinimum = 0, fallbackDiscount = 0): DiscountSlab[] => {
  const candidateList = Array.isArray(rawSlabs) ? rawSlabs
    : typeof rawSlabs === 'string' && rawSlabs.trim()
      ? (() => { try { const parsed = JSON.parse(rawSlabs); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
      : [];
  const slabMap = new Map<number, number>();
  candidateList.forEach((entry: any) => {
    const min = Math.max(1, Number(entry?.min || entry?.minimum || 0));
    const discount = Math.max(0, Number(entry?.discount || entry?.discount_percentage || 0));
    if (!min || !discount) return;
    slabMap.set(min, discount);
  });
  if (slabMap.size === 0 && fallbackMinimum > 0 && fallbackDiscount > 0) {
    slabMap.set(Math.max(1, Number(fallbackMinimum || 0)), Math.max(0, Number(fallbackDiscount || 0)));
  }
  return [...slabMap.entries()].sort((a, b) => a[0] - b[0]).map(([min, discount]) => ({ min, discount }));
};

const getCommunityDiscountSlabs = (event: any): DiscountSlab[] => normalizeDiscountSlabs(
  event?.discount_slabs,
  Number(event?.minimum_participants || event?.minimum_quantity || 0),
  Number(event?.discount_percentage || 0),
);

const getUnlockThreshold = (slabs: DiscountSlab[]) => Number(slabs[0]?.min || 0);
const getTargetThreshold = (slabs: DiscountSlab[]) => Number(slabs[slabs.length - 1]?.min || slabs[0]?.min || 0);
const getActiveDiscountSlab = (slabs: DiscountSlab[], participants: number) => {
  let active: DiscountSlab | null = null;
  slabs.forEach((s) => { if (participants >= s.min) active = s; });
  return active;
};
const getNextDiscountSlab = (slabs: DiscountSlab[], participants: number) => slabs.find((s) => participants < s.min) || null;
const formatRemainingTime = (deadline: string, status: string) => {
  if (status === 'expired') return 'Expired';
  const diffMs = new Date(deadline).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `Ends in: ${days} day${days === 1 ? '' : 's'} ${hours} hour${hours === 1 ? '' : 's'}`;
};

const buildOrderTimeline = (order: any) => {
  const labels = ['Order Placed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered'];
  const status = String(order?.order_status || 'Order Placed');
  if (status === 'Cancelled') {
    return labels.map((label, i) => ({ label, state: i === 0 ? 'completed' : 'cancelled' }));
  }
  const activeIndex = Math.max(labels.indexOf(status), 0);
  return labels.map((label, i) => ({ label, state: i < activeIndex ? 'completed' : i === activeIndex ? 'current' : 'pending' }));
};

const isOrderCancelable = (order: any) => !['Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'].includes(String(order?.order_status || ''));
const canConvertCodOrder = (order: any) => String(order?.payment_method || '').toUpperCase() === 'COD' && !['PAID', 'PAID ONLINE'].includes(String(order?.payment_status || '').toUpperCase()) && String(order?.order_status || '') !== 'Cancelled';

// ── Supabase Auth Middleware ──────────────────────────────────────────────────
const authenticateToken = async (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
    if (error || !authUser) return res.status(403).json({ error: 'Invalid or expired token.' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (!profile) return res.status(403).json({ error: 'User profile not found.' });

    req.user = serializeAuthUser(profile);
    next();
  } catch {
    return res.status(403).json({ error: 'Token validation failed.' });
  }
};

const authorizeRole = (roles: string[]) => (req: any, res: any, next: any) => {
  if (!roles.includes(req.user.role) && !roles.includes(req.user.effective_role)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  next();
};

// ── AUTH ROUTES ───────────────────────────────────────────────────────────────

app.get('/api/auth/me', authenticateToken, async (req: any, res) => {
  const { data: address } = await supabase
    .from('addresses')
    .select('*')
    .eq('user_id', req.user.id)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  res.json({ user: req.user, defaultAddress: serializeAddress(address) });
});

app.post('/api/auth/logout', authenticateToken, (_req, res) => {
  res.json({ message: 'Logged out successfully.' });
});

// ── PRODUCT ROUTES ────────────────────────────────────────────────────────────

app.get('/api/products', async (_req, res) => {
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: 'Failed to load products.' });
  res.json(products!.map(serializeProduct));
});

app.get('/api/products/:id', async (req, res) => {
  const identifier = req.params.id;
  let product: any = null;

  if (/^\d+$/.test(identifier)) {
    const { data } = await supabase.from('products').select('*').eq('id', Number(identifier)).single();
    product = data;
  }
  if (!product) {
    const { data } = await supabase.from('products').select('*').eq('product_id', identifier).single();
    product = data;
  }
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(serializeProduct(product));
});

app.get('/api/products/:id/social-proof', async (req, res) => {
  const identifier = req.params.id;
  let product: any = null;

  if (/^\d+$/.test(identifier)) {
    const { data } = await supabase.from('products').select('*').eq('id', Number(identifier)).single();
    product = data;
  }
  if (!product) {
    const { data } = await supabase.from('products').select('*').eq('product_id', identifier).single();
    product = data;
  }
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const timestamps = Array.isArray(product.last_purchased_timestamps) ? product.last_purchased_timestamps : [];
  const cutoff30m = Date.now() - 30 * 60 * 1000;
  const recentBought30m = timestamps.filter((ts: string) => new Date(ts).getTime() >= cutoff30m).length;
  const tags: string[] = [];
  if (Number(product.orders_last_24h || 0) >= 3) tags.push('Trending today');
  if (Number(product.orders_last_7d || 0) >= 10) tags.push('Popular this week');
  if (recentBought30m >= 2) tags.push('Selling fast');

  res.json({
    orders_last_24h: product.orders_last_24h || 0,
    orders_last_7d: product.orders_last_7d || 0,
    recent_bought_30m: recentBought30m,
    tags,
  });
});

// ── CART ROUTES ───────────────────────────────────────────────────────────────

const buildCartSnapshot = async (user: any) => {
  const { data: cartRows } = await supabase
    .from('cart_items')
    .select('quantity, product_id')
    .eq('user_id', user.id)
    .eq('user_role', user.role)
    .order('created_at', { ascending: false });

  if (!cartRows || cartRows.length === 0) {
    return { items: [], summary: { subtotal: 0, communityDiscount: 0, discountedSubtotalBeforeCoupon: 0, couponDiscount: 0, discountedSubtotal: 0, tax: 0, total: 0 }, appliedCoupon: null, itemCount: 0 };
  }

  const productIds = cartRows.map((r: any) => r.product_id);
  const { data: products } = await supabase.from('products').select('*').in('id', productIds);
  const productMap = new Map((products || []).map((p: any) => [p.id, p]));

  const items = cartRows.map((row: any) => {
    const product: any = productMap.get(row.product_id);
    if (!product) return null;
    const serialized = serializeProduct(product);
    const quantity = Number(row.quantity || 1);
    const lineSubtotal = roundCurrency(Number(product.price || 0) * quantity);
    return { ...serialized, quantity, community_discount_percentage: 0, community_discount_amount: 0, community_discount_applied: false, community_event_id: null, line_subtotal: lineSubtotal, line_total: lineSubtotal };
  }).filter(Boolean);

  const subtotal = roundCurrency(items.reduce((sum: number, item: any) => sum + Number(item.line_subtotal || 0), 0));
  const communityDiscount = 0;
  const discountedSubtotalBeforeCoupon = subtotal;

  let appliedCoupon: any = null;
  let couponDiscount = 0;

  const { data: storedCoupon } = await supabase.from('cart_coupon_applications').select('coupon_code').eq('user_id', user.id).eq('user_role', user.role).limit(1).single();

  if (storedCoupon?.coupon_code) {
    const { data: coupon } = await supabase.from('coupons').select('*').ilike('coupon_code', storedCoupon.coupon_code).single();
    if (coupon && new Date(coupon.expiry_date).getTime() >= Date.now() && Number(coupon.current_usage || 0) < Number(coupon.max_usage || 0) && discountedSubtotalBeforeCoupon >= Number(coupon.minimum_order_value || 0)) {
      const rawDiscount = coupon.discount_type === 'percentage' ? discountedSubtotalBeforeCoupon * (Number(coupon.discount_value || 0) / 100) : Number(coupon.discount_value || 0);
      couponDiscount = roundCurrency(Math.min(discountedSubtotalBeforeCoupon, rawDiscount));
      appliedCoupon = { coupon_code: coupon.coupon_code, discount_type: coupon.discount_type, discount_value: coupon.discount_value, user_type: coupon.user_type };
    }
  }

  const discountedSubtotal = roundCurrency(discountedSubtotalBeforeCoupon - couponDiscount);
  const tax = roundCurrency(discountedSubtotal * 0.05);
  const total = roundCurrency(discountedSubtotal + tax);
  const itemCount = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);

  return { items, summary: { subtotal, communityDiscount, discountedSubtotalBeforeCoupon, couponDiscount, discountedSubtotal, tax, total }, appliedCoupon, itemCount };
};

app.get('/api/cart', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  res.json(await buildCartSnapshot(req.user));
});

app.post('/api/cart/items', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { productId, quantity = 1 } = req.body;
  const { data: product } = await supabase.from('products').select('id').or(`id.eq.${productId},product_id.eq.${productId}`).single();
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { data: existing } = await supabase.from('cart_items').select('id, quantity').eq('user_id', req.user.id).eq('user_role', req.user.role).eq('product_id', product.id).single();

  if (existing) {
    await supabase.from('cart_items').update({ quantity: existing.quantity + Number(quantity) }).eq('id', existing.id);
  } else {
    await supabase.from('cart_items').insert({ user_id: req.user.id, user_role: req.user.role, product_id: product.id, quantity: Number(quantity) });
  }

  res.json(await buildCartSnapshot(req.user));
});

app.patch('/api/cart/items/:productId', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { quantity } = req.body;
  const pid = Number(req.params.productId);
  if (Number(quantity) <= 0) {
    await supabase.from('cart_items').delete().eq('user_id', req.user.id).eq('user_role', req.user.role).eq('product_id', pid);
  } else {
    await supabase.from('cart_items').update({ quantity: Number(quantity) }).eq('user_id', req.user.id).eq('user_role', req.user.role).eq('product_id', pid);
  }
  res.json(await buildCartSnapshot(req.user));
});

app.delete('/api/cart/items/:productId', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  await supabase.from('cart_items').delete().eq('user_id', req.user.id).eq('user_role', req.user.role).eq('product_id', Number(req.params.productId));
  res.json(await buildCartSnapshot(req.user));
});

app.delete('/api/cart/clear', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  await supabase.from('cart_items').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);
  await supabase.from('cart_coupon_applications').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);
  res.json(await buildCartSnapshot(req.user));
});

app.post('/api/cart/apply-coupon', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { couponCode } = req.body;
  if (!couponCode) return res.status(400).json({ error: 'Coupon code is required.' });

  const { data: coupon } = await supabase.from('coupons').select('*').ilike('coupon_code', String(couponCode).trim()).single();
  if (!coupon) return res.status(404).json({ error: 'Coupon code not found.' });
  if (new Date(coupon.expiry_date).getTime() < Date.now()) return res.status(400).json({ error: 'This coupon has expired.' });
  if (Number(coupon.current_usage || 0) >= Number(coupon.max_usage || 0)) return res.status(400).json({ error: 'This coupon has reached its usage limit.' });

  await supabase.from('cart_coupon_applications').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);
  await supabase.from('cart_coupon_applications').insert({ user_id: req.user.id, user_role: req.user.role, coupon_code: coupon.coupon_code });

  res.json(await buildCartSnapshot(req.user));
});

app.delete('/api/cart/coupon', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  await supabase.from('cart_coupon_applications').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);
  res.json(await buildCartSnapshot(req.user));
});

// ── REVIEW ROUTES ─────────────────────────────────────────────────────────────

app.post('/api/reviews', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { productId, rating, reviewText } = req.body;
  if (!productId || !rating || !reviewText) return res.status(400).json({ error: 'Product ID, rating, and review text are required.' });

  let product: any = null;
  if (/^\d+$/.test(String(productId))) {
    const { data } = await supabase.from('products').select('*').eq('id', Number(productId)).single();
    product = data;
  }
  if (!product) {
    const { data } = await supabase.from('products').select('*').eq('product_id', String(productId)).single();
    product = data;
  }
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  await supabase.from('reviews').insert({
    product_db_id: product.id,
    product_id: product.product_id || fallbackProductId(product.id),
    user_id: req.user.id,
    rating: Number(rating),
    review_text: String(reviewText).trim(),
  });

  res.json({ message: 'Review submitted successfully.' });
});

// ── ADDRESS ROUTES ────────────────────────────────────────────────────────────

app.get('/api/addresses/serviceability', authenticateToken, authorizeRole(['customer', 'rwa']), (req: any, res) => {
  const postalCode = String(req.query.postalCode || '').trim();
  res.json({ serviceable: deliveryServiceRegex.test(postalCode) });
});

app.get('/api/addresses', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', req.user.id).order('is_default', { ascending: false }).order('updated_at', { ascending: false });
  res.json((addresses || []).map(serializeAddress));
});

app.post('/api/addresses', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { recipient_name, phone_number, house_number, street, area, city, state, postal_code, country, latitude, longitude, address_type, is_default } = req.body;

  const { data: existing } = await supabase.from('addresses').select('address_id').eq('user_id', req.user.id);
  const shouldBeDefault = is_default || !existing || existing.length === 0;

  if (shouldBeDefault) {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', req.user.id);
  }

  const { data: newAddress } = await supabase.from('addresses').insert({
    user_id: req.user.id, recipient_name, phone_number, house_number, street, area, city, state, postal_code, country: country || 'India', latitude, longitude, address_type: address_type || 'home', is_default: shouldBeDefault,
  }).select().single();

  res.json(serializeAddress(newAddress));
});

app.put('/api/addresses/:id', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: address } = await supabase.from('addresses').select('*').eq('address_id', Number(req.params.id)).eq('user_id', req.user.id).single();
  if (!address) return res.status(404).json({ error: 'Address not found.' });

  const { recipient_name, phone_number, house_number, street, area, city, state, postal_code, country, latitude, longitude, address_type } = req.body;
  await supabase.from('addresses').update({
    recipient_name, phone_number, house_number, street, area, city, state, postal_code, country, latitude, longitude, address_type, updated_at: new Date().toISOString(),
  }).eq('address_id', Number(req.params.id));

  const { data: updated } = await supabase.from('addresses').select('*').eq('address_id', Number(req.params.id)).single();
  res.json(serializeAddress(updated));
});

app.post('/api/addresses/:id/default', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: address } = await supabase.from('addresses').select('*').eq('address_id', Number(req.params.id)).eq('user_id', req.user.id).single();
  if (!address) return res.status(404).json({ error: 'Address not found.' });

  await supabase.from('addresses').update({ is_default: false }).eq('user_id', req.user.id);
  await supabase.from('addresses').update({ is_default: true }).eq('address_id', Number(req.params.id));

  const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', req.user.id).order('is_default', { ascending: false });
  res.json((addresses || []).map(serializeAddress));
});

app.delete('/api/addresses/:id', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: address } = await supabase.from('addresses').select('*').eq('address_id', Number(req.params.id)).eq('user_id', req.user.id).single();
  if (!address) return res.status(404).json({ error: 'Address not found.' });

  await supabase.from('addresses').delete().eq('address_id', Number(req.params.id));

  if (address.is_default) {
    const { data: remaining } = await supabase.from('addresses').select('address_id').eq('user_id', req.user.id).order('updated_at', { ascending: false }).limit(1).single();
    if (remaining) {
      await supabase.from('addresses').update({ is_default: true }).eq('address_id', remaining.address_id);
    }
  }

  const { data: addresses } = await supabase.from('addresses').select('*').eq('user_id', req.user.id).order('is_default', { ascending: false });
  res.json((addresses || []).map(serializeAddress));
});

// ── PAYMENT ROUTES ────────────────────────────────────────────────────────────

app.post('/api/payments/create-order', authenticateToken, async (req: any, res) => {
  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || '', key_secret: process.env.RAZORPAY_KEY_SECRET || '' });
    const order = await razorpay.orders.create({ amount: Math.round(Number(req.body.amount) * 100), currency: 'INR', receipt: `order_${Date.now()}` });
    res.json(order);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Payment order creation failed.' });
  }
});

app.post('/api/payments/verify', authenticateToken, (req: any, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const generated = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if (generated === razorpay_signature) {
    res.json({ verified: true });
  } else {
    res.status(400).json({ verified: false, error: 'Payment verification failed.' });
  }
});

// ── ORDER ROUTES ──────────────────────────────────────────────────────────────

app.post('/api/orders/create', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { addressId, paymentMethod = 'COD', razorpayOrderId, razorpayPaymentId } = req.body;
  if (!addressId) return res.status(400).json({ error: 'Delivery address is required.' });

  const { data: address } = await supabase.from('addresses').select('*').eq('address_id', addressId).eq('user_id', req.user.id).single();
  if (!address) return res.status(404).json({ error: 'Address not found.' });
  if (!deliveryServiceRegex.test(address.postal_code || '')) return res.status(400).json({ error: 'Delivery is not available for this postal code.' });

  const cart = await buildCartSnapshot(req.user);
  if (cart.items.length === 0) return res.status(400).json({ error: 'Your bag is empty.' });

  const paymentStatus = paymentMethod === 'ONLINE' ? 'PAID' : 'pending';

  const { data: order, error: orderError } = await supabase.from('orders').insert({
    customer_id: req.user.id,
    total_price: cart.summary.total,
    payment_status: paymentStatus,
    payment_method: paymentMethod,
    razorpay_order_id: razorpayOrderId || null,
    razorpay_payment_id: razorpayPaymentId || null,
    coupon_code: cart.appliedCoupon?.coupon_code || null,
    coupon_discount: cart.summary.couponDiscount,
    community_discount: cart.summary.communityDiscount,
    tax_amount: cart.summary.tax,
    delivery_name: address.recipient_name,
    delivery_phone: address.phone_number,
    delivery_house_number: address.house_number,
    delivery_street: address.street,
    delivery_area: address.area,
    delivery_city: address.city,
    delivery_state: address.state,
    delivery_postal_code: address.postal_code,
    delivery_country: address.country,
    delivery_latitude: address.latitude,
    delivery_longitude: address.longitude,
  }).select().single();

  if (orderError || !order) return res.status(500).json({ error: 'Failed to create order.' });

  const orderItems = cart.items.map((item: any) => ({
    order_id: order.id,
    product_id: item.id,
    quantity: item.quantity,
    price: item.price,
  }));
  await supabase.from('order_items').insert(orderItems);

  if (cart.appliedCoupon?.coupon_code) {
    await supabase.rpc('increment_coupon_usage', { code: cart.appliedCoupon.coupon_code });
  }

  // Clear cart
  await supabase.from('cart_items').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);
  await supabase.from('cart_coupon_applications').delete().eq('user_id', req.user.id).eq('user_role', req.user.role);

  res.json({ message: 'Order placed successfully.', orderId: order.id, order });
});

app.get('/api/orders/history', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', req.user.id)
    .order('created_at', { ascending: false });

  if (!orders || orders.length === 0) return res.json([]);

  const result = [];
  for (const order of orders) {
    const { data: items } = await supabase
      .from('order_items')
      .select('*, products(*)')
      .eq('order_id', order.id);

    result.push({
      ...order,
      timeline: buildOrderTimeline(order),
      cancelable: isOrderCancelable(order),
      can_convert_to_online: canConvertCodOrder(order),
      items: (items || []).map((item: any) => ({
        ...item,
        product_name: item.products?.title || 'Product',
        product_image: item.products?.image_url || '',
        product_product_id: item.products?.product_id || '',
      })),
      item_summary: (items || []).map((item: any) => item.products?.title || 'Item').join(', '),
    });
  }

  res.json(result);
});

app.get('/api/orders/:id', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: order } = await supabase.from('orders').select('*').eq('id', Number(req.params.id)).eq('customer_id', req.user.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const { data: items } = await supabase.from('order_items').select('*, products(*)').eq('order_id', order.id);

  res.json({
    ...order,
    timeline: buildOrderTimeline(order),
    cancelable: isOrderCancelable(order),
    can_convert_to_online: canConvertCodOrder(order),
    items: (items || []).map((item: any) => ({
      ...item,
      product_name: item.products?.title || 'Product',
      product_image: item.products?.image_url || '',
      product_product_id: item.products?.product_id || '',
    })),
  });
});

app.post('/api/orders/:id/pay-online/create-order', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: order } = await supabase.from('orders').select('*').eq('id', Number(req.params.id)).eq('customer_id', req.user.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!canConvertCodOrder(order)) return res.status(400).json({ error: 'This order cannot be converted to online payment.' });

  try {
    const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID || '', key_secret: process.env.RAZORPAY_KEY_SECRET || '' });
    const rpOrder = await razorpay.orders.create({ amount: Math.round(Number(order.total_price) * 100), currency: 'INR', receipt: `convert_${order.id}_${Date.now()}` });
    res.json(rpOrder);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create payment order.' });
  }
});

app.post('/api/orders/:id/pay-online', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { razorpayOrderId, razorpayPaymentId } = req.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', Number(req.params.id)).eq('customer_id', req.user.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  await supabase.from('orders').update({
    payment_method: 'ONLINE',
    payment_status: 'PAID ONLINE',
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
    payment_converted_at: new Date().toISOString(),
  }).eq('id', order.id);

  res.json({ message: 'Payment updated successfully.' });
});

app.post('/api/orders/:id/cancel', authenticateToken, authorizeRole(['customer', 'rwa']), async (req: any, res) => {
  const { data: order } = await supabase.from('orders').select('*').eq('id', Number(req.params.id)).eq('customer_id', req.user.id).single();
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!isOrderCancelable(order)) return res.status(400).json({ error: 'This order cannot be cancelled.' });

  const { reason, note } = req.body;
  await supabase.from('orders').update({
    order_status: 'Cancelled',
    cancellation_reason: reason || '',
    cancellation_note: note || '',
    cancelled_at: new Date().toISOString(),
  }).eq('id', order.id);

  res.json({ message: 'Order cancelled successfully.' });
});

// ── RWA ROUTES ────────────────────────────────────────────────────────────────

app.get('/api/rwa/orders', authenticateToken, authorizeRole(['rwa']), async (req: any, res) => {
  const { data: orders } = await supabase.from('orders').select('*, profiles!customer_id(name, email, society_name)').order('created_at', { ascending: false });

  const result = [];
  for (const order of (orders || [])) {
    const { data: items } = await supabase.from('order_items').select('*, products(*)').eq('order_id', order.id);
    result.push({
      ...order,
      customer_name: order.profiles?.name || '',
      customer_email: order.profiles?.email || '',
      timeline: buildOrderTimeline(order),
      items: (items || []).map((item: any) => ({
        ...item,
        product_name: item.products?.title || 'Product',
        product_image: item.products?.image_url || '',
      })),
      item_summary: (items || []).map((item: any) => item.products?.title || 'Item').join(', '),
    });
  }
  res.json(result);
});

// ── COMMUNITY DEAL ROUTES ─────────────────────────────────────────────────────

app.get('/api/group-buy/list', authenticateToken, authorizeRole(['rwa', 'admin']), async (req: any, res) => {
  let query = supabase.from('community_events').select('*').order('created_at', { ascending: false });
  if (req.user.role !== 'admin' && req.user.society_name) {
    query = query.eq('society_name', req.user.society_name);
  }
  const { data: events } = await query;

  const result = [];
  for (const event of (events || [])) {
    const { data: product } = await supabase.from('products').select('id, title, image_url, price, product_id').eq('id', event.product_id).single();
    const { count } = await supabase.from('community_event_participants').select('id', { count: 'exact', head: true }).eq('event_id', event.event_id);
    const { data: joined } = await supabase.from('community_event_participants').select('id').eq('event_id', event.event_id).eq('user_id', req.user.id).limit(1);

    const currentParticipants = count || 0;
    const slabs = getCommunityDiscountSlabs(event);
    const currentSlab = getActiveDiscountSlab(slabs, currentParticipants);
    const nextSlab = getNextDiscountSlab(slabs, currentParticipants);
    const minimumParticipants = getUnlockThreshold(slabs);
    const targetParticipants = getTargetThreshold(slabs);
    const deadline = String(event.end_date || event.event_deadline || '');

    result.push({
      ...event,
      id: event.event_id,
      product_name: product?.title || '',
      product_image: product?.image_url || '',
      product_product_id: product?.product_id || '',
      original_price: Number(product?.price || 0),
      current_participants: currentParticipants,
      minimum_participants: minimumParticipants,
      target_participants: targetParticipants,
      current_discount_percentage: Number(currentSlab?.discount || 0),
      next_discount_percentage: Number(nextSlab?.discount || 0),
      discount_unlocked: currentParticipants >= minimumParticipants && minimumParticipants > 0,
      discount_slabs: slabs,
      remaining_time_label: formatRemainingTime(deadline, event.status),
      progress_percentage: targetParticipants > 0 ? Math.min(100, Math.round((currentParticipants / targetParticipants) * 100)) : 0,
      joined: (joined || []).length > 0,
    });
  }
  res.json(result);
});

app.post('/api/group-buy/create', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const { productId, minimumQuantity, discountPercentage, eventDeadline, societyName, eventTitle, eventDurationDays, startDate, endDate, discountSlabs } = req.body;
  const { data: product } = await supabase.from('products').select('id').or(`id.eq.${productId},product_id.eq.${productId}`).single();
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const slabs = normalizeDiscountSlabs(discountSlabs, minimumQuantity, discountPercentage);

  const { data: event } = await supabase.from('community_events').insert({
    product_id: product.id,
    event_title: eventTitle || 'Community Deal',
    minimum_quantity: Number(minimumQuantity || 5),
    discount_percentage: Number(discountPercentage || 10),
    event_deadline: eventDeadline,
    created_by: req.user.id,
    society_name: societyName || '',
    event_duration_days: Number(eventDurationDays || 5),
    start_date: startDate || new Date().toISOString(),
    end_date: endDate || eventDeadline,
    discount_slabs: slabs,
  }).select().single();

  res.json(event);
});

app.put('/api/admin/community-deals/:eventId', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const { data: event } = await supabase.from('community_events').select('*').eq('event_id', Number(req.params.eventId)).single();
  if (!event) return res.status(404).json({ error: 'Community deal not found.' });

  const updates: any = {};
  if (req.body.eventTitle !== undefined) updates.event_title = req.body.eventTitle;
  if (req.body.minimumQuantity !== undefined) updates.minimum_quantity = Number(req.body.minimumQuantity);
  if (req.body.discountPercentage !== undefined) updates.discount_percentage = Number(req.body.discountPercentage);
  if (req.body.eventDeadline !== undefined) updates.event_deadline = req.body.eventDeadline;
  if (req.body.endDate !== undefined) updates.end_date = req.body.endDate;
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.discountSlabs !== undefined) updates.discount_slabs = normalizeDiscountSlabs(req.body.discountSlabs);

  await supabase.from('community_events').update(updates).eq('event_id', event.event_id);
  const { data: updated } = await supabase.from('community_events').select('*').eq('event_id', event.event_id).single();
  res.json(updated);
});

app.post('/api/group-buy/join', authenticateToken, authorizeRole(['rwa']), async (req: any, res) => {
  const { eventId } = req.body;
  const { data: event } = await supabase.from('community_events').select('*').eq('event_id', Number(eventId)).single();
  if (!event) return res.status(404).json({ error: 'Community deal not found.' });

  const { data: alreadyJoined } = await supabase.from('community_event_participants').select('id').eq('event_id', event.event_id).eq('user_id', req.user.id).limit(1);
  if (alreadyJoined && alreadyJoined.length > 0) return res.status(400).json({ error: 'You have already joined this deal.' });

  await supabase.from('community_event_participants').insert({ event_id: event.event_id, user_id: req.user.id, user_role: req.user.role });

  const { count } = await supabase.from('community_event_participants').select('id', { count: 'exact', head: true }).eq('event_id', event.event_id);
  await supabase.from('community_events').update({ current_participants: count || 0 }).eq('event_id', event.event_id);

  res.json({ message: 'Successfully joined the community deal.' });
});

app.get('/api/group-buy/participants/:eventId', authenticateToken, authorizeRole(['rwa', 'admin']), async (req: any, res) => {
  const { data: participants } = await supabase
    .from('community_event_participants')
    .select('*, profiles!user_id(name)')
    .eq('event_id', Number(req.params.eventId))
    .order('joined_at', { ascending: true });

  res.json((participants || []).map((p: any) => ({
    id: p.id,
    customer_name: p.profiles?.name || 'User',
    joined_at: p.joined_at,
  })));
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

app.post('/api/admin/create-rwa', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const { name, email, phone, societyName, apartmentBlock, communityRole: cRole, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, phone, society_name: societyName, role: 'rwa' },
  });

  if (authError) return res.status(400).json({ error: authError.message });

  await supabase.from('profiles').update({
    community_role: cRole || 'coordinator',
    apartment_block: apartmentBlock || societyName || '',
  }).eq('id', authUser.user.id);

  res.json({ message: 'RWA account created successfully.' });
});

app.post('/api/admin/upload-image', authenticateToken, authorizeRole(['admin']), upload.single('image'), (req: any, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided.' });
  res.json({ imageUrl: buildAssetUrl(req, req.file.filename) });
});

app.post('/api/admin/products/generate-image', authenticateToken, authorizeRole(['admin']), (req: any, res) => {
  const { title, category, fabric, color, subcategory } = req.body;
  const cat = category || 'Sarees';
  const accentMap: Record<string, string> = { Sarees: '#c0265b', Kurtas: '#1d4ed8', Blouses: '#9333ea', Dresses: '#ea580c', 'Kurta Sets': '#0f766e' };
  const accent = accentMap[cat] || '#c0265b';
  const titleLabel = String(title || 'FASHIONest Product').slice(0, 26);
  const subcategoryLabel = String(subcategory || singularCategoryLabel(cat)).slice(0, 24);
  const fabricLabel = String(fabric || 'Silk').slice(0, 18);
  const colorLabel = String(color || 'Ivory').slice(0, 16);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="900" viewBox="0 0 720 900"><rect width="720" height="900" rx="36" fill="#fff"/><rect x="36" y="36" width="648" height="828" rx="32" fill="#f8fafc"/><rect x="72" y="72" width="576" height="756" rx="28" fill="#fff" stroke="#e2e8f0"/><rect x="180" y="120" width="360" height="470" rx="18" fill="${accent}" opacity="0.18"/><rect x="130" y="610" width="460" height="150" rx="24" fill="#fff" stroke="#e2e8f0"/><text x="160" y="652" fill="#0f172a" font-family="Arial" font-size="24" font-weight="700">${titleLabel}</text><text x="160" y="690" fill="#475569" font-family="Arial" font-size="20">${subcategoryLabel}</text><text x="160" y="725" fill="#64748b" font-family="Arial" font-size="18">${fabricLabel} | ${colorLabel}</text></svg>`;

  res.json({ imageUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}` });
});

app.post('/api/admin/products', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const { title, description, price, stock, image_url, fabric, color, occasion, category, subcategory } = req.body;
  if (!title || !price) return res.status(400).json({ error: 'Title and price are required.' });

  const cat = category || inferCategory(title);
  const sub = subcategory || inferSubcategory(title, cat);

  const { data: product, error } = await supabase.from('products').insert({
    title, description, price: Number(price), stock: Number(stock || 0), image_url, fabric, color, occasion, category: cat, subcategory: sub,
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to create product.' });

  const productId = fallbackProductId(product.id);
  await supabase.from('products').update({ product_id: productId }).eq('id', product.id);

  res.json(serializeProduct({ ...product, product_id: productId }));
});

app.put('/api/admin/products/:id', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const updates: any = {};
  const fields = ['title', 'description', 'price', 'stock', 'image_url', 'fabric', 'color', 'occasion', 'category', 'subcategory', 'rating'];
  fields.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  await supabase.from('products').update(updates).eq('id', Number(req.params.id));
  const { data: product } = await supabase.from('products').select('*').eq('id', Number(req.params.id)).single();
  res.json(serializeProduct(product));
});

app.post('/api/admin/coupons', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const { coupon_code, discount_type, discount_value, minimum_order_value, expiry_date, max_usage, user_type } = req.body;
  const { data, error } = await supabase.from('coupons').insert({
    coupon_code, discount_type, discount_value: Number(discount_value), minimum_order_value: Number(minimum_order_value || 0), expiry_date, max_usage: Number(max_usage || 1), user_type, created_by: req.user.id,
  }).select().single();

  if (error) return res.status(500).json({ error: 'Failed to create coupon.' });
  res.json(data);
});

app.put('/api/admin/coupons/:id', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const updates: any = {};
  ['discount_type', 'discount_value', 'minimum_order_value', 'expiry_date', 'max_usage', 'user_type'].forEach((f) => {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  });
  await supabase.from('coupons').update(updates).eq('id', Number(req.params.id));
  const { data } = await supabase.from('coupons').select('*').eq('id', Number(req.params.id)).single();
  res.json(data);
});

app.get('/api/admin/coupons', authenticateToken, authorizeRole(['admin']), async (_req, res) => {
  const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
  res.json(data || []);
});

app.get('/api/admin/orders', authenticateToken, authorizeRole(['admin']), async (_req, res) => {
  const { data: orders } = await supabase.from('orders').select('*, profiles!customer_id(name, email, society_name)').order('created_at', { ascending: false });

  const result = [];
  for (const order of (orders || [])) {
    const { data: items } = await supabase.from('order_items').select('*, products(title, image_url, product_id)').eq('order_id', order.id);
    result.push({
      ...order,
      customer_name: order.profiles?.name || '',
      customer_email: order.profiles?.email || '',
      timeline: buildOrderTimeline(order),
      cancelable: isOrderCancelable(order),
      items: (items || []).map((item: any) => ({
        ...item,
        product_name: item.products?.title || 'Product',
        product_image: item.products?.image_url || '',
        product_product_id: item.products?.product_id || '',
      })),
      item_summary: (items || []).map((item: any) => item.products?.title || 'Item').join(', '),
    });
  }
  res.json(result);
});

app.post('/api/admin/orders/:id/update', authenticateToken, authorizeRole(['admin']), async (req: any, res) => {
  const updates: any = {};
  if (req.body.order_status) updates.order_status = req.body.order_status;
  if (req.body.payment_status) updates.payment_status = req.body.payment_status;
  if (req.body.delivery_partner) updates.delivery_partner = req.body.delivery_partner;
  if (req.body.tracking_id) updates.tracking_id = req.body.tracking_id;
  if (req.body.tracking_url) updates.tracking_url = req.body.tracking_url;

  await supabase.from('orders').update(updates).eq('id', Number(req.params.id));
  res.json({ message: 'Order updated successfully.' });
});

app.get('/api/admin/users', authenticateToken, authorizeRole(['admin']), async (_req, res) => {
  const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  res.json((data || []).map(serializeAuthUser));
});

app.get('/api/admin/reviews', authenticateToken, authorizeRole(['admin']), async (_req, res) => {
  const { data } = await supabase
    .from('reviews')
    .select('*, products!product_db_id(title), profiles!user_id(name)')
    .order('created_at', { ascending: false });

  res.json((data || []).map((r: any) => ({
    id: r.id,
    product_id: r.product_id,
    product_name: r.products?.title || '',
    user_name: r.profiles?.name || '',
    rating: r.rating,
    review_text: r.review_text,
    created_at: r.created_at,
  })));
});

// ── Server Start ──────────────────────────────────────────────────────────────

export default app;

if (!isVercel) {
  (async () => {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(path.join(__dirname, 'dist')));
      app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
    }

    app.listen(3000, '0.0.0.0', () => console.log('Server running on http://localhost:3000'));
  })();
}
