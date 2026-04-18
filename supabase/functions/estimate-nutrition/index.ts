// supabase/functions/estimate-nutrition/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// PrepPAL — Nutrition Estimation Edge Function
// Per spec Section 7.3: cache first, Claude if miss, store result.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY')!;
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const { ingredient_name, quantity, unit } = await req.json();

    if (!ingredient_name || !quantity || !unit) {
      return new Response(
        JSON.stringify({ error: 'ingredient_name, quantity, and unit are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedName = ingredient_name.toLowerCase().trim();

    // ── Step 1: Check cache ────────────────────────────────────────────────────
    const { data: cached } = await supabase
      .from('nutrition_estimate_cache')
      .select('*')
      .eq('ingredient_name', normalizedName)
      .eq('unit', unit)
      .single();

    if (cached) {
      // Scale proportionally to requested quantity
      const scale = quantity / cached.quantity;
      return new Response(
        JSON.stringify({
          calories: Math.round(cached.calories * scale),
          protein_g: parseFloat((cached.protein_g * scale).toFixed(2)),
          carbs_g: parseFloat((cached.carbs_g * scale).toFixed(2)),
          fat_g: parseFloat((cached.fat_g * scale).toFixed(2)),
          from_cache: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Step 2: Call Claude ────────────────────────────────────────────────────
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `Estimate the nutritional content of ${quantity} ${unit} of ${ingredient_name}. Return ONLY a JSON object with fields: calories (integer), protein_g (decimal), carbs_g (decimal), fat_g (decimal). No explanation.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? '{}';
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const nutrition = JSON.parse(cleaned);

    // ── Step 3: Store in cache (base quantity = requested quantity) ────────────
    await supabase.from('nutrition_estimate_cache').upsert({
      ingredient_name: normalizedName,
      quantity,
      unit,
      calories: nutrition.calories,
      protein_g: nutrition.protein_g,
      carbs_g: nutrition.carbs_g,
      fat_g: nutrition.fat_g,
    });

    return new Response(
      JSON.stringify({ ...nutrition, from_cache: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Failed to estimate nutrition', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
