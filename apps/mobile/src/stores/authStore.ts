// src/stores/authStore.ts
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import type { User as PrepPALUser } from '@preppal/types';

WebBrowser.maybeCompleteAuthSession();

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: PrepPALUser | null;
  loading: boolean;
  initialized: boolean;

  initialize: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  touchLastActive: () => Promise<void>;
  updateProfile: (updates: Partial<PrepPALUser>) => Promise<{ error: Error | null }>;
}

function parseTokensFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  try {
    const u = new URL(url);
    const hash = u.hash?.replace(/^#/, '');
    if (hash) {
      const sp = new URLSearchParams(hash);
      const access_token = sp.get('access_token');
      const refresh_token = sp.get('refresh_token');
      if (access_token && refresh_token) return { access_token, refresh_token };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    set({ session, user: session?.user ?? null, loading: false, initialized: true });

    if (session?.user) {
      await get().refreshProfile();
      await get().touchLastActive();
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session, user: session?.user ?? null });
      if (session?.user) {
        await get().refreshProfile();
        await get().touchLastActive();
      } else {
        set({ profile: null });
      }
    });
  },

  signInWithEmail: async (email, password) => {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    return { error: error as Error | null };
  },

  signUpWithEmail: async (email, password, name) => {
    set({ loading: true });
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    set({ loading: false });
    return { error: error as Error | null };
  },

  signInWithGoogle: async () => {
    set({ loading: true });
    try {
      const redirectTo = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: error as Error };
      if (!data?.url) return { error: new Error('No OAuth URL returned') };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !('url' in result) || !result.url) {
        return { error: null };
      }

      const exchange = await supabase.auth.exchangeCodeForSession(result.url);
      if (!exchange.error) return { error: null };

      const tokens = parseTokensFromUrl(result.url);
      if (tokens) {
        const { error: sErr } = await supabase.auth.setSession(tokens);
        return { error: sErr as Error | null };
      }

      return { error: exchange.error as Error };
    } catch (e) {
      return { error: e as Error };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  refreshProfile: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (data) set({ profile: data as PrepPALUser });
  },

  touchLastActive: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id);
  },

  updateProfile: async (updates) => {
    const u = get().user;
    if (!u) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('users')
      .update(updates as Record<string, unknown>)
      .eq('id', u.id);

    if (!error) await get().refreshProfile();
    return { error: error as Error | null };
  },
}));
