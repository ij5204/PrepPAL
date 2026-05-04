import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';

/* ── Calorie ring ─────────────────────────────────────────────────────────── */

function CalorieRing({ value, max }: { value: number; max: number }) {
  const r = 48;
  const circ = 2 * Math.PI * r; // 301.6
  const pct = Math.min(value / (max || 1), 1);
  const offset = circ - pct * circ;
  const color = pct >= 1 ? 'var(--acc2)' : 'var(--acc)';

  return (
    <div className="ringWrap" style={{ width: 120, height: 120 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--surf3)" strokeWidth="10" transform="rotate(-90 60 60)" />
        <circle
          cx="60" cy="60" r={r}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          transform="rotate(-90 60 60)"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .7s ease, stroke .3s' }}
        />
      </svg>
      <div className="ringCenter">
        <div className="ringNum">{value.toLocaleString()}</div>
        <div className="ringLbl">kcal</div>
        <div className="ringGoal">of {max.toLocaleString()}</div>
      </div>
    </div>
  );
}

/* ── MacroBar ─────────────────────────────────────────────────────────────── */

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(value / (goal || 1), 1) * 100;
  return (
    <div>
      <div className="macroHd">
        <span className="macroName">{label}</span>
        <span className="macroVal">{Math.round(value)}g / {goal}g</span>
      </div>
      <div className="barTrack">
        <div className="barFill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Greeting ─────────────────────────────────────────────────────────────── */

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function calcGoals(profile: any) {
  const protein = profile.protein_goal_g ?? Math.round((profile.daily_calorie_goal * 0.25) / 4);
  const carbs = Math.round(((profile.daily_calorie_goal - protein * 4) * 0.55) / 4);
  const fat = Math.round(((profile.daily_calorie_goal - protein * 4) * 0.45) / 9);
  return { protein, carbs, fat };
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [weekData, setWeekData] = useState<{ day: string; pct: number }[]>([]);

  useEffect(() => {
    if (!profile) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    supabase.from('meal_logs').select('*').gte('eaten_at', today.toISOString())
      .then(({ data }) => setTodayLogs(data ?? []));

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d;
    });
    Promise.all(days.map(d => {
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      return supabase.from('meal_logs').select('calories')
        .gte('eaten_at', s.toISOString()).lte('eaten_at', e.toISOString())
        .then(({ data }) => ({
          day: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
          pct: Math.min(((data ?? []).reduce((s: number, m: any) => s + m.calories, 0)) / (profile.daily_calorie_goal || 1), 1),
        }));
    })).then(setWeekData);
  }, [profile]);

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 32, color: 'var(--txt2)' }}>
      <div className="animate-spin" style={{ width: 20, height: 20, border: '2px solid var(--surf3)', borderTopColor: 'var(--acc)', borderRadius: '50%' }} />
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

  const goals = calcGoals(profile);
  const calGoal = profile.daily_calorie_goal;
  const remaining = Math.max(calGoal - consumed.calories, 0);
  const proteinPct = Math.round(Math.min(consumed.protein / (goals.protein || 1), 1) * 100);

  // Expiry items — placeholder until pantry data is wired in
  const expiryItems = [
    { name: 'Chicken Breast', cat: 'Protein · 350g', dotColor: 'var(--acc2)', pillCls: 'pillR', label: 'Today' },
    { name: 'Spinach', cat: 'Produce · 1 bag', dotColor: '#FFA020', pillCls: 'pillO', label: '2 days' },
    { name: 'Greek Yogurt', cat: 'Dairy · 500g', dotColor: '#FFA020', pillCls: 'pillO', label: '3 days' },
    { name: 'Eggs', cat: 'Protein · 8 pcs', dotColor: 'var(--acc)', pillCls: 'pillG', label: '12 days' },
  ];

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="pageWrapper">
      {/* Header */}
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{getGreeting()}, {profile.name?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="pageSub">{dateStr} · {profile.fitness_goal ?? 'Bulking'} · {calGoal.toLocaleString()} kcal goal</p>
        </div>
        <div className="rangeTabs">
          <div className="rangeTab active">Today</div>
          <div className="rangeTab">Week</div>
          <div className="rangeTab">Month</div>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpiRow">
        <div className="kpi">
          <div className="kpiLabel">Consumed</div>
          <div className="kpiVal">{consumed.calories.toLocaleString()} <span className="kpiUnit">kcal</span></div>
          <div className="kpiDelta up">▲ {Math.round((consumed.calories / calGoal) * 100)}% of goal</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Remaining</div>
          <div className="kpiVal">{remaining.toLocaleString()} <span className="kpiUnit">kcal</span></div>
          <div className="kpiDelta" style={{ color: 'var(--txt2)' }}>~{Math.round(remaining / 500)} more meals</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Protein</div>
          <div className="kpiVal">{Math.round(consumed.protein)} <span className="kpiUnit">g</span></div>
          <div className="kpiDelta up">▲ {proteinPct}% of {goals.protein}g</div>
        </div>
        <div className="kpi">
          <div className="kpiLabel">Pantry Items</div>
          <div className="kpiVal">— <span className="kpiUnit">items</span></div>
          <div className="kpiDelta dn">▼ check pantry</div>
        </div>
      </div>

      {/* Two-column main content */}
      <div className="twoCol">
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Daily Nutrition card */}
          <div className="card">
            <div className="cardHd">
              <div className="cardTitle">Daily Nutrition</div>
              <div className="cardLink" onClick={() => navigate('/meals')}>+ log meal</div>
            </div>
            <div className="ringSection">
              <CalorieRing value={consumed.calories} max={calGoal} />
              <div className="macroList">
                <MacroBar label="Protein" value={consumed.protein} goal={goals.protein} color="var(--acc)" />
                <MacroBar label="Carbohydrates" value={consumed.carbs} goal={goals.carbs} color="var(--acc3)" />
                <MacroBar label="Fat" value={consumed.fat} goal={goals.fat} color="var(--acc2)" />

                {/* Week bars mini chart */}
                <div className="weekBars">
                  {weekData.map((d, i) => (
                    <div className="wday" key={i}>
                      <div className="wdayBar" style={{
                        height: `${Math.max(d.pct * 100, 8)}%`,
                        background: i === weekData.length - 1 ? 'rgba(200,255,0,.4)' : 'var(--surf3)',
                      }} />
                      <div className="wdayLbl" style={{ color: i === weekData.length - 1 ? 'var(--acc)' : undefined }}>
                        {d.day[0]}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Today's meals card */}
          <div className="card">
            <div className="cardHd">
              <div className="cardTitle">Today's Meals</div>
              <div className="cardLink" onClick={() => navigate('/meals')}>get suggestions →</div>
            </div>
            {todayLogs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
                <div style={{ fontSize: 13, color: 'var(--txt2)' }}>No meals logged yet. Head to Meals for AI suggestions.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {todayLogs.map((m: any) => (
                  <div className="mealRow" key={m.id} onClick={() => navigate('/meals')}>
                    <div className="mealIcon">🍽️</div>
                    <div className="mealInfo">
                      <div className="mealNm">{m.meal_name}</div>
                      <div className="mealTm">
                        {new Date(m.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · AI suggestion
                      </div>
                    </div>
                    <div className="mealMacrosMini">
                      <div className="mMini">P <span>{Math.round(m.protein_g)}g</span></div>
                      <div className="mMini">C <span>{Math.round(m.carbs_g)}g</span></div>
                      <div className="mMini">F <span>{Math.round(m.fat_g)}g</span></div>
                    </div>
                    <div className="mealKcal">{m.calories}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Expiring soon */}
          <div className="card">
            <div className="cardHd">
              <div className="cardTitle">Expiring Soon</div>
              <div className="cardLink" onClick={() => navigate('/pantry')}>view pantry</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {expiryItems.map((item, i) => (
                <div className="expRow" key={i}>
                  <div className="expDot" style={{ background: item.dotColor }} />
                  <div style={{ flex: 1 }}>
                    <div className="expName">{item.name}</div>
                    <div className="expCat">{item.cat}</div>
                  </div>
                  <div className={`expPill ${item.pillCls}`}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* AI meals ready accent card */}
          <div className="card accentCard">
            <div className="cardHd">
              <div className="cardTitle" style={{ color: 'var(--acc)' }}>⚡ AI Meals Ready</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.65, marginBottom: 14 }}>
              3 suggestions generated from your pantry. Chicken breast expires today — use it now before it's wasted.
            </div>
            <button className="tbBtn" style={{ width: '100%', padding: 11 }} onClick={() => navigate('/meals')}>
              VIEW SUGGESTIONS →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
