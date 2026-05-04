/**
 * @preppal/api — shared Supabase client factories for apps that need them.
 * Mobile uses a dedicated client in `apps/mobile/src/lib/supabase.ts` for AsyncStorage.
 */
export { createClient } from '@supabase/supabase-js';
export type { SupabaseClient } from '@supabase/supabase-js';
