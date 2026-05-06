import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { MealSuggestion } from '@preppal/types';

const MACRO_COLORS = {
  kcal: 'var(--accent)',
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fat: '#f97316',
};

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const PREFERENCES = [
  'High protein',
  'Quick meal',
  'Low calorie',
  'Filling',
  'Vegetarian',
  'Use expiring items first'
];

export function MealsPage() {
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logged, setLogged] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [toast, setToast] = useState('');
  
  // New configuration state
  const [targetMealType, setTargetMealType] = useState('Dinner');
  const [targetServings, setTargetServings] = useState(1);
  const [targetPreferences, setTargetPreferences] = useState<string[]>([]);

  const toastTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const isFetchingRef = useRef(false);

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

  const togglePreference = (pref: string) => {
    setTargetPreferences(prev => 
      prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]
    );
  };

  const fetchSuggestions = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setError('');
    setLoading(true);
    setSuggestions([]);
    try {
      const { session } = useAuthStore.getState();
      if (!session) throw new Error('Please sign in again, then retry.');

      const res = await supabase.functions.invoke('generate-meal-suggestions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          meal_type: targetMealType,
          servings: targetServings,
          preferences: targetPreferences
        }
      });

      if (res.error) {
        throw new Error(`Edge Function Error: ${res.error.message || 'Unknown error'}`);
      }
      
      const resData = res.data;

      if (!resData?.suggestions || !Array.isArray(resData.suggestions) || resData.suggestions.length === 0) {
        throw new Error('No suggestions returned. Please try again.');
      }

      if (!mountedRef.current) return;
      setSuggestions(resData.suggestions);
      setFallbackUsed(Boolean(resData.fallback_used));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to generate meal ideas. Please try again.');
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const logMeal = async (meal: MealSuggestion, idx: number) => {
    setError('');
    setLogged(idx);
    try {
      const { session } = useAuthStore.getState();
      if (!session?.user) throw new Error('You are signed out. Please sign in again.');

      const { error: insertErr } = await supabase.from('meal_logs').insert({
        user_id: session.user.id,
        meal_name: meal.meal_name,
        calories: meal.total_calories || meal.calories_per_serving, // fallback if needed
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
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 className="pageTitle" style={{ margin: 0 }}>Meal Ideas</h1>
        <p className="pageSubtitle" style={{ marginTop: 4, marginBottom: 0 }}>
          Configure your meal and get personalized AI recipes.
        </p>
      </div>

      {/* Configuration Form */}
      <div className="card" style={{ padding: '24px', marginBottom: '24px', background: 'var(--surface)' }}>
        
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            1. What meal are you planning?
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MEAL_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setTargetMealType(type)}
                className="btn"
                style={{
                  padding: '8px 16px',
                  borderRadius: 100,
                  fontSize: 14,
                  fontWeight: 600,
                  background: targetMealType === type ? 'var(--accent)' : 'var(--surface-elevated)',
                  color: targetMealType === type ? '#000' : 'var(--text-primary)',
                  border: targetMealType === type ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            2. How many servings?
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 4].map(num => (
              <button
                key={num}
                onClick={() => setTargetServings(num)}
                className="btn"
                style={{
                  padding: '8px 16px',
                  borderRadius: 100,
                  fontSize: 14,
                  fontWeight: 600,
                  background: targetServings === num ? 'var(--accent)' : 'var(--surface-elevated)',
                  color: targetServings === num ? '#000' : 'var(--text-primary)',
                  border: targetServings === num ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                {num} {num === 1 ? 'person' : 'people'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            3. Optional preferences
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PREFERENCES.map(pref => (
              <button
                key={pref}
                onClick={() => togglePreference(pref)}
                className="btn"
                style={{
                  padding: '6px 14px',
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: 600,
                  background: targetPreferences.includes(pref) ? 'var(--accent-bg)' : 'var(--surface-elevated)',
                  color: targetPreferences.includes(pref) ? 'var(--accent)' : 'var(--text-secondary)',
                  border: targetPreferences.includes(pref) ? '1px solid var(--accent)' : '1px solid var(--border)',
                }}
              >
                {targetPreferences.includes(pref) && '✓ '}
                {pref}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchSuggestions}
          disabled={loading}
          className="btn btnPrimary w-full"
          style={{ padding: '14px 20px', fontSize: 15, fontWeight: 750, justifyContent: 'center' }}
        >
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="animate-spin" style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} />
              Cooking up recipes…
            </span>
          ) : '✦ Generate Custom Recipes'}
        </button>
      </div>

      {error && <div className="calloutDanger" style={{ marginBottom: 24 }}>{error}</div>}
      {fallbackUsed && <div className="calloutWarn" style={{ marginBottom: 24 }}>⚠️ The AI service is currently unavailable. Showing emergency offline fallback suggestions based on your pantry.</div>}

      <div className="mealIdeasStack">
        {suggestions.map((meal, idx) => (
          <div key={idx} className="card animate-fade-in" style={{ overflow: 'hidden' }}>
            {/* Card header with gradient accent */}
            <div style={{
              padding: '20px 20px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'linear-gradient(135deg, var(--accent-bg) 0%, transparent 100%)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)', background: 'var(--accent-bg)', padding: '4px 10px', borderRadius: 100 }}>
                      {meal.meal_type || 'Meal'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                      ⏱ {meal.prep_time_minutes || 0}m prep + {meal.cook_time_minutes || 0}m cook • 👥 {meal.servings} serving{meal.servings > 1 ? 's' : ''}
                    </span>
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                    {meal.meal_name}
                  </h3>
                  {meal.missing_ingredients?.length > 0 && (
                    <span className="badgeWarn" style={{ display: 'inline-block', marginBottom: 4 }}>
                      ⚠ {meal.missing_ingredients.length} missing ingredient{meal.missing_ingredients.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => logMeal(meal, idx)}
                  disabled={logged === idx}
                  className="btn btnPrimary"
                  style={{ padding: '10px 16px', fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {logged === idx ? 'Logging…' : '+ Log meal'}
                </button>
              </div>
              
              {meal.why_this_fits_user && (
                <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <strong>Why it fits:</strong> {meal.why_this_fits_user}
                </div>
              )}
            </div>

            {/* Macro pills */}
            <div style={{ padding: '20px 20px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Nutrition per serving</span>
                {meal.portion_notes && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meal.portion_notes}</span>
                )}
              </div>
              
              <div className="mealMacroGrid">
                {([
                  ['kcal', meal.calories_per_serving || (meal as any).calories, 'kcal'],
                  ['protein', `${meal.protein_g}g`, 'protein'],
                  ['carbs', `${meal.carbs_g}g`, 'carbs'],
                  ['fat', `${meal.fat_g}g`, 'fat'],
                ] as [string, string | number, keyof typeof MACRO_COLORS][]).map(([label, value, colorKey]) => (
                  <div key={label} className="mealMacroPill">
                    <div style={{ fontSize: 18, fontWeight: 800, color: MACRO_COLORS[colorKey] }}>{value}</div>
                    <div className="mealMacroLabel">{label}</div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              {meal.tags?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
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
                style={{ width: '100%', padding: '12px', background: 'var(--surface-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontWeight: 700, color: 'var(--text-primary)' }}
              >
                {expanded === idx ? '▲ Hide recipe details' : '▼ Show recipe details'}
              </button>

              {expanded === idx && (
                <div className="mealDivider animate-fade-in" style={{ marginTop: 16 }}>
                  
                  <div className="mealListEyebrow" style={{ marginTop: 0 }}>Ingredients for {meal.servings} serving{meal.servings > 1 ? 's' : ''}</div>
                  {meal.ingredients_used?.map((i, n) => (
                    <div key={n} className="mealListLine">• {i.quantity} {i.unit} {i.name}</div>
                  ))}

                  {meal.missing_ingredients?.length > 0 && (
                    <>
                      <div className="mealListEyebrowWarn" style={{ marginTop: 16 }}>Missing from pantry</div>
                      {meal.missing_ingredients.map((i, n) => (
                        <div key={n} className="mealListLine" style={{ color: 'var(--amber)' }}>• {i.quantity} {i.unit} {i.name}</div>
                      ))}
                    </>
                  )}

                  <div className="mealListEyebrow" style={{ marginTop: 24, marginBottom: 12 }}>Cooking Instructions</div>
                  {meal.step_by_step_instructions ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {meal.step_by_step_instructions.map((step, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 12, background: 'var(--accent-bg)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                            {i + 1}
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', paddingTop: 2 }}>
                            {step}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mealInstructionsBody">{(meal as any).instructions}</p>
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
