import React, { useEffect, useRef, useState } from 'react';
import { Clock, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { MealSuggestion } from '@preppal/types';

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
const PREFERENCES = ['High Protein', 'Quick Meal', 'Low Calorie', 'Vegetarian', 'Keto', 'Use Expiring Items'];

function getMealAccent(meal: MealSuggestion): { bg: string; hi: string } {
  const tags = (meal.tags ?? []).map(t => t.toLowerCase());
  const type = (meal.meal_type ?? '').toLowerCase();
  if (type === 'breakfast' || tags.some(t => t.includes('breakfast')))
    return { bg: 'linear-gradient(135deg,#1a0828 0%,#2d1060 100%)', hi: '#b794f4' };
  if (tags.some(t => t.includes('keto') || t.includes('low carb')))
    return { bg: 'linear-gradient(135deg,#051a0f 0%,#0a3d20 100%)', hi: '#68d391' };
  if (tags.some(t => t.includes('high protein') || t.includes('protein')))
    return { bg: 'linear-gradient(135deg,#1a0800 0%,#3d1500 100%)', hi: '#fc8181' };
  if (type === 'lunch' || tags.some(t => t.includes('lunch') || t.includes('bowl') || t.includes('salad')))
    return { bg: 'linear-gradient(135deg,#001a1a 0%,#003d3d 100%)', hi: '#4fd1c5' };
  if (type === 'dinner')
    return { bg: 'linear-gradient(135deg,#0a0a00 0%,#1c2500 100%)', hi: '#C8FF00' };
  return { bg: 'linear-gradient(135deg,#080818 0%,#12122a 100%)', hi: '#00D4FF' };
}

const CARD_BASE: React.CSSProperties = {
  background: 'rgba(14,14,22,0.62)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 18,
  overflow: 'hidden',
  boxShadow: '0 4px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
  display: 'flex',
  flexDirection: 'column',
};

// ── Recipe Modal ──────────────────────────────────────────────────────────────

function RecipeModal({ meal, onClose, onLog, isLogging }: {
  meal: MealSuggestion;
  onClose: () => void;
  onLog: () => void;
  isLogging: boolean;
}) {
  const { bg, hi } = getMealAccent(meal);
  const missing = meal.missing_ingredients ?? [];
  const used = meal.ingredients_used ?? [];
  const steps = meal.step_by_step_instructions ?? [];
  const totalTime = (meal.prep_time_minutes || 0) + (meal.cook_time_minutes || 0);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(0,0,0,0.70)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        ...CARD_BASE,
        width: '100%', maxWidth: 640, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.70)',
        animation: 'slideUp .22s ease',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background: bg, padding: '22px 24px 20px', position: 'relative', flexShrink: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 20% 60%, rgba(255,255,255,0.04) 0%, transparent 70%)', pointerEvents: 'none' }} />
          {/* Close */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>

          {/* Tags + time */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {(meal.tags ?? []).slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 10.5, fontWeight: 600, color: hi,
                background: 'rgba(0,0,0,0.40)', border: `1px solid ${hi}33`,
                borderRadius: 20, padding: '3px 9px',
              }}>{tag}</span>
            ))}
            {totalTime > 0 && (
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', padding: '3px 0' }}>
                <Clock size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />{totalTime} min · {meal.servings} serving{meal.servings > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Name */}
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 16px', lineHeight: 1.25, paddingRight: 36 }}>
            {meal.meal_name}
          </h2>

          {/* Macro row */}
          <div style={{ display: 'flex', gap: 0, background: 'rgba(0,0,0,0.25)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              { label: 'CALORIES', value: meal.calories_per_serving || meal.total_calories, color: hi },
              { label: 'PROTEIN',  value: `${meal.protein_g}g`,  color: '#fff' },
              { label: 'CARBS',    value: `${meal.carbs_g}g`,    color: '#fff' },
              { label: 'FAT',      value: `${meal.fat_g}g`,      color: '#fff' },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{
                flex: 1, textAlign: 'center', padding: '10px 0',
                borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '1px', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Ingredients from pantry */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '1px', marginBottom: 10 }}>INGREDIENTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
              {used.map((ing, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--txt2)' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: hi, flexShrink: 0 }} />
                  <span><span style={{ color: 'var(--txt)', fontWeight: 500 }}>{ing.quantity} {ing.unit}</span> {ing.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Missing ingredients */}
          {missing.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: '1px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={11} />
                REQUIRES FROM STORE ({missing.length})
              </div>
              <div style={{
                background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)',
                borderRadius: 10, padding: '12px 14px',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px',
              }}>
                {missing.map((ing, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#f97316' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#f97316', flexShrink: 0 }} />
                    <span>{ing.quantity} {ing.unit} {ing.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Instructions */}
          {steps.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '1px', marginBottom: 12 }}>HOW TO MAKE</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      background: `${hi}22`, border: `1px solid ${hi}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10.5, fontWeight: 800, color: hi,
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 13.5, color: 'var(--txt2)', lineHeight: 1.6, paddingTop: 1 }}>{step}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Log Meal footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <button onClick={onLog} disabled={isLogging} style={{
            width: '100%', height: 48, background: isLogging ? 'rgba(200,255,0,0.55)' : 'var(--acc)',
            border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
            color: '#0a0a00', cursor: isLogging ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--fb)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            {isLogging
              ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Logging…</>
              : 'Log Meal'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Meal Card (all uniform) ───────────────────────────────────────────────────

function MealCard({ meal, idx, logged, onLog, onView }: {
  meal: MealSuggestion; idx: number; logged: number | null;
  onLog: (e: React.MouseEvent) => void; onView: () => void;
}) {
  const isLogging = logged === idx;
  const { bg, hi } = getMealAccent(meal);
  const missing = meal.missing_ingredients ?? [];
  const used = meal.ingredients_used ?? [];
  const totalTime = (meal.prep_time_minutes || 0) + (meal.cook_time_minutes || 0);
  const ingredientPreview = used.map(i => i.name).slice(0, 5).join(', ');

  return (
    <div
      style={{ ...CARD_BASE, cursor: 'pointer' }}
      onClick={onView}
    >
      {/* Accent header */}
      <div style={{
        background: bg, padding: '16px 18px 18px',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        minHeight: 130, position: 'relative', flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 25% 45%, rgba(255,255,255,0.035) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* Tags + time */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(meal.tags ?? []).slice(0, 2).map(tag => (
              <span key={tag} style={{
                fontSize: 10.5, fontWeight: 600, color: hi,
                background: 'rgba(0,0,0,0.40)', border: `1px solid ${hi}33`,
                borderRadius: 20, padding: '3px 9px',
              }}>{tag}</span>
            ))}
          </div>
          {totalTime > 0 && (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', flexShrink: 0, paddingLeft: 8, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={10} />{totalTime}m</span>
          )}
        </div>

        {/* Calorie + protein */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', position: 'relative' }}>
          <div>
            <div style={{ fontSize: 40, fontWeight: 900, color: hi, lineHeight: 1, letterSpacing: '-1.5px' }}>
              {meal.calories_per_serving || meal.total_calories}
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: hi, opacity: 0.55, letterSpacing: '1.5px' }}>KCAL</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: hi, opacity: 0.7 }} />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{meal.protein_g}g protein</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '14px 18px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
        {/* Name */}
        <h3 style={{
          fontSize: 16, fontWeight: 700, color: 'var(--txt)', margin: '0 0 10px',
          lineHeight: 1.35, letterSpacing: '-0.2px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {meal.meal_name}
        </h3>

        {/* Missing ingredients */}
        {missing.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <AlertTriangle size={11} color="#f97316" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: '#f97316', lineHeight: 1.45 }}>
              Needs: {missing.map(m => m.name).join(', ')}
            </span>
          </div>
        )}

        {/* Ingredient preview */}
        <div style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.55, flex: 1 }}>
          {ingredientPreview}{used.length > 5 ? ` +${used.length - 5} more` : '.'}
        </div>
      </div>

      {/* Log Meal — stops propagation so card click doesn't also open modal */}
      <button
        onClick={onLog}
        disabled={isLogging}
        style={{
          width: '100%', height: 46, flexShrink: 0,
          background: 'transparent',
          border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 13, fontWeight: 600,
          color: isLogging ? 'var(--txt3)' : 'var(--txt2)',
          cursor: isLogging ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--fb)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s, color .15s',
        }}
        onMouseOver={e => { if (!isLogging) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt)'; } }}
        onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = isLogging ? 'var(--txt3)' : 'var(--txt2)'; }}
      >
        {isLogging
          ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin .7s linear infinite', marginRight: 6 }} />Logging…</>
          : 'Log Meal'}
      </button>
    </div>
  );
}

// ── Config panel ─────────────────────────────────────────────────────────────

function ConfigPanel({ mealType, servings, preferences, loading, onMealType, onServings, onTogglePref, onGenerate }: {
  mealType: string; servings: number; preferences: string[]; loading: boolean;
  onMealType: (t: string) => void; onServings: (n: number) => void;
  onTogglePref: (p: string) => void; onGenerate: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 32, gap: 28 }}>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--txt2)', textAlign: 'center' }}>
        AI picks recipes from your pantry and nutritional goals. Click any card to view the full recipe.
      </p>
      <div style={{ ...CARD_BASE, width: '100%', maxWidth: 560 }}>
        <div style={{ padding: '24px 24px 28px' }}>
          <Section label="MEAL TYPE">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MEAL_TYPES.map(type => (
                <PillBtn key={type} active={mealType === type} onClick={() => onMealType(type)}>{type}</PillBtn>
              ))}
            </div>
          </Section>
          <Section label="SERVINGS">
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 3, 4].map(n => (
                <PillBtn key={n} active={servings === n} onClick={() => onServings(n)}>{n}</PillBtn>
              ))}
            </div>
          </Section>
          <Section label="PREFERENCES" sub="optional" last>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PREFERENCES.map(pref => {
                const on = preferences.includes(pref);
                return (
                  <button key={pref} onClick={() => onTogglePref(pref)} style={{
                    padding: '6px 14px', borderRadius: 24, fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
                    background: on ? 'rgba(200,255,0,0.10)' : 'rgba(255,255,255,0.04)',
                    color: on ? 'var(--acc)' : 'var(--txt2)',
                    border: on ? '1px solid rgba(200,255,0,0.28)' : '1px solid rgba(255,255,255,0.09)',
                    fontFamily: 'var(--fb)', transition: 'all .15s',
                  }}>{pref}</button>
                );
              })}
            </div>
          </Section>
          <button onClick={onGenerate} disabled={loading} style={{
            width: '100%', height: 50, background: loading ? 'rgba(200,255,0,0.50)' : 'var(--acc)',
            border: 'none', borderRadius: 13, fontSize: 14.5, fontWeight: 700,
            color: '#0a0a00', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--fb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            {loading
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.25)', borderTopColor: '#000', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Cooking up recipes…</>
              : <><Sparkles size={16} />Generate Suggestions</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, sub, last, children }: { label: string; sub?: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: last ? 28 : 20 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '1px', marginBottom: 10 }}>
        {label}{sub && <span style={{ color: 'var(--txt3)', fontWeight: 400, letterSpacing: 0, fontSize: 10, marginLeft: 6 }}>({sub})</span>}
      </div>
      {children}
    </div>
  );
}

function PillBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 18px', borderRadius: 24, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      background: active ? 'var(--acc)' : 'rgba(255,255,255,0.06)',
      color: active ? '#0a0a00' : 'var(--txt2)',
      border: active ? 'none' : '1px solid rgba(255,255,255,0.10)',
      fontFamily: 'var(--fb)', transition: 'all .15s',
    }}>{children}</button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function MealsPage() {
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [logged, setLogged] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeModal, setActiveModal] = useState<number | null>(null);
  const [targetMealType, setTargetMealType] = useState('Dinner');
  const [targetServings, setTargetServings] = useState(1);
  const [targetPreferences, setTargetPreferences] = useState<string[]>([]);

  const toastTimeoutRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current); };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => { if (mountedRef.current) setToast(''); }, 2400);
  };

  const togglePreference = (pref: string) =>
    setTargetPreferences(prev => prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref]);

  const fetchSuggestions = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setError(''); setLoading(true); setSuggestions([]); setActiveModal(null);
    try {
      const { session } = useAuthStore.getState();
      if (!session) throw new Error('Please sign in again.');
      const res = await supabase.functions.invoke('generate-meal-suggestions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { meal_type: targetMealType, servings: targetServings, preferences: targetPreferences },
      });
      if (res.error) throw new Error(`Edge Function Error: ${res.error.message || 'Unknown error'}`);
      if (!res.data?.suggestions?.length) throw new Error('No suggestions returned. Please try again.');
      if (!mountedRef.current) return;
      setSuggestions(res.data.suggestions);
      setFallbackUsed(Boolean(res.data.fallback_used));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to generate meal ideas.');
    } finally {
      isFetchingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  };

  const logMeal = async (meal: MealSuggestion, idx: number) => {
    setError(''); setLogged(idx);
    try {
      const { session } = useAuthStore.getState();
      if (!session?.user) throw new Error('You are signed out.');
      const { error: insertErr } = await supabase.from('meal_logs').insert({
        user_id: session.user.id, meal_name: meal.meal_name,
        calories: meal.total_calories || meal.calories_per_serving,
        protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g,
        ingredients_used: [], claude_suggestion: true, meal_tags: meal.tags,
        nutrition_is_estimate: true, eaten_at: new Date().toISOString(),
      });
      if (insertErr) throw insertErr;
      if (!mountedRef.current) return;
      showToast(`Logged: ${meal.meal_name}`);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message ?? 'Failed to log meal.');
    } finally {
      if (mountedRef.current) setLogged(null);
    }
  };

  const hasResults = suggestions.length > 0;
  const modalMeal = activeModal !== null ? suggestions[activeModal] : null;

  return (
    <div className="pageWrapper" style={{ paddingTop: 32, paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: hasResults ? 28 : 0 }}>
        <div>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: 'var(--txt)', margin: '0 0 6px', letterSpacing: '-1px', lineHeight: 1.1 }}>
            Meal Suggestions
          </h1>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--txt2)' }}>
            Curated recipes based on your pantry inventory and nutritional goals.
          </p>
        </div>
        {hasResults && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingTop: 4 }}>
            {(['Filter', 'Sort'] as const).map(label => (
              <button key={label} style={{
                display: 'flex', alignItems: 'center', gap: 7,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: '9px 16px',
                fontSize: 13, fontWeight: 500, color: 'var(--txt2)', cursor: 'pointer', fontFamily: 'var(--fb)',
              }}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'rgba(255,77,0,0.08)', border: '1px solid rgba(255,77,0,0.20)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#FF7A50', marginBottom: 20 }}>
          {error}
        </div>
      )}
      {fallbackUsed && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.20)', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#f59e0b', marginBottom: 20 }}>
          AI service unavailable — showing offline fallback suggestions.
        </div>
      )}

      {!hasResults && (
        <ConfigPanel
          mealType={targetMealType} servings={targetServings} preferences={targetPreferences}
          loading={loading} onMealType={setTargetMealType} onServings={setTargetServings}
          onTogglePref={togglePreference} onGenerate={fetchSuggestions}
        />
      )}

      {hasResults && (
        <>
          {/* 2×2 uniform grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            {suggestions.map((meal, idx) => (
              <MealCard
                key={idx}
                meal={meal}
                idx={idx}
                logged={logged}
                onView={() => setActiveModal(idx)}
                onLog={e => { e.stopPropagation(); logMeal(meal, idx); }}
              />
            ))}
          </div>

          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center' }}>
            <button onClick={fetchSuggestions} disabled={loading} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 12, padding: '11px 28px',
              fontSize: 13.5, fontWeight: 600, color: 'var(--txt)',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--fb)',
            }}>
              {loading
                ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.12)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin .7s linear infinite' }} />Regenerating…</>
                : <><RefreshCw size={14} />Regenerate Suggestions</>}
            </button>
          </div>
        </>
      )}

      {/* Recipe Modal */}
      {modalMeal && (
        <RecipeModal
          meal={modalMeal}
          onClose={() => setActiveModal(null)}
          onLog={() => logMeal(modalMeal, activeModal!)}
          isLogging={logged === activeModal}
        />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(8,8,18,0.92)', backdropFilter: 'blur(20px)',
          border: '1px solid rgba(200,255,0,0.25)', borderRadius: 12,
          padding: '11px 20px', fontSize: 13, fontWeight: 600, color: 'var(--acc)',
          zIndex: 999, boxShadow: '0 8px 32px rgba(0,0,0,0.60)', animation: 'slideUp .2s ease',
        }}>{toast}</div>
      )}
    </div>
  );
}
