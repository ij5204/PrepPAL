import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function Ring({ value, max, color, size = 96, stroke = 9 }: {
  value: number; max: number; color: string; size?: number; stroke?: number;
}) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / (max || 1), 1);
  const fill = pct * circ;
  const gap = circ - fill;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(120,120,128,0.12)" strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fill} ${gap}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.7s cubic-bezier(0.4,0,0.2,1)' }}
        />
      )}
    </svg>
  );
}

function MacroCard({ label, value, goal, unit, color }: {
  label: string; value: number; goal: number; unit: string; color: string;
}) {
  const pct = Math.round(Math.min(value / (goal || 1), 1) * 100);
  return (
    <div className="macroCard animate-fade-in">
      <div style={{ fontSize: 10.5, fontWeight: 750, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ position: 'relative', width: 88, height: 88, marginBottom: 12 }}>
        <Ring value={value} max={goal} color={color} size={88} stroke={8} />
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 0,
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
          <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 600, marginTop: 2 }}>{pct}%</div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
        of <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{goal}</span> {unit}
      </div>
    </div>
  );
}

function calcMacroGoals(profile: any) {
  const protein = profile.protein_goal_g ?? Math.round((profile.daily_calorie_goal * 0.25) / 4);
  const proteinCals = protein * 4;
  const remaining = profile.daily_calorie_goal - proteinCals;
  const carbs = Math.round((remaining * 0.55) / 4);
  const fat = Math.round((remaining * 0.45) / 9);
  return { protein, carbs, fat };
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getMotivation(pct: number, isOver: boolean) {
  if (isOver) return 'Goal reached today 🎉';
  if (pct === 0) return 'Start your day strong 💪';
  if (pct < 0.4) return 'Off to a great start';
  if (pct < 0.75) return "You're on track";
  return 'Almost there — keep going!';
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

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: 'var(--text-muted)' }}>
      <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
      Loading…
    </div>
  );

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
      {/* Greeting */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          {getGreeting()}, {profile.name?.split(' ')[0] ?? 'there'} 👋
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <span style={{
            background: isOver ? 'rgba(34,197,94,0.12)' : 'var(--accent-bg)',
            color: isOver ? 'var(--success)' : 'var(--accent)',
            border: `1px solid ${isOver ? 'rgba(34,197,94,0.24)' : 'var(--accent-border-strong)'}`,
            borderRadius: 999,
            padding: '3px 12px',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {getMotivation(calPct, isOver)}
          </span>
        </div>
      </div>

      {/* Macro rings */}
      <div className="macroGrid">
        <MacroCard label="Calories" value={consumed.calories} goal={profile.daily_calorie_goal} unit="kcal" color={isOver ? '#ef4444' : 'var(--accent)'} />
        <MacroCard label="Protein" value={Math.round(consumed.protein)} goal={goals.protein} unit="g" color="#3b82f6" />
        <MacroCard label="Carbs" value={Math.round(consumed.carbs)} goal={goals.carbs} unit="g" color="#f59e0b" />
        <MacroCard label="Fat" value={Math.round(consumed.fat)} goal={goals.fat} unit="g" color="#f97316" />
      </div>

      {/* Calorie progress bar */}
      <div className="card cardPad" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>Daily Calories</span>
          <div style={{ display: 'flex', align: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: isOver ? '#ef4444' : 'var(--accent)' }}>{consumed.calories}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ {profile.daily_calorie_goal} kcal</span>
          </div>
        </div>
        <div style={{ height: 10, background: 'rgba(120,120,128,0.10)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            borderRadius: 999,
            background: isOver
              ? 'linear-gradient(90deg, #f97316, #ef4444)'
              : `linear-gradient(90deg, var(--accent), #8b5cf6)`,
            width: `${calPct * 100}%`,
            transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>0</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{Math.round(calPct * 100)}% of daily goal</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{profile.daily_calorie_goal}</span>
        </div>
      </div>

      {/* Weekly chart */}
      <div className="card cardPad" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)', marginBottom: 18 }}>This Week</div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weekData} barSize={26}>
            <XAxis dataKey="day" tick={{ fill: 'rgba(60,60,67,0.52)', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'rgba(99,102,241,0.06)', radius: 8 }}
              contentStyle={{
                background: 'var(--surface-solid)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                color: 'var(--text-primary)',
                fontSize: 13,
                boxShadow: 'var(--shadow-lg)',
              }}
              formatter={(val: number) => [`${val} kcal`, 'Calories']}
            />
            <Bar dataKey="calories" radius={[7, 7, 0, 0]}>
              {weekData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={i === weekData.length - 1
                    ? 'url(#barGrad)'
                    : 'rgba(148,163,184,0.18)'}
                />
              ))}
            </Bar>
            <defs>
              <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Today's meals */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: todayLogs.length ? '1px solid var(--border)' : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>Today's Meals</span>
            <span style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text-muted)',
              background: 'var(--field-bg)',
              border: '1px solid var(--border)',
              borderRadius: 999,
              padding: '2px 10px',
            }}>
              {todayLogs.length} logged
            </span>
          </div>
        </div>

        {todayLogs.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🍽️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>No meals logged yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Head to Meals to get AI-powered suggestions</div>
          </div>
        ) : (
          todayLogs.map((m: any, i) => (
            <div key={m.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '14px 20px',
              borderBottom: i < todayLogs.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)' }}>{m.meal_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(m.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' · '}P {Math.round(m.protein_g)}g · C {Math.round(m.carbs_g)}g · F {Math.round(m.fat_g)}g
                </div>
              </div>
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--accent)',
                background: 'var(--accent-bg)',
                border: '1px solid var(--accent-border-strong)',
                borderRadius: 10,
                padding: '4px 12px',
              }}>
                {m.calories} kcal
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
