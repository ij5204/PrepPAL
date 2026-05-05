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

function calcGoals(profile: any): { protein: number; carbs: number; fat: number } {
  const calGoal: number = profile.daily_calorie_goal;
  const fitnessGoal: string = (profile.fitness_goal ?? 'maintaining').toLowerCase();

  // If user explicitly set a protein goal, honour it
  const explicitProtein: number | null = profile.protein_goal_g ?? null;

  // Convert stored weight to lbs
  const weightLbs: number | null = (() => {
    const w = profile.current_weight;
    if (!w) return null;
    return profile.weight_unit === 'kg' ? w * 2.20462 : w;
  })();

  // ── Step 1: Protein ────────────────────────────────────────────────────────
  let protein: number;
  if (explicitProtein != null) {
    protein = explicitProtein;
  } else if (weightLbs) {
    if (fitnessGoal === 'cutting')      protein = Math.round(weightLbs * 0.9);
    else if (fitnessGoal === 'bulking') protein = Math.round(weightLbs * 0.8);
    else                                protein = Math.round(weightLbs * 0.75);
  } else {
    // No weight on file — use percentage of calories as fallback
    const pct = fitnessGoal === 'cutting' ? 0.30 : 0.25;
    protein = Math.round((calGoal * pct) / 4);
  }

  // ── Step 2: Fat ────────────────────────────────────────────────────────────
  let fat: number;
  if (weightLbs) {
    if (fitnessGoal === 'cutting')      fat = Math.round(weightLbs * 0.35);
    else if (fitnessGoal === 'bulking') fat = Math.round(weightLbs * 0.40);
    else                                fat = Math.round(weightLbs * 0.35);
  } else {
    const fatPct = fitnessGoal === 'cutting' ? 0.20 : 0.25;
    fat = Math.round((calGoal * fatPct) / 9);
  }

  // ── Step 3: Carbs fill the remaining budget ────────────────────────────────
  const carbs = Math.max(0, Math.round((calGoal - protein * 4 - fat * 9) / 4));

  return { protein, carbs, fat };
}


/* ── Page ─────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [weekData, setWeekData] = useState<{ day: string; pct: number }[]>([]);
  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [pantryCount, setPantryCount] = useState<number | null>(null);

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

    // Fetch pantry items expiring within 14 days
    const in14Days = new Date(today);
    in14Days.setDate(in14Days.getDate() + 14);
    supabase.from('pantry_items')
      .select('id, name, quantity, unit, category, expiry_date')
      .lte('expiry_date', in14Days.toISOString().split('T')[0])
      .gte('expiry_date', today.toISOString().split('T')[0])
      .order('expiry_date')
      .limit(6)
      .then(({ data }) => {
        const rows = (data ?? []).map((item: any) => {
          const expDate = new Date(item.expiry_date + 'T00:00:00');
          const diffDays = Math.round((expDate.getTime() - today.getTime()) / 86400000);
          const CATEGORY_LABELS: Record<string, string> = {
            produce: 'Produce', dairy: 'Dairy', protein: 'Protein',
            pantry: 'Pantry', spice: 'Spice', other: 'Other',
          };
          const cat = `${CATEGORY_LABELS[item.category] ?? 'Other'} · ${item.quantity} ${item.unit}`;
          let dotColor = 'var(--acc)'; let pillCls = 'pillG'; let label = `${diffDays} days`;
          if (diffDays === 0) { dotColor = 'var(--acc2)'; pillCls = 'pillR'; label = 'Today'; }
          else if (diffDays <= 3) { dotColor = '#FFA020'; pillCls = 'pillO'; }
          return { name: item.name, cat, dotColor, pillCls, label };
        });
        setExpiryItems(rows);
      });

    // Total pantry item count
    supabase.from('pantry_items').select('*', { count: 'exact', head: true })
      .then(({ count }) => setPantryCount(count ?? 0));
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
          <div className="kpiVal">
            {pantryCount === null ? '—' : pantryCount.toLocaleString()}
            <span className="kpiUnit"> items</span>
          </div>
          <div className="kpiDelta" style={{ color: 'var(--txt2)' }}>in your pantry</div>
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
            {expiryItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 13, color: 'var(--txt2)' }}>
                🎉 No items expiring in the next 2 weeks!
              </div>
            ) : (
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
            )}
          </div>

          {/* AI meals ready accent card */}
          <div className="card accentCard">
            <div className="cardHd">
              <div className="cardTitle" style={{ color: 'var(--acc)' }}>⚡ AI Meals Ready</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.65, marginBottom: 14 }}>
              {expiryItems.filter(i => i.pillCls === 'pillR').length > 0
                ? `${expiryItems.filter(i => i.pillCls === 'pillR').map(i => i.name).join(', ')} expire${expiryItems.filter(i => i.pillCls === 'pillR').length === 1 ? 's' : ''} today — use ${expiryItems.filter(i => i.pillCls === 'pillR').length === 1 ? 'it' : 'them'} before it's wasted.`
                : pantryCount && pantryCount > 0
                  ? `${pantryCount} pantry item${pantryCount > 1 ? 's' : ''} available. Generate meal ideas from your pantry.`
                  : 'Add items to your pantry to get AI-powered meal suggestions.'}
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
