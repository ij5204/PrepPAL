// supabase/functions/generate-meal-suggestions/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// PrepPAL — Meal Suggestion Edge Function
// Called when user taps "Suggest a Meal".
// Full cache → Claude → fallback chain per spec Section 7.1 and 7.2.
// The Claude API key NEVER leaves this function.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CACHE_TTL_HOURS = 24;

interface MealSuggestion {
  meal_name: string;
  ingredients_used: Array<{ name: string; quantity: number; unit: string }>;
  missing_ingredients: Array<{ name: string; quantity: number; unit: string }>;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  instructions: string;
  tags: string[];
}

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // ── Fetch pantry + user prefs ─────────────────────────────────────────────
    const [pantryResult, userResult] = await Promise.all([
      supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', userId)
        .gt('quantity', 0),
      supabase
        .from('users')
        .select('dietary_restrictions, allergies, disliked_foods, daily_calorie_goal, fitness_goal, protein_goal_g')
        .eq('id', userId)
        .single(),
    ]);

    const pantryItems = pantryResult.data ?? [];
    const userPrefs = userResult.data;

    if (!userPrefs) {
      throw new Error('User preferences not found');
    }

    // ── Compute today's calories logged ────────────────────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayMeals } = await supabase
      .from('meal_logs')
      .select('calories')
      .eq('user_id', userId)
      .gte('eaten_at', todayStart.toISOString());

    const caloriesLoggedToday = (todayMeals ?? []).reduce(
      (sum, m) => sum + m.calories,
      0
    );
    const remaining = userPrefs.daily_calorie_goal - caloriesLoggedToday;

    // ── Compute pantry hash ────────────────────────────────────────────────────
    const sortedPantry = [...pantryItems].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    const pantrySerialized = sortedPantry
      .map((i) => `${i.name}: ${i.quantity} ${i.unit}`)
      .join('\n');
    const pantryString =
      `${pantrySerialized}\n|PREFERENCES|` +
      `restrictions:${(userPrefs.dietary_restrictions ?? []).sort().join(',')};` +
      `allergies:${(userPrefs.allergies ?? []).map((x: string) => x.toLowerCase()).sort().join(',')};` +
      `dislikes:${(userPrefs.disliked_foods ?? []).map((x: string) => x.toLowerCase()).sort().join(',')};` +
      `calorie_goal:${userPrefs.daily_calorie_goal};` +
      `fitness:${userPrefs.fitness_goal};` +
      `protein:${userPrefs.protein_goal_g ?? 'none'};` +
      `logged_today_kcal:${caloriesLoggedToday}`;

    const pantryHash = await sha256(pantryString);

    // ── Step 1: Check cache ────────────────────────────────────────────────────
    const { data: cacheHit } = await supabase
      .from('meal_suggestion_cache')
      .select('suggestions')
      .eq('user_id', userId)
      .eq('pantry_hash', pantryHash)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (cacheHit) {
      return new Response(
        JSON.stringify({
          suggestions: cacheHit.suggestions,
          from_cache: true,
          fallback_used: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 2: Call Claude ────────────────────────────────────────────────────
    let suggestions: MealSuggestion[];
    let fallbackUsed = false;
    let fallbackReason: string | undefined;

    try {
      suggestions = await callClaude(
        pantryItems,
        userPrefs,
        caloriesLoggedToday,
        remaining
      );

      // ── Step 3: Store in cache ───────────────────────────────────────────────
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

      await supabase.from('meal_suggestion_cache').upsert(
        {
          user_id: userId,
          pantry_hash: pantryHash,
          suggestions,
          generated_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'user_id,pantry_hash' }
      );

      await logSystemEvent(supabase, 'meal_suggestion_generated', 'edge:generate-meal-suggestions', {
        user_id: userId,
        pantry_item_count: pantryItems.length,
      });
    } catch (claudeError) {
      // ── Fallback chain ─────────────────────────────────────────────────────
      fallbackUsed = true;

      await logSystemEvent(supabase, 'claude_error', 'edge:generate-meal-suggestions', {
        user_id: userId,
        error: String(claudeError),
      });

      // Fallback 1: stale cache
      const { data: staleCache } = await supabase
        .from('meal_suggestion_cache')
        .select('suggestions')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .single();

      if (staleCache) {
        fallbackReason = 'stale_cache';
        suggestions = staleCache.suggestions;
      } else if (pantryItems.length >= 3) {
        // Fallback 2: rule-based
        fallbackReason = 'rule_based';
        suggestions = generateRuleBasedSuggestions(pantryItems);
      } else {
        // Fallback 3: empty state
        return new Response(
          JSON.stringify({
            suggestions: [],
            from_cache: false,
            fallback_used: true,
            fallback_reason: 'insufficient_pantry',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        suggestions,
        from_cache: false,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    await logSystemEvent(supabase, 'unhandled_error', 'edge:generate-meal-suggestions', {
      error: String(err),
    });
    return new Response(
      JSON.stringify({ error: 'Internal server error', suggestions: [], fallback_used: true }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Claude API call
// ─────────────────────────────────────────────────────────────────────────────
async function callClaude(
  pantryItems: any[],
  userPrefs: any,
  caloriesLoggedToday: number,
  remaining: number
): Promise<MealSuggestion[]> {
  const ingredientList = pantryItems
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => `${i.name}: ${i.quantity} ${i.unit}`)
    .join('\n');

  const systemPrompt =
    "You are a meal planning assistant. Your job is to suggest practical, realistic meals based ONLY on the exact ingredients provided. Rules: (1) Never assume an ingredient exists if it is not in the list. (2) If only a small quantity of an ingredient remains, suggest a meal that uses that smaller amount. (3) Always return exactly 3 meal suggestions. (4) Return ONLY a valid JSON array with no preamble, no explanation, and no markdown formatting. (5) Never suggest a meal containing any item listed in allergies or disliked foods.";

  const userMessage = `Pantry:\n${ingredientList}\n\nCalorie goal: ${userPrefs.daily_calorie_goal} kcal\nAlready consumed today: ${caloriesLoggedToday} kcal\nRemaining: ${remaining} kcal\nFitness goal: ${userPrefs.fitness_goal}\nDietary restrictions: ${userPrefs.dietary_restrictions.length ? userPrefs.dietary_restrictions.join(', ') : 'none'}\nAllergies: ${userPrefs.allergies.length ? userPrefs.allergies.join(', ') : 'none'}\nDisliked foods: ${userPrefs.disliked_foods.length ? userPrefs.disliked_foods.join(', ') : 'none'}\n\nReturn 3 meal suggestions as a JSON array.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text ?? '';

  // Strip any accidental markdown fences
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new Error('Claude did not return exactly 3 suggestions');
  }

  return parsed as MealSuggestion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback 2: deterministic rule-based suggestions
// ─────────────────────────────────────────────────────────────────────────────
function generateRuleBasedSuggestions(pantryItems: any[]): MealSuggestion[] {
  const proteins = pantryItems.filter((i) => i.category === 'protein');
  const carbs = pantryItems.filter((i) =>
    ['pantry', 'produce'].includes(i.category)
  );
  const produce = pantryItems.filter((i) => i.category === 'produce');

  const pick = (arr: any[]) => arr[0] ?? pantryItems[0];

  const p = pick(proteins);
  const c = pick(carbs);
  const v = pick(produce);

  const makeBasic = (a: any, b: any, label: string): MealSuggestion => ({
    meal_name: `Basic Suggestion — AI unavailable: ${a.name} with ${b.name}`,
    ingredients_used: [
      { name: a.name, quantity: Math.min(a.quantity, 200), unit: a.unit },
      { name: b.name, quantity: Math.min(b.quantity, 100), unit: b.unit },
    ],
    missing_ingredients: [],
    calories: 400,
    protein_g: 25,
    carbs_g: 40,
    fat_g: 10,
    instructions: `Combine ${a.name} and ${b.name} using your preferred cooking method. Season to taste.`,
    tags: ['basic', 'ai-unavailable'],
  });

  return [makeBasic(p, c, 'Protein + Carb'), makeBasic(p, v, 'Protein + Veg'), makeBasic(c, v, 'Carb + Veg')];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function logSystemEvent(
  supabase: any,
  eventType: string,
  source: string,
  payload: Record<string, unknown>,
  error?: string
) {
  try {
    await supabase.from('system_events').insert({
      event_type: eventType,
      source,
      payload,
      error: error ?? null,
    });
  } catch {
    // Never let logging failures crash the function
  }
}
