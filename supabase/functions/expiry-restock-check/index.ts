// supabase/functions/expiry-restock-check/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// PrepPAL — Daily Expiry & Restock Alert Function
// Triggered by pg_cron at 8:00 AM UTC.
// Per spec Section 8.3 and 8.6.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results = { expiry_alerts: 0, restock_alerts: 0, errors: 0 };

  try {
    // ── Expiry alerts: items expiring within 2 days ────────────────────────────
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const { data: expiringItems } = await supabase
      .from('pantry_items')
      .select('id, user_id, name, expiry_date, users(push_token, timezone)')
      .lte('expiry_date', twoDaysFromNow.toISOString().split('T')[0])
      .not('expiry_date', 'is', null);

    for (const item of expiringItems ?? []) {
      try {
        // Dedup: check if we already sent this alert today
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', item.user_id)
          .eq('pantry_item_id', item.id)
          .eq('type', 'expiry_warning')
          .gte('sent_at', todayStart.toISOString())
          .single();

        if (existingNotif) continue; // Already sent today

        const expiryDate = new Date(item.expiry_date);
        const now = new Date();
        const diffDays = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        let message: string;
        if (diffDays <= 0) {
          message = `${item.name} expired today. Add it to your grocery list?`;
        } else {
          message = `${item.name} expires in ${diffDays} day${diffDays === 1 ? '' : 's'}. Tap to see your pantry.`;
        }

        const pushToken = (item as any).users?.push_token;
        let status: 'sent' | 'failed' = 'failed';

        if (pushToken) {
          const pushResult = await sendPushNotification(
            pushToken,
            'PrepPAL — Food Expiring Soon',
            message,
            { screen: 'Pantry', item_id: item.id }
          );
          status = pushResult ? 'sent' : 'failed';
        }

        await supabase.from('notifications').insert({
          user_id: item.user_id,
          type: 'expiry_warning',
          message,
          status,
          pantry_item_id: item.id,
        });

        results.expiry_alerts++;
      } catch (itemErr) {
        results.errors++;
        await logError(supabase, 'expiry_item_error', String(itemErr));
      }
    }

    // ── Restock alerts: quantity = 0 ──────────────────────────────────────────
    const { data: outOfStockItems } = await supabase
      .from('pantry_items')
      .select('id, user_id, name, unit, users(push_token)')
      .eq('quantity', 0);

    for (const item of outOfStockItems ?? []) {
      try {
        // Add to grocery list if not already there
        const { data: existingGrocery } = await supabase
          .from('grocery_list_items')
          .select('id')
          .eq('user_id', item.user_id)
          .eq('name', item.name)
          .eq('is_checked', false)
          .single();

        if (!existingGrocery) {
          await supabase.from('grocery_list_items').insert({
            user_id: item.user_id,
            name: item.name,
            reason: 'low_stock',
          });
        }

        // Dedup push notification
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', item.user_id)
          .eq('pantry_item_id', item.id)
          .eq('type', 'low_stock')
          .gte('sent_at', todayStart.toISOString())
          .single();

        if (existingNotif) continue;

        const message = `${item.name} is out of stock. Add it to your grocery list.`;
        const pushToken = (item as any).users?.push_token;
        let status: 'sent' | 'failed' = 'failed';

        if (pushToken) {
          const pushResult = await sendPushNotification(
            pushToken,
            'PrepPAL — Out of Stock',
            message,
            { screen: 'Grocery', item_id: item.id }
          );
          status = pushResult ? 'sent' : 'failed';
        }

        await supabase.from('notifications').insert({
          user_id: item.user_id,
          type: 'low_stock',
          message,
          status,
          pantry_item_id: item.id,
        });

        results.restock_alerts++;
      } catch (itemErr) {
        results.errors++;
      }
    }
  } catch (err) {
    await logError(supabase, 'expiry_restock_check_fatal', String(err));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, ...results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function sendPushNotification(
  to: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, title, body, data, sound: 'default' }),
    });
    const result = await res.json();
    return result?.data?.status !== 'error';
  } catch {
    return false;
  }
}

async function logError(supabase: any, eventType: string, error: string) {
  try {
    await supabase.from('system_events').insert({
      event_type: eventType,
      source: 'edge:expiry-restock-check',
      payload: {},
      error,
    });
  } catch {}
}
