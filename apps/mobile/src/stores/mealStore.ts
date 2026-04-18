// src/stores/mealStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { startOfToday } from '@preppal/utils';
import type { MealLog, MealSuggestion, DailyNutritionSummary } from '@preppal/types';
import type { LogMealInput } from '@preppal/validation';

interface MealState {
  suggestions: MealSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | undefined;

  todayLogs: MealLog[];
  dailySummary: DailyNutritionSummary;
  logsLoading: boolean;

  fetchSuggestions: () => Promise<void>;
  logMeal: (input: LogMealInput) => Promise<{ error: Error | null }>;
  fetchTodayLogs: () => Promise<void>;
  subscribeRealtime: () => () => void;
}

const emptyDailySummary: DailyNutritionSummary = {
  calories_consumed: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  meals: [],
};

export const useMealStore = create<MealState>((set, get) => ({
  suggestions: [],
  suggestionsLoading: false,
  suggestionsError: null,
  fallbackUsed: false,
  fallbackReason: undefined,

  todayLogs: [],
  dailySummary: emptyDailySummary,
  logsLoading: false,

  fetchSuggestions: async () => {
    set({ suggestionsLoading: true, suggestionsError: null });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await supabase.functions.invoke('generate-meal-suggestions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;

      const { suggestions, fallback_used, fallback_reason } = res.data;
      set({
        suggestions: suggestions ?? [],
        fallbackUsed: fallback_used ?? false,
        fallbackReason: fallback_reason,
        suggestionsLoading: false,
      });
    } catch (err) {
      set({
        suggestionsError: 'Unable to generate suggestions right now.',
        suggestionsLoading: false,
        fallbackUsed: true,
      });
    }
  },

  logMeal: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase.from('meal_logs').insert({
      ...input,
      user_id: user.id,
      eaten_at: input.eaten_at ?? new Date().toISOString(),
      nutrition_is_estimate: true, // Always true in MVP per spec Rule 13
    });

    if (!error) await get().fetchTodayLogs();
    return { error: error as Error | null };
  },

  fetchTodayLogs: async () => {
    set({ logsLoading: true });
    const today = startOfToday();

    const { data, error } = await supabase
      .from('meal_logs')
      .select('*')
      .gte('eaten_at', today.toISOString())
      .order('eaten_at', { ascending: false });

    if (!error && data) {
      const logs = data as MealLog[];
      const summary: DailyNutritionSummary = {
        calories_consumed: logs.reduce((s, m) => s + m.calories, 0),
        protein_g: logs.reduce((s, m) => s + Number(m.protein_g), 0),
        carbs_g: logs.reduce((s, m) => s + Number(m.carbs_g), 0),
        fat_g: logs.reduce((s, m) => s + Number(m.fat_g), 0),
        meals: logs,
      };
      set({ todayLogs: logs, dailySummary: summary });
    }

    set({ logsLoading: false });
  },

  subscribeRealtime: () => {
    const channel = supabase
      .channel('meal_logs_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meal_logs' },
        () => { get().fetchTodayLogs(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },
}));
