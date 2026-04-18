// supabase/functions/health/index.ts
// Simple health check — Phase 0 exit criteria
import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

serve((_req) =>
  new Response(JSON.stringify({ status: 'ok', service: 'preppal', ts: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  })
);
