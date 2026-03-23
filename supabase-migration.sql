-- ============================================================================
-- FASHIONest Supabase Migration
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================================================

-- 1. PROFILES TABLE (linked to Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'rwa', 'admin')),
  community_role TEXT DEFAULT '',
  apartment_block TEXT DEFAULT '',
  society_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ,
  CONSTRAINT profiles_email_unique UNIQUE (email),
  CONSTRAINT profiles_phone_unique UNIQUE (phone)
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone, role, society_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.email, ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer'),
    COALESCE(NEW.raw_user_meta_data->>'society_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  product_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'Sarees',
  subcategory TEXT DEFAULT '',
  fabric TEXT,
  color TEXT,
  occasion TEXT,
  price NUMERIC NOT NULL,
  rating NUMERIC DEFAULT 4.4,
  image_url TEXT,
  stock INTEGER DEFAULT 0,
  orders_last_24h INTEGER DEFAULT 0,
  orders_last_7d INTEGER DEFAULT 0,
  last_purchased_timestamps JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id),
  total_price NUMERIC NOT NULL,
  payment_status TEXT DEFAULT 'pending',
  order_status TEXT DEFAULT 'Order Placed',
  payment_method TEXT DEFAULT 'COD',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  delivery_partner TEXT,
  tracking_id TEXT,
  tracking_url TEXT,
  coupon_code TEXT,
  coupon_discount NUMERIC DEFAULT 0,
  community_discount NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  delivery_name TEXT DEFAULT '',
  delivery_phone TEXT DEFAULT '',
  delivery_house_number TEXT DEFAULT '',
  delivery_street TEXT DEFAULT '',
  delivery_area TEXT DEFAULT '',
  delivery_city TEXT DEFAULT '',
  delivery_state TEXT DEFAULT '',
  delivery_postal_code TEXT DEFAULT '',
  delivery_country TEXT DEFAULT '',
  delivery_latitude NUMERIC,
  delivery_longitude NUMERIC,
  cancellation_reason TEXT DEFAULT '',
  cancellation_note TEXT DEFAULT '',
  cancelled_at TIMESTAMPTZ,
  payment_converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER,
  price NUMERIC
);

-- 5. REVIEWS TABLE
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_db_id INTEGER NOT NULL REFERENCES products(id),
  product_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id),
  rating NUMERIC NOT NULL,
  review_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ADDRESSES TABLE
CREATE TABLE IF NOT EXISTS addresses (
  address_id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  recipient_name TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',
  house_number TEXT DEFAULT '',
  street TEXT DEFAULT '',
  area TEXT DEFAULT '',
  city TEXT DEFAULT '',
  state TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  country TEXT DEFAULT 'India',
  latitude NUMERIC,
  longitude NUMERIC,
  address_type TEXT DEFAULT 'home',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. CART ITEMS TABLE
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_role TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, user_role, product_id)
);

-- 8. CART COUPON APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS cart_coupon_applications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_role TEXT NOT NULL,
  coupon_code TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, user_role)
);

-- 9. COUPONS TABLE
CREATE TABLE IF NOT EXISTS coupons (
  id SERIAL PRIMARY KEY,
  coupon_code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
  discount_value NUMERIC NOT NULL,
  minimum_order_value NUMERIC NOT NULL DEFAULT 0,
  expiry_date TIMESTAMPTZ NOT NULL,
  max_usage INTEGER NOT NULL DEFAULT 1,
  current_usage INTEGER NOT NULL DEFAULT 0,
  user_type TEXT NOT NULL CHECK (user_type IN ('customer', 'first_time_user', 'community_user')),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 10. COMMUNITY EVENTS TABLE
CREATE TABLE IF NOT EXISTS community_events (
  event_id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  event_title TEXT DEFAULT '',
  minimum_quantity INTEGER NOT NULL,
  current_participants INTEGER NOT NULL DEFAULT 0,
  discount_percentage NUMERIC NOT NULL,
  event_duration_days INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  event_deadline TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  society_name TEXT,
  status TEXT DEFAULT 'open',
  discount_slabs JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. COMMUNITY EVENT PARTICIPANTS TABLE
CREATE TABLE IF NOT EXISTS community_event_participants (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES community_events(event_id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_role TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, user_id, user_role)
);

-- 12. GROUP BUY EVENTS TABLE (legacy)
CREATE TABLE IF NOT EXISTS group_buy_events (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  society_name TEXT,
  rwa_id UUID REFERENCES profiles(id),
  deadline TIMESTAMPTZ,
  status TEXT DEFAULT 'active'
);

-- 13. GROUP BUY PARTICIPANTS TABLE (legacy)
CREATE TABLE IF NOT EXISTS group_buy_participants (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES group_buy_events(id),
  customer_id UUID REFERENCES profiles(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_coupon_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_event_participants ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all profiles, update own
CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Products: public read, admin insert/update (via service role on server)
CREATE POLICY "Products are viewable by everyone" ON products FOR SELECT USING (true);
CREATE POLICY "Service role can manage products" ON products FOR ALL USING (true);

-- Orders: users see own orders, service role manages all
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Service role can manage orders" ON orders FOR ALL USING (true);

-- Order Items: users can see items of their orders
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.customer_id = auth.uid()));
CREATE POLICY "Service role can manage order items" ON order_items FOR ALL USING (true);

-- Reviews: public read, auth users can insert
CREATE POLICY "Reviews are viewable by everyone" ON reviews FOR SELECT USING (true);
CREATE POLICY "Auth users can create reviews" ON reviews FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Addresses: users see/manage own
CREATE POLICY "Users can view own addresses" ON addresses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own addresses" ON addresses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own addresses" ON addresses FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own addresses" ON addresses FOR DELETE USING (auth.uid() = user_id);

-- Cart: users see/manage own
CREATE POLICY "Users can view own cart" ON cart_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own cart" ON cart_items FOR ALL USING (auth.uid() = user_id);

-- Cart Coupons: users see/manage own
CREATE POLICY "Users can view own cart coupons" ON cart_coupon_applications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own cart coupons" ON cart_coupon_applications FOR ALL USING (auth.uid() = user_id);

-- Coupons: public read
CREATE POLICY "Coupons are viewable by everyone" ON coupons FOR SELECT USING (true);
CREATE POLICY "Service role can manage coupons" ON coupons FOR ALL USING (true);

-- Community events: public read
CREATE POLICY "Community events are viewable by everyone" ON community_events FOR SELECT USING (true);
CREATE POLICY "Service role can manage community events" ON community_events FOR ALL USING (true);

-- Community event participants
CREATE POLICY "Participants are viewable by everyone" ON community_event_participants FOR SELECT USING (true);
CREATE POLICY "Users can join events" ON community_event_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- RPC FUNCTIONS
-- ============================================================================

-- Increment coupon usage (called when an order uses a coupon)
CREATE OR REPLACE FUNCTION increment_coupon_usage(code TEXT)
RETURNS void AS $$
BEGIN
  UPDATE coupons SET current_usage = current_usage + 1 WHERE UPPER(coupon_code) = UPPER(code);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SEED ADMIN USER
-- Create admin user via Supabase Auth Dashboard or use:
--   supabase.auth.admin.createUser({ email: 'admin@saree.com', password: 'admin123', ... })
-- Then update the profile role:
-- ============================================================================
-- After creating admin user in Supabase Auth, run:
-- UPDATE profiles SET role = 'admin' WHERE email = 'admin@saree.com';
