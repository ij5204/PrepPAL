import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('CLAUDE_API_KEY')) || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const SYSTEM_PROMPT = `You are a receipt parsing assistant for a pantry management app.
Your job is to extract only grocery and pantry items from receipt images.

STRICT RULES:
1. Extract ONLY food, beverage, and household pantry items.
2. NEVER include: tax, subtotal, total, discounts, coupons, savings, payment info (card type, last 4 digits, cash, change), store name/address, receipt ID/number, cashier name, date, time, phone numbers, loyalty points, or any non-item line.
3. Normalize item names to human-readable pantry names (e.g. "MLKSHK CHOC" → "Chocolate Milkshake", "CHKN BRST" → "Chicken Breast", "ORG BNN" → "Organic Banana").
4. For quantity: use the quantity purchased (typically 1 unless the receipt shows a multiplier like "2 x" or "3 @").
5. For unit: MUST be exactly one of: g, kg, ml, l, cups, pieces, tsp, tbsp. Default to "pieces" if unclear.
6. For category: MUST be exactly one of: produce, dairy, protein, pantry, spice, other.
   - produce: fresh fruits, vegetables, fresh herbs
   - dairy: milk, cheese, yogurt, eggs, butter, cream
   - protein: meat, fish, poultry, tofu, beans, lentils
   - pantry: grains, bread, pasta, rice, canned goods, oils, condiments, sauces, snacks, beverages, baked goods
   - spice: dried spices, seasonings, dried herbs
   - other: household, cleaning, personal care items
7. confidence_score: 0.0–1.0 float. Use 0.9+ for clearly identified grocery items, 0.5–0.8 for somewhat confident, below 0.5 for uncertain.
8. Do not guess or invent expiry dates. Do not include prices.
9. Return ONLY valid JSON — no markdown fences, no preamble, no explanation.`;

const USER_MESSAGE = `Extract all grocery and pantry items from this receipt image.
Return ONLY this exact JSON structure with no other text:
{
  "items": [
    {
      "name": "Human Readable Name",
      "quantity": 1,
      "unit": "pieces",
      "category": "pantry",
      "confidence_score": 0.92,
      "original_receipt_text": "EXACT TEXT FROM RECEIPT"
    }
  ]
}`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
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

    // ── Parse file from multipart form ────────────────────────────────────────
    const formData = await req.formData();
    const uploadedFile = formData.get('image') as File | null;

    if (!uploadedFile) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fileBytes = await uploadedFile.arrayBuffer();
    const fileBase64 = arrayBufferToBase64(fileBytes);
    const mimeType = uploadedFile.type || 'image/jpeg';
    const isPdf = mimeType === 'application/pdf';

    // Claude uses a "document" block for PDFs and an "image" block for raster images.
    const fileContentBlock = isPdf
      ? {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileBase64,
          },
        }
      : {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            data: fileBase64,
          },
        };

    // ── Call Claude API ────────────────────────────────────────────────────────
    if (!CLAUDE_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              fileContentBlock,
              {
                type: 'text',
                text: USER_MESSAGE,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('[parse-receipt] Claude API error:', claudeResponse.status, errorText);
      throw new Error(`Claude API error: ${claudeResponse.status}`);
    }

    const claudeData = await claudeResponse.json();
    const rawText: string = claudeData.content?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[parse-receipt] JSON parse error:', e, '\nRaw text:', cleaned);
      throw new Error('Claude returned invalid JSON');
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      throw new Error('Unexpected response structure from Claude');
    }

    console.log(`[parse-receipt] Extracted ${parsed.items.length} items for user ${user.id}`);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[parse-receipt] Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'receipt_parse_failed' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
