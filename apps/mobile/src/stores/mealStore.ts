// src/stores/mealStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { startOfToday } from '@preppal/utils';
import type { MealLog, MealSuggestion, DailyNutritionSummary } from '@preppal/types';
import type { LogMealInput } from '@preppal/validation';

export interface DayMacros {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

interface MealState {
  suggestions: MealSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | undefined;

  todayLogs: MealLog[];
  weekCaloriesByDay: Array<{ date: string; calories: number }>;
  weekData: DayMacros[];
  weekDataLoading: boolean;
  monthData: DayMacros[];
  monthDataLoading: boolean;
  dailySummary: DailyNutritionSummary;
  logsLoading: boolean;

  fetchSuggestions: () => Promise<void>;
  logMeal: (input: LogMealInput) => Promise<{ error: Error | null }>;
  estimateNutrition: (
    ingredient_name: string,
    quantity: number,
    unit: string
  ) => Promise<{ data: import('@preppal/types').NutritionEstimate | null; error: Error | null }>;
  fetchTodayLogs: () => Promise<void>;
  fetchWeekCalories: () => Promise<void>;
  fetchWeekData: () => Promise<void>;
  fetchMonthData: () => Promise<void>;
  subscribeRealtime: () => () => void;
}

const emptyDailySummary: DailyNutritionSummary = {
  calories_consumed: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  meals: [],
};

function formatDayKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

export const useMealStore = create<MealState>((set, get) => ({
  suggestions: [],
  suggestionsLoading: false,
  suggestionsError: null,
  fallbackUsed: false,
  fallbackReason: undefined,

  todayLogs: [],
  weekCaloriesByDay: [],
  weekData: [],
  weekDataLoading: false,
  monthData: [],
  monthDataLoading: false,
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

      const { suggestions, fallback_used, fallback_reason } = res.data ?? {};
      const list = suggestions ?? [];

      if (list.length === 0 && fallback_reason === 'insufficient_pantry') {
        set({
          suggestions: [],
          suggestionsError:
            'We could not generate suggestions right now. Add more items to your pantry or try again.',
          suggestionsLoading: false,
          fallbackUsed: true,
          fallbackReason: fallback_reason,
        });
        return;
      }

      set({
        suggestions: list,
        fallbackUsed: fallback_used ?? false,
        fallbackReason: fallback_reason,
        suggestionsLoading: false,
        suggestionsError: null,
      });
    } catch {
      set({
        suggestions: [],
        suggestionsError:
          'We could not generate suggestions right now. Add more items to your pantry or try again.',
        suggestionsLoading: false,
        fallbackUsed: true,
      });
    }
  },

  logMeal: async (input) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: new Error('Not authenticated') };

    const { data, error } = await supabase.rpc('log_meal_and_deduct_pantry', {
      p_meal_name: input.meal_name,
      p_eaten_at: input.eaten_at ?? new Date().toISOString(),
      p_calories: input.calories,
      p_protein_g: input.protein_g,
      p_carbs_g: input.carbs_g,
      p_fat_g: input.fat_g,
      p_ingredients_used: input.ingredients_used ?? [],
      p_claude_suggestion: input.claude_suggestion,
      p_meal_tags: input.meal_tags ?? [],
    });

    if (!error && data) {
      await Promise.all([get().fetchTodayLogs(), get().fetchWeekCalories()]);
      return { error: null };
    }

    return { error: error as Error | null };
  },

  estimateNutrition: async (ingredient_name, quantity, unit) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { data: null, error: new Error('Not authenticated') };

    const res = await supabase.functions.invoke('estimate-nutrition', {
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: { ingredient_name, quantity, unit },
    });

    if (res.error) return { data: null, error: res.error as Error };
    if (res.data?.error) return { data: null, error: new Error('Estimate failed') };

    const { calories, protein_g, carbs_g, fat_g } = res.data;
    return { data: { calories, protein_g, carbs_g, fat_g }, error: null };
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

  fetchWeekCalories: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const end = startOfToday();
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const { data } = await supabase
      .from('meal_logs')
      .select('eaten_at, calories')
      .eq('user_id', user.id)
      .gte('eaten_at', start.toISOString())
      .order('eaten_at', { ascending: true });

    const byDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      byDay.set(formatDayKey(d), 0);
    }

    for (const row of data ?? []) {
      const key = formatDayKey(new Date(row.eaten_at));
      if (!byDay.has(key)) continue;
      byDay.set(key, (byDay.get(key) ?? 0) + row.calories);
    }

    const weekCaloriesByDay = Array.from(byDay.entries()).map(([date, calories]) => ({
      date,
      calories,
    }));

    set({ weekCaloriesByDay });
  },

  fetchWeekData: async () => {
    set({ weekDataLoading: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const end = startOfToday();
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);

      const { data } = await supabase
        .from('meal_logs')
        .select('eaten_at, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', user.id)
        .gte('eaten_at', start.toISOString())
        .order('eaten_at', { ascending: true });

      const byDay = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        byDay.set(formatDayKey(d), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }

      for (const row of data ?? []) {
        const key = formatDayKey(new Date(row.eaten_at));
        if (!byDay.has(key)) continue;
        const cur = byDay.get(key)!;
        byDay.set(key, {
          calories: cur.calories + row.calories,
          protein_g: cur.protein_g + Number(row.protein_g),
          carbs_g: cur.carbs_g + Number(row.carbs_g),
          fat_g: cur.fat_g + Number(row.fat_g),
        });
      }

      const weekData = Array.from(byDay.entries()).map(([date, macros]) => ({ date, ...macros }));
      set({ weekData });
    } finally {
      set({ weekDataLoading: false });
    }
  },

  fetchMonthData: async () => {
    set({ monthDataLoading: true });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

      const { data } = await supabase
        .from('meal_logs')
        .select('eaten_at, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', user.id)
        .gte('eaten_at', startOfMonth.toISOString())
        .order('eaten_at', { ascending: true });

      const byDay = new Map<string, { calories: number; protein_g: number; carbs_g: number; fat_g: number }>();
      const dayCount = now.getDate();
      for (let i = 1; i <= dayCount; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        byDay.set(formatDayKey(d), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
      }

      for (const row of data ?? []) {
        const key = formatDayKey(new Date(row.eaten_at));
        if (!byDay.has(key)) continue;
        const cur = byDay.get(key)!;
        byDay.set(key, {
          calories: cur.calories + row.calories,
          protein_g: cur.protein_g + Number(row.protein_g),
          carbs_g: cur.carbs_g + Number(row.carbs_g),
          fat_g: cur.fat_g + Number(row.fat_g),
        });
      }

      const monthData = Array.from(byDay.entries()).map(([date, macros]) => ({ date, ...macros }));
      set({ monthData });
    } finally {
      set({ monthDataLoading: false });
    }
  },

  subscribeRealtime: () => {
    const channel = supabase
      .channel('meal_logs_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'meal_logs' },
        () => {
          get().fetchTodayLogs();
          get().fetchWeekCalories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
