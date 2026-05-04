import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function calcMacroGoals(profile: any) {
  const protein = profile.protein_goal_g ?? Math.round((profile.daily_calorie_goal * 0.25) / 4);
  const proteinCals = protein * 4;
  const remaining = profile.daily_calorie_goal - proteinCals;
  const carbs = Math.round((remaining * 0.55) / 4);
  const fat = Math.round((remaining * 0.45) / 9);
  return { protein, carbs, fat };
}

export function DashboardPage() {
  const { profile } = useAuthStore();
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [weekData, setWeekData] = useState<any[]>([]);

  useEffect(() => {
    if (!profile) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase.from('meal_logs').select('*')
      .gte('eaten_at', today.toISOString())
      .then(({ data }) => setTodayLogs(data ?? []));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d;
    });

    Promise.all(days.map(d => {
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      return supabase.from('meal_logs').select('calories')
        .gte('eaten_at', start.toISOString())
        .lte('eaten_at', end.toISOString())
        .then(({ data }) => ({
          day: d.toLocaleDateString('en-US', { weekday: 'short' }),
          calories: (data ?? []).reduce((s: number, m: any) => s + m.calories, 0),
        }));
    })).then(setWeekData);
  }, [profile]);

  if (!profile) return <p style={{ color: '#9ca3af', padding: 24 }}>Loading…</p>;

  const consumed = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  todayLogs.forEach((m: any) => {
    consumed.calories += m.calories;
    consumed.protein += Number(m.protein_g);
    consumed.carbs += Number(m.carbs_g);
    consumed.fat += Number(m.fat_g);
  });

  const goals = calcMacroGoals(profile);
  const calPct = Math.min(consumed.calories / profile.daily_calorie_goal, 1);
  const isOver = consumed.calories > profile.daily_calorie_goal;

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', marginBottom: 4 }}>
        Dashboard
      </h1>
      <p style={{ color: 'rgba(148,163,184,0.9)', marginBottom: 28, fontSize: 14 }}>
        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Calories', value: consumed.calories, goal: profile.daily_calorie_goal, unit: 'kcal', color: isOver ? '#ef4444' : '#a5b4fc' },
          { label: 'Protein', value: Math.round(consumed.protein), goal: goals.protein, unit: 'g', color: '#3b82f6' },
          { label: 'Carbs', value: Math.round(consumed.carbs), goal: goals.carbs, unit: 'g', color: '#f59e0b' },
          { label: 'Fat', value: Math.round(consumed.fat), goal: goals.fat, unit: 'g', color: '#f97316' },
        ].map(({ label, value, goal, unit, color }) => (
          <div key={label} style={{ background: 'rgba(15, 23, 42, 0.72)', borderRadius: 16, padding: 16, border: '1px solid rgba(148,163,184,0.14)', boxShadow: '0 10px 30px rgba(0,0,0,0.30)' }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>of {goal} {unit}</div>
            <div style={{ height: 5, background: 'rgba(148,163,184,0.14)', borderRadius: 999, marginTop: 10 }}>
              <div style={{ height: '100%', borderRadius: 2, background: color, width: `${Math.min(value / goal, 1) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Calorie bar */}
      <div style={{ background: 'rgba(15, 23, 42, 0.72)', borderRadius: 16, padding: 20, border: '1px solid rgba(148,163,184,0.14)', marginBottom: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.30)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb' }}>Daily Calories</span>
          <span style={{ fontSize: 14, color: '#9ca3af' }}>{consumed.calories} / {profile.daily_calorie_goal} kcal</span>
        </div>
        <div style={{ height: 12, background: 'rgba(148,163,184,0.14)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 999, background: isOver ? '#ef4444' : '#a5b4fc', width: `${calPct * 100}%`, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Weekly chart */}
      <div style={{ background: 'rgba(15, 23, 42, 0.72)', borderRadius: 16, padding: 20, border: '1px solid rgba(148,163,184,0.14)', marginBottom: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.30)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb', marginBottom: 16 }}>This Week</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekData} barSize={28}>
            <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 12, color: '#f8fafc' }} />
            <Bar dataKey="calories" radius={[6, 6, 0, 0]}>
              {weekData.map((_, i) => (
                <Cell key={i} fill={i === weekData.length - 1 ? '#a5b4fc' : 'rgba(148,163,184,0.22)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Today's meals */}
      <div style={{ background: 'rgba(15, 23, 42, 0.72)', borderRadius: 16, padding: 20, border: '1px solid rgba(148,163,184,0.14)', boxShadow: '0 10px 30px rgba(0,0,0,0.30)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f9fafb', marginBottom: 12 }}>Today's Meals</div>
        {todayLogs.length === 0
          ? <p style={{ color: '#6b7280', fontSize: 14 }}>No meals logged yet today.</p>
          : todayLogs.map((m: any) => (
            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(148,163,184,0.12)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{m.meal_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {new Date(m.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 750, color: '#a5b4fc' }}>{m.calories} kcal</div>
            </div>
          ))}
      </div>
    </div>
  );
}