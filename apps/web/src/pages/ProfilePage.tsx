import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { calculateGoals, formatWeightChange } from '../lib/goalCalc';
import type { WeightUnit, HeightUnit } from '../lib/goalCalc';

export function ProfilePage() {
  const { profile, refreshProfile } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
    });
  }, [profile]);

  // Live goal calculation
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
    if (!profile) return;
    setSaving(true);
    await supabase.from('users').update({
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
    }).eq('id', profile.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', marginBottom: 4 }}>Profile</h1>
      <p style={{ color: '#9ca3af', marginBottom: 32, fontSize: 14 }}>Your personal details and goals</p>

      {/* Personal Info */}
      <Section title="Personal Info">
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
      <Section title="Body Stats">
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

      {/* Weight Goal */}
      <Section title="Weight Goal">
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

      {/* AI Recommendation */}
      {goalResult && (
        <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e', marginBottom: 16 }}>
            📊 Your personalised recommendation
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'BMR', value: `${goalResult.bmr} kcal`, desc: 'Calories at rest' },
              { label: 'TDEE', value: `${goalResult.tdee} kcal`, desc: 'Total daily burn' },
              { label: 'Target calories', value: `${goalResult.recommendedCalories} kcal`, desc: 'To hit your goal' },
              { label: 'Pace', value: formatWeightChange(goalResult.weeklyChange, form.weight_unit), desc: `~${goalResult.weeksToGoal} weeks to goal` },
            ].map(({ label, value, desc }) => (
              <div key={label} style={{ background: '#0f1117', borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', margin: '4px 0' }}>{value}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { label: 'Protein', value: `${goalResult.protein_g}g`, color: '#3b82f6' },
              { label: 'Carbs', value: `${goalResult.carbs_g}g`, color: '#f59e0b' },
              { label: 'Fat', value: `${goalResult.fat_g}g`, color: '#f97316' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ flex: 1, background: '#0f1117', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color }}>{value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {goalResult.isAggressive && (
            <div style={{ background: '#422006', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13, color: '#fbbf24' }}>
              ⚠️ Your timeline is aggressive. Consider extending your goal date for a safer pace.
            </div>
          )}

          <button onClick={applyRecommendation} style={{
            width: '100%', background: '#22c55e', color: '#0f1117',
            border: 'none', borderRadius: 10, padding: '11px', fontSize: 14,
            fontWeight: 700, cursor: 'pointer',
          }}>
            Apply these targets to my account
          </button>
        </div>
      )}

      {/* Nutrition Targets */}
      <Section title="Nutrition Targets">
        <Row label="Daily calorie goal">
          <Input value={form.daily_calorie_goal} onChange={v => set('daily_calorie_goal', v)} placeholder="e.g. 2200" type="number" />
        </Row>
        <Row label="Daily protein goal (g)">
          <Input value={form.protein_goal_g} onChange={v => set('protein_goal_g', v)} placeholder="e.g. 150" type="number" />
        </Row>
      </Section>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} style={{
        width: '100%', background: saved ? '#166534' : '#22c55e',
        color: '#0f1117', border: 'none', borderRadius: 14,
        padding: '15px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
        transition: 'background 0.2s',
      }}>
        {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#1a1f2e', borderRadius: 14, border: '1px solid #1f2937', padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 16 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <label style={{ fontSize: 14, color: '#9ca3af', fontWeight: 500, minWidth: 180 }}>{label}</label>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#f9fafb', outline: 'none' }} />
  );
}

function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 10, padding: '10px 14px', fontSize: 14, color: '#f9fafb', outline: 'none', cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}