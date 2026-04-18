import React, { useState } from 'react';
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
    alert(`"${meal.meal_name}" logged!`);
  };

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', marginBottom: 4 }}>Meal Ideas</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 14 }}>AI-powered suggestions from your pantry</p>

      <button onClick={fetchSuggestions} disabled={loading} style={{
        background: '#22c55e', color: '#0f1117', border: 'none', borderRadius: 12,
        padding: '13px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        marginBottom: 24, opacity: loading ? 0.7 : 1,
      }}>
        {loading ? 'Generating…' : suggestions.length ? '🔄 Regenerate' : '✨ Suggest Meals'}
      </button>

      {fallbackUsed && <div style={{ background: '#422006', borderRadius: 10, padding: 12, marginBottom: 16, borderLeft: '3px solid #f59e0b' }}>
        <span style={{ color: '#fbbf24', fontSize: 13 }}>⏱ These suggestions may be outdated. Regenerate to try again.</span>
      </div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {suggestions.map((meal, idx) => (
          <div key={idx} style={{ background: '#1a1f2e', borderRadius: 14, border: '1px solid #1f2937', overflow: 'hidden' }}>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: 0 }}>{meal.meal_name}</h3>
                {meal.missing_ingredients.length > 0 && (
                  <span style={{ background: '#422006', color: '#f59e0b', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                    {meal.missing_ingredients.length} missing
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[
                  { label: 'kcal', value: meal.calories, color: '#22c55e' },
                  { label: 'protein', value: `${meal.protein_g}g`, color: '#3b82f6' },
                  { label: 'carbs', value: `${meal.carbs_g}g`, color: '#f59e0b' },
                  { label: 'fat', value: `${meal.fat_g}g`, color: '#f97316' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: '#111827', borderRadius: 10, padding: '8px 12px', textAlign: 'center', flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {meal.tags.map(tag => (
                  <span key={tag} style={{ background: '#1f2937', color: '#9ca3af', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6 }}>{tag}</span>
                ))}
              </div>

              <button onClick={() => setExpanded(expanded === idx ? null : idx)}
                style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
                {expanded === idx ? '▲ Hide details' : '▼ Show instructions'}
              </button>

              {expanded === idx && (
                <div style={{ borderTop: '1px solid #1f2937', paddingTop: 12 }}>
                  <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.6, marginBottom: 12 }}>{meal.instructions}</p>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Ingredients used</div>
                  {meal.ingredients_used.map((i, n) => (
                    <div key={n} style={{ fontSize: 13, color: '#9ca3af', lineHeight: 2 }}>• {i.name} — {i.quantity} {i.unit}</div>
                  ))}
                  {meal.missing_ingredients.length > 0 && <>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '10px 0 6px' }}>Missing</div>
                    {meal.missing_ingredients.map((i, n) => (
                      <div key={n} style={{ fontSize: 13, color: '#f59e0b', lineHeight: 2 }}>⚠ {i.name} — {i.quantity} {i.unit}</div>
                    ))}
                  </>}
                </div>
              )}

              <button onClick={() => logMeal(meal, idx)} disabled={logged === idx} style={{
                width: '100%', background: '#22c55e', color: '#0f1117', border: 'none',
                borderRadius: 10, padding: '12px', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', marginTop: 4, opacity: logged === idx ? 0.7 : 1,
              }}>
                {logged === idx ? 'Logging…' : 'Log This Meal'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}