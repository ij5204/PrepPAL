import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MealSuggestion } from '@preppal/types';

export function MealsPage() {
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logged, setLogged] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState('');
  const toastTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => {
      if (mountedRef.current) setToast('');
    }, 2200);
  };

  const fetchSuggestions = async () => {
    setError('');
    setLoading(true);
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      if (!session) throw new Error('Please sign in again, then retry.');

      const res = await supabase.functions.invoke('generate-meal-suggestions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.error) throw res.error;
      if (!res.data?.suggestions || !Array.isArray(res.data.suggestions) || res.data.suggestions.length === 0) {
        throw new Error('No suggestions returned. Please try again.');
      }

      if (!mountedRef.current) return;
      setSuggestions(res.data.suggestions);
      setFallbackUsed(Boolean(res.data.fallback_used));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to generate meal ideas. Please try again.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const logMeal = async (meal: MealSuggestion, idx: number) => {
    setError('');
    setLogged(idx);
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error('You are signed out. Please sign in again.');

      const { error: insertErr } = await supabase.from('meal_logs').insert({
        user_id: user.id,
        meal_name: meal.meal_name,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        ingredients_used: [],
        claude_suggestion: true,
        meal_tags: meal.tags,
        nutrition_is_estimate: true,
        eaten_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;

      if (!mountedRef.current) return;
      showToast(`Logged: ${meal.meal_name}`);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to log meal. Please try again.');
    } finally {
      if (mountedRef.current) setLogged(null);
    }
  };

  return (
    <div>
      <h1 className="pageTitle">Meal Ideas</h1>
      <p className="pageSubtitle">Suggestions based on what you already have.</p>

      <button onClick={fetchSuggestions} disabled={loading} className="btn btnPrimary" style={{ padding: '13px 24px', fontSize: 15, fontWeight: 750, marginBottom: 18 }}>
        {loading ? 'Generating…' : suggestions.length ? 'Regenerate' : 'Generate meal ideas'}
      </button>

      {error && (
        <div className="calloutDanger">{error}</div>
      )}

      {fallbackUsed && (
        <div className="calloutWarn">
          These results may be stale. Regenerate to refresh.
        </div>
      )}

      <div className="mealIdeasStack">
        {suggestions.map((meal, idx) => (
          <div key={idx} className="card cardPad">
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 750, color: 'var(--text-primary)', margin: 0, lineHeight: 1.25 }}>{meal.meal_name}</h3>
                  {meal.missing_ingredients.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <span className="badgeWarn">
                        {meal.missing_ingredients.length} missing ingredient{meal.missing_ingredients.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => logMeal(meal, idx)}
                  disabled={logged === idx}
                  className="btn btnPrimary"
                  style={{ padding: '10px 12px', fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap' }}
                >
                  {logged === idx ? 'Logging…' : 'Log'}
                </button>
              </div>

              <div className="mealMacroGrid">
                {([
                  ['kcal', meal.calories, true],
                  ['protein', `${meal.protein_g}g`, false],
                  ['carbs', `${meal.carbs_g}g`, false],
                  ['fat', `${meal.fat_g}g`, false],
                ] as const).map(([label, value, accent]) => (
                  <div key={label} className="mealMacroPill">
                    <div className={accent ? 'mealMacroValueAccent' : 'mealMacroValue'}>{value}</div>
                    <div className="mealMacroLabel">{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {meal.tags.map((tag: string) => (
                  <span key={tag} className="mealTag">{tag}</span>
                ))}
              </div>

              <button
                type="button"
                className="mealInstructionsToggle"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
              >
                {expanded === idx ? 'Hide instructions' : 'Show instructions'}
              </button>

              {expanded === idx && (
                <div className="mealDivider">
                  <p className="mealInstructionsBody">{meal.instructions}</p>
                  <div className="mealListEyebrow">Ingredients used</div>
                  {meal.ingredients_used.map((i: MealSuggestion['ingredients_used'][number], n: number) => (
                    <div key={n} className="mealListLine">• {i.name} — {i.quantity} {i.unit}</div>
                  ))}
                  {meal.missing_ingredients.length > 0 && <>
                    <div className="mealListEyebrowWarn">Missing</div>
                    {meal.missing_ingredients.map((i: MealSuggestion['missing_ingredients'][number], n: number) => (
                      <div key={n} className="mealListLine" style={{ color: 'var(--amber)' }}>• {i.name} — {i.quantity} {i.unit}</div>
                    ))}
                  </>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="toastFloating" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}