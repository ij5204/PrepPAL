import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { MealSuggestion } from '@preppal/types';

export function MealsPage() {
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logged, setLogged] = useState<number | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const res = await supabase.functions.invoke('generate-meal-suggestions', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    setLoading(false);
    if (res.data?.suggestions) {
      setSuggestions(res.data.suggestions);
      setFallbackUsed(res.data.fallback_used);
    }
  };

  const logMeal = async (meal: MealSuggestion, idx: number) => {
    setLogged(idx);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('meal_logs').insert({
      user_id: user.id, meal_name: meal.meal_name,
      calories: meal.calories, protein_g: meal.protein_g,
      carbs_g: meal.carbs_g, fat_g: meal.fat_g,
      ingredients_used: [], claude_suggestion: true,
      meal_tags: meal.tags, nutrition_is_estimate: true,
      eaten_at: new Date().toISOString(),
    });
    setLogged(null);
    // Lightweight confirmation without a disruptive popup
    setToast(`Logged: ${meal.meal_name}`);
    window.setTimeout(() => setToast(''), 2400);
  };

  const [toast, setToast] = useState('');

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', marginBottom: 4 }}>Meal Ideas</h1>
      <p style={{ color: 'rgba(148,163,184,0.9)', marginBottom: 24, fontSize: 14 }}>Suggestions based on what you already have.</p>

      <button onClick={fetchSuggestions} disabled={loading} style={{
        background: 'linear-gradient(180deg, rgba(99,102,241,0.95), rgba(79,70,229,0.95))',
        color: '#0b0f17',
        border: '1px solid rgba(99,102,241,0.35)',
        borderRadius: 12,
        padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        marginBottom: 24, opacity: loading ? 0.7 : 1,
      }}>
        {loading ? 'Generating…' : suggestions.length ? 'Regenerate' : 'Generate meal ideas'}
      </button>

      {fallbackUsed && <div style={{ background: 'rgba(245,158,11,0.10)', borderRadius: 12, padding: 12, marginBottom: 16, border: '1px solid rgba(245,158,11,0.25)' }}>
        <span style={{ color: 'rgba(251,191,36,0.95)', fontSize: 13 }}>These results may be stale. Regenerate to refresh.</span>
      </div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {suggestions.map((meal, idx) => (
          <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.72)', borderRadius: 16, border: '1px solid rgba(148,163,184,0.14)', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 }}>{meal.meal_name}</h3>
                {meal.missing_ingredients.length > 0 && (
                  <span style={{ background: 'rgba(245,158,11,0.12)', color: 'rgba(251,191,36,0.95)', fontSize: 11, fontWeight: 750, padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(245,158,11,0.25)' }}>
                    {meal.missing_ingredients.length} missing
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'kcal', value: meal.calories, color: '#a5b4fc' },
                  { label: 'protein', value: `${meal.protein_g}g`, color: '#3b82f6' },
                  { label: 'carbs', value: `${meal.carbs_g}g`, color: '#f59e0b' },
                  { label: 'fat', value: `${meal.fat_g}g`, color: '#f97316' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: 'rgba(2,6,23,0.55)', borderRadius: 12, padding: '10px 12px', textAlign: 'center', flex: 1, border: '1px solid rgba(148,163,184,0.12)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {meal.tags.map((tag: string) => (
                  <span key={tag} style={{ background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.14)', color: 'rgba(226,232,240,0.78)', fontSize: 11, fontWeight: 650, padding: '4px 10px', borderRadius: 999 }}>{tag}</span>
                ))}
              </div>

              <button onClick={() => setExpanded(expanded === idx ? null : idx)}
                style={{ background: 'none', border: 'none', color: 'rgba(148,163,184,0.85)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                {expanded === idx ? 'Hide instructions' : 'Show instructions'}
              </button>

              {expanded === idx && (
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.12)', paddingTop: 12 }}>
                  <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.6, marginBottom: 12 }}>{meal.instructions}</p>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Ingredients used</div>
                  {meal.ingredients_used.map((i: MealSuggestion['ingredients_used'][number], n: number) => (
                    <div key={n} style={{ fontSize: 13, color: '#9ca3af', lineHeight: 2 }}>• {i.name} — {i.quantity} {i.unit}</div>
                  ))}
                  {meal.missing_ingredients.length > 0 && <>
                    <div style={{ fontSize: 12, fontWeight: 750, color: 'rgba(251,191,36,0.95)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '10px 0 6px' }}>Missing</div>
                    {meal.missing_ingredients.map((i: MealSuggestion['missing_ingredients'][number], n: number) => (
                      <div key={n} style={{ fontSize: 13, color: 'rgba(251,191,36,0.95)', lineHeight: 2 }}>• {i.name} — {i.quantity} {i.unit}</div>
                    ))}
                  </>}
                </div>
              )}

              <button onClick={() => logMeal(meal, idx)} disabled={logged === idx} style={{
                width: '100%',
                background: 'linear-gradient(180deg, rgba(99,102,241,0.95), rgba(79,70,229,0.95))',
                color: '#0b0f17',
                border: '1px solid rgba(99,102,241,0.35)',
                borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', marginTop: 4, opacity: logged === idx ? 0.7 : 1,
              }}>
                {logged === idx ? 'Logging…' : 'Log This Meal'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          right: 18,
          bottom: 18,
          background: 'rgba(2,6,23,0.78)',
          border: '1px solid rgba(148,163,184,0.16)',
          color: '#e2e8f0',
          borderRadius: 12,
          padding: '10px 12px',
          fontSize: 13,
          boxShadow: '0 12px 34px rgba(0,0,0,0.45)',
          maxWidth: 360,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}