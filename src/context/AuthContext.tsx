import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export interface SavedAddress {
  id: number;
  address_id: number;
  recipient_name: string;
  phone_number: string;
  house_number: string;
  street: string;
  area: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  address_type: string;
  is_default: boolean;
  location_label: string;
  full_address: string;
}

export interface User {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'rwa' | 'admin';
  effective_role?: 'customer' | 'rwa_coordinator' | 'rwa_resident' | 'admin';
  society_name?: string;
  community_role?: 'customer' | 'coordinator' | 'resident' | 'admin';
  apartment_block?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  defaultAddress: SavedAddress | null;
  login: (token: string, user: User, defaultAddress?: SavedAddress | null) => void;
  logout: () => Promise<void>;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
  setDefaultAddress: React.Dispatch<React.SetStateAction<SavedAddress | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getEffectiveRole = (role: string, communityRole: string): string => {
  if (role === 'admin') return 'admin';
  if (role === 'customer') return 'customer';
  return communityRole === 'resident' ? 'rwa_resident' : 'rwa_coordinator';
};

const getCommunityRole = (role: string, communityRole: string): string => {
  if (role === 'admin') return 'admin';
  if (role !== 'rwa') return 'customer';
  return communityRole === 'resident' ? 'resident' : 'coordinator';
};

const buildUserFromProfile = (profile: any): User => ({
  id: profile.id,
  user_id: profile.id,
  name: profile.name || '',
  email: profile.email || '',
  phone: profile.phone || '',
  role: profile.role || 'customer',
  effective_role: getEffectiveRole(profile.role || 'customer', profile.community_role || '') as User['effective_role'],
  society_name: profile.society_name || '',
  community_role: getCommunityRole(profile.role || 'customer', profile.community_role || '') as User['community_role'],
  apartment_block: profile.apartment_block || profile.society_name || '',
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = async (session: Session) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (profile) {
      const appUser = buildUserFromProfile(profile);
      setUser(appUser);
      setToken(session.access_token);

      // Fetch default address
      const { data: address } = await supabase
        .from('addresses')
        .select('*')
        .eq('user_id', session.user.id)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (address) {
        setDefaultAddress({
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
        });
      }
    }
  };

  const refreshSession = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await fetchProfile(session);
      } else {
        setUser(null);
        setToken(null);
        setDefaultAddress(null);
      }
    } catch {
      setUser(null);
      setToken(null);
      setDefaultAddress(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshSession();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session) {
          await fetchProfile(session);
        } else {
          setUser(null);
          setToken(null);
          setDefaultAddress(null);
        }
        setIsLoading(false);
      });
      subscription = data.subscription;
    } catch {
      setIsLoading(false);
    }

    return () => subscription?.unsubscribe();
  }, []);

  const login = (_newToken: string, newUser: User, nextDefaultAddress?: SavedAddress | null) => {
    setToken(_newToken);
    setUser(newUser);
    setDefaultAddress(nextDefaultAddress || null);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setToken(null);
    setUser(null);
    setDefaultAddress(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, defaultAddress, login, logout, isLoading, refreshSession, setDefaultAddress }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
