// PrepPAL — Nutrition estimation (Edge only). Validates JWT; hides raw upstream errors.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
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

    const body = await req.json().catch(() => null);
    const ingredient_name = body?.ingredient_name as string | undefined;
    const quantity = Number(body?.quantity);
    const unit = body?.unit as string | undefined;

    if (!ingredient_name?.trim() || !Number.isFinite(quantity) || quantity <= 0 || !unit) {
      return new Response(
        JSON.stringify({ error: 'ingredient_name, quantity, and unit are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedName = ingredient_name.toLowerCase().trim();

    const { data: cached, error: cacheErr } = await supabase
      .from('nutrition_estimate_cache')
      .select('*')
      .eq('ingredient_name', normalizedName)
      .eq('unit', unit)
      .maybeSingle();

    if (!cacheErr && cached) {
      const scale = quantity / Number(cached.quantity);
      return new Response(
        JSON.stringify({
          calories: Math.round(cached.calories * scale),
          protein_g: parseFloat((Number(cached.protein_g) * scale).toFixed(2)),
          carbs_g: parseFloat((Number(cached.carbs_g) * scale).toFixed(2)),
          fat_g: parseFloat((Number(cached.fat_g) * scale).toFixed(2)),
          from_cache: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let nutrition: { calories: number; protein_g: number; carbs_g: number; fat_g: number };

    if (CLAUDE_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': CLAUDE_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            messages: [
              {
                role: 'user',
                content:
                  `Estimate the nutritional content of ${quantity} ${unit} of ${ingredient_name}. Return ONLY a JSON object with fields: calories (integer), protein_g (decimal), carbs_g (decimal), fat_g (decimal). No explanation.`,
              },
            ],
          }),
        });

        if (!response.ok) throw new Error('claude_upstream');

        const data = await response.json();
        const rawText = data.content?.[0]?.text ?? '{}';
        const cleaned = rawText.replace(/```json|```/g, '').trim();
        nutrition = JSON.parse(cleaned);

        await supabase.from('nutrition_estimate_cache').upsert({
          ingredient_name: normalizedName,
          quantity,
          unit,
          calories: nutrition.calories,
          protein_g: nutrition.protein_g,
          carbs_g: nutrition.carbs_g,
          fat_g: nutrition.fat_g,
        }, { onConflict: 'ingredient_name,unit' });
      } catch {
        nutrition = heuristicNutrition(normalizedName, quantity, unit);
      }
    } else {
      nutrition = heuristicNutrition(normalizedName, quantity, unit);
    }

    return new Response(
      JSON.stringify({ ...nutrition, from_cache: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (_err) {
    return new Response(
      JSON.stringify({ error: 'Failed to estimate nutrition' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function heuristicNutrition(name: string, quantity: number, unit: string): {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
} {
  const per100gCals =
    name.includes('chicken') || name.includes('beef') || name.includes('fish') ? 200 : 120;
  const grams = quantity * gramFactor(unit);
  const scale = grams / 100;
  const protein = Math.max(8, Math.round(per100gCals * 0.25 / 4 * scale));
  const carbs = Math.max(10, Math.round(per100gCals * 0.45 / 4 * scale));
  const fat = Math.max(4, Math.round(per100gCals * 0.3 / 9 * scale));
  const calories = Math.round(Math.max(per100gCals * scale, 150));
  return { calories, protein_g: protein, carbs_g: carbs, fat_g: fat };
}

function gramFactor(unit: string): number {
  switch (unit) {
    case 'g':
      return 1;
    case 'kg':
      return 1000;
    case 'ml':
    case 'l':
      return unit === 'l' ? 1000 : 1;
    case 'cups':
      return 120;
    case 'tbsp':
      return 15;
    case 'tsp':
      return 5;
    case 'pieces':
    default:
      return 85;
  }
}
