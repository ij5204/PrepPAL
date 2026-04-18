// src/stores/pantryStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { clampToZero } from '@preppal/utils';
import type { PantryItem, Category } from '@preppal/types';
import type { AddPantryItemInput, UpdatePantryItemInput } from '@preppal/validation';

interface PantryState {
  items: PantryItem[];
  loading: boolean;
  error: string | null;
  selectedCategory: Category | 'all';

  fetch: () => Promise<void>;
  add: (item: AddPantryItemInput) => Promise<{ error: Error | null }>;
  update: (id: string, updates: UpdatePantryItemInput) => Promise<{ error: Error | null }>;
  remove: (id: string) => Promise<{ error: Error | null }>;
  deductQuantities: (deductions: Array<{ pantry_item_id: string; quantity_used: number }>) => Promise<void>;
  setCategory: (cat: Category | 'all') => void;
  subscribeRealtime: () => () => void;
}

export const usePantryStore = create<PantryState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  selectedCategory: 'all',

  fetch: async () => {
    set({ loading: true, error: null });
    const { data, error } = await supabase
      .from('pantry_items')
      .select('*')
      .order('category')
      .order('name');

    if (error) set({ error: error.message });
    else set({ items: (data as PantryItem[]) ?? [] });
    set({ loading: false });
  },

  add: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: new Error('Not authenticated') };

    // Normalize name to title case
    const name = input.name
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    const { error } = await supabase.from('pantry_items').insert({
      ...input,
      name,
      user_id: user.id,
    });

    if (!error) await get().fetch();
    return { error: error as Error | null };
  },

  update: async (id, updates) => {
    const { error } = await supabase
      .from('pantry_items')
      .update(updates)
      .eq('id', id);

    if (!error) await get().fetch();
    return { error: error as Error | null };
  },

  remove: async (id) => {
    const { error } = await supabase
      .from('pantry_items')
      .delete()
      .eq('id', id);

    if (!error) {
      set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
    }
    return { error: error as Error | null };
  },

  deductQuantities: async (deductions) => {
    // Per spec Rule 7: quantity never goes below 0
    const updates = deductions.map(({ pantry_item_id, quantity_used }) => {
      const item = get().items.find((i) => i.id === pantry_item_id);
      if (!item) return null;
      return {
        id: pantry_item_id,
        quantity: clampToZero(item.quantity - quantity_used),
      };
    }).filter(Boolean);

    await Promise.all(
      updates.map((u) =>
        supabase.from('pantry_items').update({ quantity: u!.quantity }).eq('id', u!.id)
      )
    );

    await get().fetch();
  },

  setCategory: (cat) => set({ selectedCategory: cat }),

  subscribeRealtime: () => {
    const channel = supabase
      .channel('pantry_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => {
        get().fetch();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
