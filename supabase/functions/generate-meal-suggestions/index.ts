// supabase/functions/generate-meal-suggestions/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// PrepPAL — Meal Suggestion Edge Function
// Called when user taps "Suggest a Meal".
// Full cache → Claude → fallback chain per spec Section 7.1 and 7.2.
// The Claude API key NEVER leaves this function.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('CLAUDE_API_KEY')) || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CACHE_TTL_HOURS = 24;

interface MealSuggestion {
  meal_name: string;
  meal_type: string;
  servings: number;
  calories_per_serving: number;
  total_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_time_minutes: number;
  cook_time_minutes: number;
  ingredients_used: Array<{ name: string; quantity: number; unit: string }>;
  missing_ingredients: Array<{ name: string; quantity: number; unit: string }>;
  step_by_step_instructions: string[];
  why_this_fits_user: string;
  portion_notes: string;
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
      return new Response(JSON.stringify({ error: 'Unauthorized', details: 'No auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('[DEV ERROR] Auth failed:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message || 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    const bodyText = await req.text();
    let requestParams: any = {};
    if (bodyText) {
      try { requestParams = JSON.parse(bodyText); } catch {}
    }

    const targetMealType = requestParams.meal_type || 'Breakfast';
    const targetServings = parseInt(requestParams.servings) || 1;
    const targetPreferences = Array.isArray(requestParams.preferences) ? requestParams.preferences : [];

    console.log('[DEBUG] Target Meal:', targetMealType);
    console.log('[DEBUG] Target Servings:', targetServings);
    console.log('[DEBUG] Target Prefs:', targetPreferences);

    // ── Fetch pantry + user prefs ─────────────────────────────────────────────
    const [pantryResult, userResult] = await Promise.all([
      supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', userId)
        .gt('quantity', 0),
      supabase
        .from('users')
        .select('dietary_restrictions, preferred_cuisines, allergies, disliked_foods, daily_calorie_goal, fitness_goal, protein_goal_g')
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
      .map((i) => {
        const base = `${i.name}: ${i.quantity} ${i.unit}`;
        return i.package_size != null
          ? `${base} (${i.package_size}${i.package_unit ? ' ' + i.package_unit : ''} each)`
          : base;
      })
      .join('\n');
    const pantryString =
      `${pantrySerialized}\n|PREFERENCES|` +
      `restrictions:${(userPrefs.dietary_restrictions ?? []).sort().join(',')};` +
      `allergies:${(userPrefs.allergies ?? []).map((x: string) => x.toLowerCase()).sort().join(',')};` +
      `dislikes:${(userPrefs.disliked_foods ?? []).map((x: string) => x.toLowerCase()).sort().join(',')};` +
      `cuisines:${(userPrefs.preferred_cuisines ?? []).sort().join(',')};` +
      `calorie_goal:${userPrefs.daily_calorie_goal};` +
      `fitness:${userPrefs.fitness_goal};` +
      `protein:${userPrefs.protein_goal_g ?? 'none'};` +
      `logged_today_kcal:${caloriesLoggedToday};` +
      `targetMeal:${targetMealType};` +
      `targetServings:${targetServings};` +
      `targetPrefs:${targetPreferences.join(',')}`;

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
    let claudeErrorDetails: string | undefined;

    try {
      suggestions = await callClaude(
        pantryItems,
        userPrefs,
        caloriesLoggedToday,
        remaining,
        targetMealType,
        targetServings,
        targetPreferences
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
      console.error('[DEV ERROR] Claude generation failed:', claudeError);
      
      // Temporarily disabled fallback to see real error
      return new Response(
        JSON.stringify({ 
          error: 'Claude API failed', 
          details: String(claudeError) 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        debug_version: 'debug-no-fallback-v2',
        suggestions,
        from_cache: false,
        fallback_used: fallbackUsed,
        fallback_reason: fallbackReason,
        error_details: claudeErrorDetails,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[DEV ERROR] Unhandled exception:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(err) }),
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
  remaining: number,
  targetMealType: string,
  targetServings: number,
  targetPreferences: string[]
): Promise<MealSuggestion[]> {
  const ingredientList = pantryItems
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => {
      const base = `${i.name}: ${i.quantity} ${i.unit}`;
      return i.package_size != null
        ? `${base} (${i.package_size}${i.package_unit ? ' ' + i.package_unit : ''} per package)`
        : base;
    })
    .join('\n');

  const systemPrompt =
    "You are an elite culinary AI and nutritionist. Your job is to suggest practical, highly detailed, and realistic meals based ONLY on the exact ingredients provided.\n" +
    "CRITICAL RULES:\n" +
    "1. Never assume an ingredient exists if it is not in the list. If you need something, put it in missing_ingredients.\n" +
    "2. If only a small quantity of an ingredient remains, suggest a meal that uses that smaller amount.\n" +
    "3. Return exactly 3 meal suggestions. All 3 suggestions MUST be of the requested meal_type.\n" +
    "4. The user has requested a specific meal_type, servings, and optional preferences. Tailor the recipes to perfectly match these.\n" +
    "5. Calorie distribution per meal generally follows: Breakfast 20-30%, Lunch 30-35%, Dinner 30-35%, Snack 10-15%. Use the user's daily calorie goal to dictate realistic 'calories_per_serving' and 'total_calories'.\n" +
    "6. Instructions MUST be highly detailed step-by-step arrays of strings. No vague summaries.\n" +
    "7. Never suggest a meal containing any item listed in allergies or disliked foods.\n" +
    "8. Return ONLY a valid JSON array with no preamble and no markdown formatting.";

  const userMessage = `Pantry:\n${ingredientList}\n\nCalorie goal: ${userPrefs.daily_calorie_goal} kcal\nAlready consumed today: ${caloriesLoggedToday} kcal\nRemaining: ${remaining} kcal\nFitness goal: ${userPrefs.fitness_goal}\nDietary restrictions: ${userPrefs.dietary_restrictions?.length ? userPrefs.dietary_restrictions.join(', ') : 'none'}\nPreferred cuisines: ${userPrefs.preferred_cuisines?.length ? userPrefs.preferred_cuisines.join(', ') : 'none'}\nAllergies: ${userPrefs.allergies?.length ? userPrefs.allergies.join(', ') : 'none'}\nDisliked foods: ${userPrefs.disliked_foods?.length ? userPrefs.disliked_foods.join(', ') : 'none'}\n\nTARGET MEAL TYPE: ${targetMealType}\nTARGET SERVINGS: ${targetServings}\nTARGET PREFERENCES: ${targetPreferences.length ? targetPreferences.join(', ') : 'none'}\n\nReturn exactly 3 variations of the requested meal as a JSON array matching this exact schema: [{ "meal_name": string, "meal_type": string, "servings": number, "calories_per_serving": number, "total_calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "prep_time_minutes": number, "cook_time_minutes": number, "ingredients_used": [{ "name": string, "quantity": number, "unit": string }], "missing_ingredients": [{ "name": string, "quantity": number, "unit": string }], "step_by_step_instructions": string[], "why_this_fits_user": string, "portion_notes": string, "tags": string[] }].`;

  const payload = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  };

  console.log('[DEBUG] Has API key:', !!CLAUDE_API_KEY);
  console.log('[DEBUG] Calling Claude with payload:', JSON.stringify(payload));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[DEBUG] Claude API Error text:', errorText);
    throw new Error(`Claude API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const rawText = data.content?.[0]?.text ?? '';
  
  console.log('[DEBUG] Claude raw response:', rawText);

  // Strip any accidental markdown fences
  const cleaned = rawText.replace(/```json|```/g, '').trim();
  
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('[DEBUG] JSON PARSE ERROR on text:', cleaned);
    throw new Error('Claude returned invalid JSON: ' + String(e));
  }

  // Simplified validation to just return any valid JSON array
  if (!Array.isArray(parsed)) {
    console.error('[DEBUG] Schema validation failed. Parsed data is not an array:', parsed);
    throw new Error('Claude did not return an array');
  }

  return parsed as MealSuggestion[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback 2: deterministic rule-based suggestions
// ─────────────────────────────────────────────────────────────────────────────
function generateRuleBasedSuggestions(pantryItems: any[], userPrefs: any): MealSuggestion[] {
  const proteins = pantryItems.filter((i) => i.category === 'protein');
  const carbs = pantryItems.filter((i) =>
    ['pantry', 'produce'].includes(i.category)
  );
  const produce = pantryItems.filter((i) => i.category === 'produce');

  const pick = (arr: any[]) => arr[0] ?? pantryItems[0];

  const p = pick(proteins);
  const c = pick(carbs);
  const v = pick(produce);

  const makeBasic = (a: any, b: any, label: string): MealSuggestion => {
    const cals = userPrefs?.daily_calorie_goal ? Math.floor(userPrefs.daily_calorie_goal / 3) : 400;
    return {
      meal_name: `Basic Suggestion — AI unavailable: ${a.name} with ${b.name}`,
      meal_type: label,
      servings: 1,
      calories_per_serving: cals,
      total_calories: cals,
      protein_g: 25,
      carbs_g: 40,
      fat_g: 10,
      prep_time_minutes: 10,
      cook_time_minutes: 15,
      ingredients_used: [
        { name: a.name, quantity: Math.min(a.quantity, 200), unit: a.unit },
        { name: b.name, quantity: Math.min(b.quantity, 100), unit: b.unit },
      ],
      missing_ingredients: [],
      step_by_step_instructions: [
        "Gather all ingredients and prepare your cooking station.",
        `Combine ${a.name} and ${b.name} using your preferred cooking method.`,
        "Season to taste and serve immediately."
      ],
      why_this_fits_user: "This is a fallback recipe generated because the AI service is temporarily unavailable. It uses ingredients currently in your pantry.",
      portion_notes: "This is a basic 1-serving portion.",
      tags: ['basic', 'ai-unavailable'],
    };
  };

  return [makeBasic(p, c, 'Breakfast'), makeBasic(p, v, 'Lunch'), makeBasic(c, v, 'Dinner')];
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
