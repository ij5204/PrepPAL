import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MealSuggestion } from '@preppal/types';

const MACRO_COLORS = {
  kcal: 'var(--accent)',
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#f97316',
};

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
      showToast(`✓ Logged: ${meal.meal_name}`);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to log meal. Please try again.');
    } finally {
      if (mountedRef.current) setLogged(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 className="pageTitle" style={{ margin: 0 }}>Meal Ideas</h1>
          <p className="pageSubtitle" style={{ marginTop: 4, marginBottom: 0 }}>
            AI suggestions based on your pantry
          </p>
        </div>
        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="btn btnPrimary"
          style={{ padding: '11px 20px', fontSize: 14, fontWeight: 750 }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
              Generating…
            </span>
          ) : suggestions.length ? '✦ Regenerate' : '✦ Generate ideas'}
        </button>
      </div>

      {error && <div className="calloutDanger">{error}</div>}
      {fallbackUsed && <div className="calloutWarn">These results may be stale. Regenerate to refresh.</div>}

      {/* Empty state */}
      {!loading && suggestions.length === 0 && !error && (
        <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🍽️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            No meal ideas yet
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 300, margin: '0 auto 24px' }}>
            Add items to your pantry first, then generate personalized meal suggestions powered by AI.
          </div>
          <button onClick={fetchSuggestions} className="btn btnPrimary" style={{ padding: '12px 28px', fontSize: 15 }}>
            ✦ Generate meal ideas
          </button>
        </div>
      )}

      <div className="mealIdeasStack">
        {suggestions.map((meal, idx) => (
          <div key={idx} className="card animate-fade-in" style={{ overflow: 'hidden' }}>
            {/* Card header with gradient accent */}
            <div style={{
              padding: '18px 20px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent-bg) 0%, transparent 100%)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {meal.meal_name}
                  </h3>
                  {meal.missing_ingredients.length > 0 && (
                    <span className="badgeWarn">
                      ⚠ {meal.missing_ingredients.length} missing ingredient{meal.missing_ingredients.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => logMeal(meal, idx)}
                  disabled={logged === idx}
                  className="btn btnPrimary"
                  style={{ padding: '9px 16px', fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {logged === idx ? 'Logging…' : '+ Log meal'}
                </button>
              </div>
            </div>

            {/* Macro pills */}
            <div style={{ padding: '16px 20px 14px' }}>
              <div className="mealMacroGrid">
                {([
                  ['kcal', meal.calories, 'kcal'],
                  ['protein', `${meal.protein_g}g`, 'protein'],
                  ['carbs', `${meal.carbs_g}g`, 'carbs'],
                  ['fat', `${meal.fat_g}g`, 'fat'],
                ] as [string, string | number, keyof typeof MACRO_COLORS][]).map(([label, value, colorKey]) => (
                  <div key={label} className="mealMacroPill">
                    <div style={{ fontSize: 16, fontWeight: 800, color: MACRO_COLORS[colorKey] }}>{value}</div>
                    <div className="mealMacroLabel">{label}</div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {meal.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {meal.tags.map((tag: string) => (
                    <span key={tag} className="mealTag">{tag}</span>
                  ))}
                </div>
              )}

              {/* Instructions toggle */}
              <button
                type="button"
                className="mealInstructionsToggle"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
              >
                {expanded === idx ? '▲ Hide details' : '▼ Show details'}
              </button>

              {expanded === idx && (
                <div className="mealDivider animate-fade-in">
                  <p className="mealInstructionsBody">{meal.instructions}</p>

                  <div className="mealListEyebrow">Ingredients used</div>
                  {meal.ingredients_used.map((i, n) => (
                    <div key={n} className="mealListLine">• {i.name} — {i.quantity} {i.unit}</div>
                  ))}

                  {meal.missing_ingredients.length > 0 && (
                    <>
                      <div className="mealListEyebrowWarn">Missing from pantry</div>
                      {meal.missing_ingredients.map((i, n) => (
                        <div key={n} className="mealListLine" style={{ color: 'var(--amber)' }}>• {i.name} — {i.quantity} {i.unit}</div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div className="toastFloating" role="status">{toast}</div>
      )}
    </div>
  );
}
