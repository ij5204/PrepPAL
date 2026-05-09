import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLAUDE_API_KEY = (Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('CLAUDE_API_KEY')) || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Always return 200 so the Supabase JS client doesn't throw before we can read
// the error body. Errors are encoded in { error, detail } JSON.
function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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

CRITICAL RULES — READ CAREFULLY:

1. Extract ONLY food, beverage, and household pantry items.
2. NEVER include: tax, subtotal, total, discounts, coupons, savings, payment info (card type, last 4 digits, cash, change), store name/address, receipt ID/number, cashier name, date, time, phone numbers, loyalty points, or any non-item line.
3. Normalize item names to human-readable pantry names (e.g. "MLKSHK CHOC" → "Chocolate Milkshake", "CHKN BRST" → "Chicken Breast", "ORG BNN" → "Organic Banana").

4. QUANTITY RULES — READ THIS VERY CAREFULLY, THIS IS THE HARDEST PART:

   QUANTITY = how many separate packages/items the shopper physically put in their cart and paid for.
   It is ALMOST ALWAYS 1. Default to 1 when in doubt.

   The ONLY time quantity > 1 is when the receipt shows an explicit purchase multiplier DIRECTLY
   before or after the item line, in one of these forms:
     - "2 x Item Name"
     - "Item Name  2 @"
     - "QTY 3  Item Name"
   In those cases set quantity to that multiplier number.

   CRITICAL — DO NOT DO THESE THINGS:
   ✗ DO NOT use the count inside a multi-pack as quantity.
     "Act II Butter Microwave Popcorn 10 ct" → buyer bought 1 box. quantity: 1, package_size: 10, package_unit: "ct"
   ✗ DO NOT use the number of cans/bottles in a pack as quantity.
     "Fanta 12-Pack 12 fl oz" → buyer bought 1 pack. quantity: 1, package_size: 12, package_unit: "fl oz"
   ✗ DO NOT read line-item numbers, SKU numbers, or prices as quantity.
   ✗ DO NOT use the oz/lb/g/ml weight as quantity.
     "Chester's Flamin Hot Fries 8.05 oz" → quantity: 1, package_size: 8.05, package_unit: "oz"

   If you see a number like 10 or 12 near an item and you are not 100% certain it is a purchase
   multiplier explicitly on the receipt, put it in package_size and set quantity to 1.

5. "unit" = the counting unit for quantity. MUST be exactly one of: g, kg, oz, lbs, ml, l, cups, pieces, tsp, tbsp.
   - For packaged goods (bags, boxes, bottles, cans, jars) → use "pieces".
   - For loose produce sold by weight at checkout → use the weight unit (oz, lbs, g, kg) and quantity = the weight number.
   - Default to "pieces" if unclear.

6. "display_quantity" = a short human-readable string. Rules:
   - If package_unit is "ct", "count", or "counts" → format as "X counts" (e.g. "10 counts").
   - If there is NO ct, do NOT add any count. Just show the size: "1 pkg, 8.05 oz".
   - Examples:
     - 1 bag Chester's 8.05 oz → "1 bag, 8.05 oz"
     - 1 box Act II 10-ct popcorn → "1 box, 10 counts"
     - 1 twelve-pack Fanta 12 fl oz cans → "1 pack, 12 fl oz"
     - 2 eggplants (counted at checkout) → "2 pcs"
     - 1 pkg strawberries 1 lb → "1 pkg, 1 lb"
     - 1 tomato → "1 pc"
     - Loose bananas 0.72 kg → "0.72 kg"

7. For category: MUST be exactly one of: produce, dairy, protein, pantry, spice, other.
   - produce: fresh fruits, vegetables, fresh herbs
   - dairy: milk, cheese, yogurt, eggs, butter, cream
   - protein: meat, fish, poultry, tofu, beans, lentils
   - pantry: grains, bread, pasta, rice, canned goods, oils, condiments, sauces, snacks, beverages, baked goods
   - spice: dried spices, seasonings, dried herbs
   - other: household, cleaning, personal care items

8. confidence_score: 0.0–1.0 float. Use 0.9+ for clearly identified grocery items, 0.5–0.8 for somewhat confident, below 0.5 for uncertain.
9. Do not guess or invent expiry dates. Do not include prices.
10. Return ONLY valid JSON — no markdown fences, no preamble, no explanation.`;

const USER_MESSAGE = `Extract all grocery and pantry items from this receipt image.
Return ONLY this exact JSON structure with no other text:
{
  "items": [
    {
      "name": "Human Readable Name",
      "quantity": 1,
      "unit": "pieces",
      "package_size": 8.05,
      "package_unit": "oz",
      "display_quantity": "1 bag, 8.05 oz",
      "category": "pantry",
      "confidence_score": 0.92,
      "original_receipt_text": "EXACT TEXT FROM RECEIPT"
    }
  ]
}

Remember: quantity DEFAULTS TO 1. Only use a higher number if the receipt has an explicit purchase multiplier like "2x" or "3 @". NEVER use pack count (10 ct, 12 pk) or weight (8.05 oz) as the quantity — those go in package_size.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[parse-receipt] Missing Authorization header');
      return ok({ error: 'Unauthorized', detail: 'Missing Authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error('[parse-receipt] Auth failed:', authError?.message);
      return ok({ error: 'Unauthorized', detail: authError?.message ?? 'Invalid token' });
    }

    console.log('[parse-receipt] Authenticated user:', user.id);

    // ── Parse file from multipart form ────────────────────────────────────────
    const formData = await req.formData();
    const uploadedFile = formData.get('image') as File | null;

    if (!uploadedFile) {
      return ok({ error: 'no_file', detail: 'No image field in form data' });
    }

    console.log('[parse-receipt] File received:', uploadedFile.name, uploadedFile.type, uploadedFile.size, 'bytes');

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
      return ok({ error: 'config_error', detail: 'CLAUDE_API_KEY / ANTHROPIC_API_KEY secret is not set' });
    }

    console.log('[parse-receipt] Calling Claude with model claude-haiku-4-5-20251001...');

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
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

    const claudeStatusCode = claudeResponse.status;
    const claudeRawText = await claudeResponse.text();
    console.log('[parse-receipt] Claude HTTP status:', claudeStatusCode);

    if (!claudeResponse.ok) {
      console.error('[parse-receipt] Claude API error:', claudeStatusCode, claudeRawText);
      return ok({ error: 'claude_api_error', detail: `Claude ${claudeStatusCode}: ${claudeRawText}` });
    }

    let claudeData: any;
    try {
      claudeData = JSON.parse(claudeRawText);
    } catch (e) {
      return ok({ error: 'claude_bad_response', detail: `Claude returned non-JSON: ${claudeRawText.slice(0, 300)}` });
    }

    const rawText: string = claudeData.content?.[0]?.text ?? '';
    console.log('[parse-receipt] Claude text output:', rawText.slice(0, 500));

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error('[parse-receipt] JSON parse error. Raw text:', cleaned);
      return ok({ error: 'invalid_json', detail: `Claude returned invalid JSON: ${cleaned.slice(0, 400)}` });
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      return ok({ error: 'bad_structure', detail: `Unexpected shape from Claude. Keys: ${Object.keys(parsed).join(', ')}` });
    }

    console.log(`[parse-receipt] Extracted ${parsed.items.length} items for user ${user.id}`);
    return ok(parsed);

  } catch (err: any) {
    console.error('[parse-receipt] Unhandled error:', err);
    return ok({ error: 'receipt_parse_failed', detail: err?.message ?? String(err) });
  }
});
