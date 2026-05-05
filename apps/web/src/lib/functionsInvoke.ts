/** Prefer JSON `error` from edge function body; fall back to Supabase client message. */
export function getFunctionsInvokeErrorMessage(
  error: { message: string; context?: { status?: number } },
  data: unknown
): string {
  if (data && typeof data === 'object') {
    const err = (data as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err.trim();
  }

  const status = error.context?.status;
  if (status === 404) {
    return 'Meal suggestions are not available: the edge function was not found. Deploy generate-meal-suggestions to this Supabase project (or run supabase functions serve for local dev).';
  }
  if (status === 401) {
    return 'Your session is no longer valid. Sign out, sign in again, then retry.';
  }

  if (/non-2xx/i.test(error.message)) {
    return 'Meal suggestions service returned an error. Check the Supabase dashboard (Edge Functions logs), confirm CLAUDE_API_KEY and secrets are set, and that your account has a profile row in the users table.';
  }

  return error.message;
}
