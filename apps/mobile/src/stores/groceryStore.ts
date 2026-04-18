// src/stores/groceryStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { GroceryListItem } from '@preppal/types';
import type { AddGroceryItemInput } from '@preppal/validation';

interface GroceryState {
  items: GroceryListItem[];
  loading: boolean;

  fetch: () => Promise<void>;
  autoPopulate: () => Promise<void>;
  add: (input: AddGroceryItemInput) => Promise<{ error: Error | null }>;
  addMissingIngredients: (
    ingredients: Array<{ name: string; quantity: number; unit: string }>
  ) => Promise<void>;
  toggleChecked: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
}

export const useGroceryStore = create<GroceryState>((set, get) => ({
  items: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    const { data } = await supabase
      .from('grocery_list_items')
      .select('*')
      .order('reason')
      .order('name');
    set({ items: (data as GroceryListItem[]) ?? [], loading: false });
  },

  autoPopulate: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // (1) quantity = 0 → low_stock
    const { data: zeroItems } = await supabase
      .from('pantry_items')
      .select('name')
      .eq('user_id', user.id)
      .eq('quantity', 0);

    // (2) expired items
    const { data: expiredItems } = await supabase
      .from('pantry_items')
      .select('name')
      .eq('user_id', user.id)
      .lt('expiry_date', new Date().toISOString().split('T')[0])
      .not('expiry_date', 'is', null);

    // Fetch existing unchecked items to avoid duplicates
    const { data: existing } = await supabase
      .from('grocery_list_items')
      .select('name')
      .eq('user_id', user.id)
      .eq('is_checked', false);

    const existingNames = new Set((existing ?? []).map((i: any) => i.name.toLowerCase()));

    const toInsert: any[] = [];

    for (const item of zeroItems ?? []) {
      if (!existingNames.has(item.name.toLowerCase())) {
        toInsert.push({ user_id: user.id, name: item.name, reason: 'low_stock' });
        existingNames.add(item.name.toLowerCase());
      }
    }

    for (const item of expiredItems ?? []) {
      if (!existingNames.has(item.name.toLowerCase())) {
        toInsert.push({ user_id: user.id, name: item.name, reason: 'expired' });
        existingNames.add(item.name.toLowerCase());
      }
    }

    if (toInsert.length > 0) {
      await supabase.from('grocery_list_items').insert(toInsert);
    }

    await get().fetch();
  },

  add: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase.from('grocery_list_items').insert({
      ...input,
      user_id: user.id,
    });

    if (!error) await get().fetch();
    return { error: error as Error | null };
  },

  addMissingIngredients: async (ingredients) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('grocery_list_items')
      .select('name')
      .eq('user_id', user.id)
      .eq('is_checked', false);

    const existingNames = new Set((existing ?? []).map((i: any) => i.name.toLowerCase()));

    const toInsert = ingredients
      .filter((i) => !existingNames.has(i.name.toLowerCase()))
      .map((i) => ({
        user_id: user.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        reason: 'missing_ingredient',
      }));

    if (toInsert.length > 0) {
      await supabase.from('grocery_list_items').insert(toInsert);
    }

    await get().fetch();
  },

  toggleChecked: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;

    await supabase
      .from('grocery_list_items')
      .update({ is_checked: !item.is_checked })
      .eq('id', id);

    set((state) => ({
      items: state.items.map((i) =>
        i.id === id ? { ...i, is_checked: !i.is_checked } : i
      ),
    }));
  },

  clearCompleted: async () => {
    await supabase
      .from('grocery_list_items')
      .delete()
      .eq('is_checked', true);

    set((state) => ({ items: state.items.filter((i) => !i.is_checked) }));
  },
}));
