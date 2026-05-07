import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { calculateGoals, formatWeightChange } from '../lib/goalCalc';
import type { WeightUnit, HeightUnit } from '../lib/goalCalc';

export function ProfilePage() {
  const { profile, refreshProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const isSavingRef = useRef(false);
  const [form, setForm] = useState({
    name: '',
    current_weight: '',
    goal_weight: '',
    height: '',
    weight_unit: 'kg' as WeightUnit,
    height_unit: 'cm' as HeightUnit,
    gender: 'male' as 'male' | 'female' | 'other',
    goal_date: '',
    fitness_goal: 'maintaining' as 'cutting' | 'maintaining' | 'bulking',
    activity_level: 'moderate' as 'sedentary' | 'light' | 'moderate' | 'active',
    daily_calorie_goal: '',
    protein_goal_g: '',
    dietary_restrictions: [] as string[],
    preferred_cuisines: [] as string[],
  });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name ?? '',
      current_weight: (profile as any).current_weight ?? '',
      goal_weight: (profile as any).goal_weight ?? '',
      height: (profile as any).height ?? '',
      weight_unit: (profile as any).weight_unit ?? 'kg',
      height_unit: (profile as any).height_unit ?? 'cm',
      gender: (profile as any).gender ?? 'male',
      goal_date: (profile as any).goal_date ?? '',
      fitness_goal: profile.fitness_goal ?? 'maintaining',
      activity_level: profile.activity_level ?? 'moderate',
      daily_calorie_goal: String(profile.daily_calorie_goal ?? 2200),
      protein_goal_g: profile.protein_goal_g ? String(profile.protein_goal_g) : '',
      dietary_restrictions: profile.dietary_restrictions ?? [],
      preferred_cuisines: profile.preferred_cuisines ?? [],
    });
  }, [profile]);

  const goalResult = (() => {
    if (!form.current_weight || !form.goal_weight || !form.height || !form.goal_date) return null;
    try {
      return calculateGoals({
        currentWeight: parseFloat(form.current_weight),
        goalWeight: parseFloat(form.goal_weight),
        height: parseFloat(form.height),
        weightUnit: form.weight_unit,
        heightUnit: form.height_unit,
        gender: form.gender,
        activityLevel: form.activity_level,
        goalDate: form.goal_date,
        fitnessGoal: form.fitness_goal,
      });
    } catch { return null; }
  })();

  const applyRecommendation = () => {
    if (!goalResult) return;
    setForm(f => ({
      ...f,
      daily_calorie_goal: String(goalResult.recommendedCalories),
      protein_goal_g: String(goalResult.protein_g),
    }));
  };

  const handleSave = async () => {
    if (!profile || isSavingRef.current) return;
    isSavingRef.current = true;
    setSaving(true);
    setSaveError('');
    try {
      const { error } = await supabase.from('users').update({
        name: form.name,
        current_weight: form.current_weight ? parseFloat(form.current_weight) : null,
        goal_weight: form.goal_weight ? parseFloat(form.goal_weight) : null,
        height: form.height ? parseFloat(form.height) : null,
        weight_unit: form.weight_unit,
        height_unit: form.height_unit,
        gender: form.gender,
        goal_date: form.goal_date || null,
        fitness_goal: form.fitness_goal,
        activity_level: form.activity_level,
        daily_calorie_goal: parseInt(form.daily_calorie_goal),
        protein_goal_g: form.protein_goal_g ? parseInt(form.protein_goal_g) : null,
        dietary_restrictions: form.dietary_restrictions,
        preferred_cuisines: form.preferred_cuisines,
      }).eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setSaveError(err.message ?? 'Failed to save. Please try again.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const fitnessGoalLabel = { cutting: '🔥 Cutting', maintaining: '⚖️ Maintaining', bulking: '💪 Bulking' }[form.fitness_goal];

  return (
    <div className="pageWrapper">
      <div className="nutritionPageHero">
        <p className="nutritionPageEyebrow">Goals · Preferences · Account</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 className="nutritionPageTitle">Profile</h1>
            <p className="nutritionPageSubtitle">Manage your personal info, body stats, and nutrition targets.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btnPrimary"
            style={{ padding: '10px 28px', fontSize: 14, flexShrink: 0, marginBottom: 4 }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saveError && (
        <div style={{ background: 'rgba(255,77,0,.08)', border: '1px solid rgba(255,77,0,.2)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: '#FF7A50', marginBottom: 12 }}>
          {saveError}
        </div>
      )}

      {/* Avatar strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 'var(--rad-lg)', padding: '18px 24px' }}>
        <div className="avatarLg">{initials}</div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.01em' }}>{profile?.name || 'Your Profile'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            {form.fitness_goal && (
              <span style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-border-strong)', borderRadius: 999, padding: '3px 12px', fontSize: 12, fontWeight: 700 }}>
                {fitnessGoalLabel}
              </span>
            )}
            {form.daily_calorie_goal && (
              <span style={{ background: 'var(--surf2)', color: 'var(--txt2)', border: '1px solid var(--bdr2)', borderRadius: 999, padding: '3px 12px', fontSize: 12 }}>
                {form.daily_calorie_goal} kcal/day
              </span>
            )}
            {form.current_weight && (
              <span style={{ background: 'var(--surf2)', color: 'var(--txt2)', border: '1px solid var(--bdr2)', borderRadius: 999, padding: '3px 12px', fontSize: 12 }}>
                {form.current_weight} {form.weight_unit}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {/* LEFT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Personal Info */}
          <Section title="Personal Info" icon="👤">
            <Row label="Name">
              <Input value={form.name} onChange={v => set('name', v)} placeholder="Your name" />
            </Row>
            <Row label="Gender">
              <Select value={form.gender} onChange={v => set('gender', v)}
                options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
            </Row>
            <Row label="Units">
              <div style={{ display: 'flex', gap: 8 }}>
                <Select value={form.weight_unit} onChange={v => set('weight_unit', v)}
                  options={[{ value: 'kg', label: 'kg' }, { value: 'lbs', label: 'lbs' }]} />
                <Select value={form.height_unit} onChange={v => set('height_unit', v)}
                  options={[{ value: 'cm', label: 'cm' }, { value: 'ft', label: 'ft' }]} />
              </div>
            </Row>
          </Section>

          {/* Body Stats */}
          <Section title="Body Stats" icon="📊">
            <Row label={`Current weight (${form.weight_unit})`}>
              <Input value={form.current_weight} onChange={v => set('current_weight', v)} placeholder="e.g. 75" type="number" />
            </Row>
            <Row label={`Height (${form.height_unit})`}>
              <Input value={form.height} onChange={v => set('height', v)} placeholder={form.height_unit === 'cm' ? 'e.g. 175' : 'e.g. 5.9'} type="number" />
            </Row>
            <Row label="Activity level">
              <Select value={form.activity_level} onChange={v => set('activity_level', v)}
                options={[
                  { value: 'sedentary', label: 'Sedentary (desk job)' },
                  { value: 'light', label: 'Light (1-3x/week)' },
                  { value: 'moderate', label: 'Moderate (3-5x/week)' },
                  { value: 'active', label: 'Active (6-7x/week)' },
                ]} />
            </Row>
          </Section>

          {/* Food Preferences */}
          <Section title="Food Preferences" icon="🍽️">
            <Row label="Dietary Restrictions">
              <MultiPillSelect
                value={form.dietary_restrictions}
                onChange={v => set('dietary_restrictions', v as any)}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'vegetarian', label: 'Vegetarian' },
                  { value: 'vegan', label: 'Vegan' },
                  { value: 'no-gluten', label: 'Gluten-Free' },
                  { value: 'no-dairy', label: 'Dairy-Free' },
                  { value: 'no-nuts', label: 'Nut-Free' },
                  { value: 'halal', label: 'Halal' },
                ]}
              />
            </Row>
            <Row label="Preferred Cuisines">
              <MultiPillSelect
                value={form.preferred_cuisines}
                onChange={v => set('preferred_cuisines', v as any)}
                options={[
                  { value: 'american', label: 'American' },
                  { value: 'mexican', label: 'Mexican' },
                  { value: 'italian', label: 'Italian' },
                  { value: 'asian', label: 'Asian' },
                  { value: 'indian', label: 'Indian' },
                  { value: 'mediterranean', label: 'Mediterranean' },
                  { value: 'middle-eastern', label: 'Middle Eastern' },
                ]}
              />
            </Row>
          </Section>

          {/* Weight Goal */}
          <Section title="Weight Goal" icon="🎯">
            <Row label="Fitness goal">
              <Select value={form.fitness_goal} onChange={v => set('fitness_goal', v)}
                options={[
                  { value: 'cutting', label: '🔥 Cutting (lose fat)' },
                  { value: 'maintaining', label: '⚖️ Maintaining' },
                  { value: 'bulking', label: '💪 Bulking (gain muscle)' },
                ]} />
            </Row>
            <Row label={`Goal weight (${form.weight_unit})`}>
              <Input value={form.goal_weight} onChange={v => set('goal_weight', v)} placeholder="e.g. 68" type="number" />
            </Row>
            <Row label="Target date">
              <Input value={form.goal_date} onChange={v => set('goal_date', v)} type="date" />
            </Row>
          </Section>
        </div>

        {/* RIGHT column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Nutrition Targets */}
          <Section title="Nutrition Targets" icon="🥗">
            <Row label="Daily calorie goal">
              <Input value={form.daily_calorie_goal} onChange={v => set('daily_calorie_goal', v)} placeholder="e.g. 2200" type="number" />
            </Row>
            <Row label="Daily protein goal (g)">
              <Input value={form.protein_goal_g} onChange={v => set('protein_goal_g', v)} placeholder="e.g. 150" type="number" />
            </Row>
            <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5, marginTop: 4, padding: '10px 14px', background: 'var(--surf2)', borderRadius: 10 }}>
              💡 Leave protein goal blank to auto-calculate based on your weight and fitness goal.
            </div>
          </Section>

          {/* AI Recommendation */}
          {goalResult && (
            <div className="card animate-fade-in" style={{ padding: 22, border: '1px solid var(--accent-border-strong)', background: 'linear-gradient(135deg, var(--accent-bg) 0%, transparent 60%)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>✦</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>AI Recommended Targets</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'BMR', value: `${goalResult.bmr} kcal`, desc: 'Calories at rest' },
                  { label: 'TDEE', value: `${goalResult.tdee} kcal`, desc: 'Total daily burn' },
                  { label: 'Target', value: `${goalResult.recommendedCalories} kcal`, desc: 'To hit your goal' },
                  { label: 'Pace', value: formatWeightChange(goalResult.weeklyChange, form.weight_unit), desc: `~${goalResult.weeksToGoal} wks to goal` },
                ].map(({ label, value, desc }) => (
                  <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontSize: 17, fontWeight: 850, color: 'var(--text-primary)', margin: '4px 0' }}>{value}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{desc}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[
                  { label: 'Protein', value: `${goalResult.protein_g}g`, color: '#3b82f6' },
                  { label: 'Carbs', value: `${goalResult.carbs_g}g`, color: '#f59e0b' },
                  { label: 'Fat', value: `${goalResult.fat_g}g`, color: '#f97316' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 12, padding: '10px 8px', textAlign: 'center', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {goalResult.isAggressive && (
                <div className="calloutWarn" style={{ marginBottom: 12 }}>
                  Your timeline is aggressive. Consider extending your goal date for a safer pace.
                </div>
              )}

              <button onClick={applyRecommendation} className="btn btnPrimary" style={{ width: '100%', padding: 12 }}>
                Apply these targets
              </button>
            </div>
          )}

          {/* Empty state when no recommendation yet */}
          {!goalResult && (
            <div className="card" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🎯</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Get AI Targets</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6 }}>
                Fill in your current weight, height, goal weight, and target date to get personalized calorie and macro recommendations.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 750, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="formRow">
      <label className="formLabel">{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: 'var(--field-bg)', border: '1px solid var(--field-border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none' }}
    />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: 'var(--field-bg)', border: '1px solid var(--field-border)', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer' }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MultiPillSelect({ options, value, onChange }: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    // If 'none' is selected, clear everything else
    if (val === 'none') return onChange(['none']);
    
    let next = value.includes(val) ? value.filter(v => v !== val) : [...value, val];
    // Clear 'none' if something else is selected
    if (val !== 'none') next = next.filter(v => v !== 'none');
    
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(o => {
        const active = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            style={{
              background: active ? 'var(--accent-bg)' : 'var(--surf2)',
              color: active ? 'var(--accent)' : 'var(--txt2)',
              border: `1px solid ${active ? 'var(--accent-border-strong)' : 'var(--bdr2)'}`,
              borderRadius: 999, padding: '5px 12px', fontSize: 12.5, fontWeight: active ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
