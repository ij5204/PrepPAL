import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Sparkles, Utensils, Coffee, Sun, Moon, TrendingUp, Clock, Plus } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';

// ── Streak calculation ─────────────────────────────────────────────────────────

function calcStreak(datestamps: string[]): number {
  if (!datestamps.length) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const unique = [...new Set(datestamps)].sort().reverse();
  // streak starts from today if logged today, otherwise from yesterday
  let anchor = new Date(today);
  if (unique[0] !== todayStr) anchor = new Date(today.getTime() - 86400000);
  let count = 0;
  for (const d of unique) {
    const expected = anchor.toISOString().split('T')[0];
    if (d === expected) {
      count++;
      anchor = new Date(anchor.getTime() - 86400000);
    } else if (d < expected) {
      break;
    }
  }
  return count;
}

// ── Greeting ───────────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night,';
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function calcGoals(profile: any) {
  const calGoal: number = profile.daily_calorie_goal;
  const fitnessGoal: string = (profile.fitness_goal ?? 'maintaining').toLowerCase();
  const weightLbs: number | null = (() => {
    const w = profile.current_weight;
    if (!w) return null;
    return profile.weight_unit === 'kg' ? w * 2.20462 : w;
  })();
  let protein: number;
  if (profile.protein_goal_g != null) {
    protein = profile.protein_goal_g;
  } else if (weightLbs) {
    protein = Math.round(weightLbs * (fitnessGoal === 'cutting' ? 0.9 : fitnessGoal === 'bulking' ? 0.8 : 0.75));
  } else {
    protein = Math.round((calGoal * (fitnessGoal === 'cutting' ? 0.30 : 0.25)) / 4);
  }
  const fat = weightLbs
    ? Math.round(weightLbs * (fitnessGoal === 'bulking' ? 0.40 : 0.35))
    : Math.round((calGoal * (fitnessGoal === 'cutting' ? 0.20 : 0.25)) / 9);
  const carbs = Math.max(0, Math.round((calGoal - protein * 4 - fat * 9) / 4));
  return { protein, carbs, fat };
}

function getMealSlot(dateStr: string): 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' {
  const h = new Date(dateStr).getHours();
  if (h >= 5  && h < 11) return 'Breakfast';
  if (h >= 11 && h < 16) return 'Lunch';
  if (h >= 16 && h < 23) return 'Dinner';
  return 'Snack';
}

const SLOT_CONFIG: Record<string, { color: string; icon: typeof Coffee }> = {
  Breakfast: { color: '#f59e0b', icon: Coffee },
  Lunch:     { color: '#3b82f6', icon: Sun },
  Dinner:    { color: '#8b5cf6', icon: Moon },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function CalorieRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 76;
  const circ = 2 * Math.PI * r;
  const pct = Math.min((total - remaining) / (total || 1), 1);
  const offset = circ - pct * circ;
  const color = pct >= 1 ? '#ef4444' : 'var(--acc)';

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: 192, height: 192 }}>
      <svg width="192" height="192" viewBox="0 0 192 192">
        <circle cx="96" cy="96" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
        <circle
          cx="96" cy="96" r={r} fill="none" stroke={color}
          strokeWidth="12" strokeLinecap="round"
          transform="rotate(-90 96 96)"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .8s ease, stroke .3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 38, lineHeight: 1, color: 'var(--txt)', letterSpacing: 0 }}>
          {remaining.toLocaleString()}
        </div>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--txt2)', marginTop: 6, fontWeight: 600 }}>
          kcal left
        </div>
      </div>
    </div>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(value / (goal || 1), 1) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--txt2)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
          <span style={{ color, fontWeight: 700 }}>{Math.round(value)}g</span>
          <span style={{ color: 'var(--txt3)' }}> / {goal}g</span>
        </span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .7s cubic-bezier(.4,0,.2,1)' }} />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [streak, setStreak] = useState(0);
  const fetchingRef = useRef(false);

  const fetchDashboard = useCallback(async (currentProfile: any) => {
    if (!currentProfile || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const { session } = useAuthStore.getState();
      if (!session) throw new Error('Session expired');

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in14Days = new Date(today); in14Days.setDate(in14Days.getDate() + 14);
      const yearAgo = new Date(today); yearAgo.setFullYear(yearAgo.getFullYear() - 1);

      const [logsRes, expiryRes, streakRes] = await Promise.all([
        supabase.from('meal_logs').select('*').gte('eaten_at', today.toISOString()),
        supabase.from('pantry_items')
          .select('id, name, category, expiry_date')
          .lte('expiry_date', in14Days.toISOString().split('T')[0])
          .gte('expiry_date', today.toISOString().split('T')[0])
          .order('expiry_date').limit(4),
        supabase.from('meal_logs')
          .select('eaten_at')
          .gte('eaten_at', yearAgo.toISOString()),
      ]);

      setTodayLogs(logsRes.data ?? []);

      const rows = (expiryRes.data ?? []).map((item: any) => {
        const expDate = new Date(item.expiry_date + 'T00:00:00');
        const diffDays = Math.round((expDate.getTime() - today.getTime()) / 86400000);
        let pillCls = 'pillG'; let label = `${diffDays}d`;
        if (diffDays === 0) { pillCls = 'pillR'; label = 'Today'; }
        else if (diffDays <= 3) { pillCls = 'pillO'; }
        return { name: item.name, pillCls, label };
      });
      setExpiryItems(rows);

      const dates = (streakRes.data ?? []).map((r: any) => r.eaten_at.split('T')[0]);
      setStreak(calcStreak(dates));
    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (profile) fetchDashboard(profile);
  }, [profile, fetchDashboard]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { if (profile) fetchDashboard(profile); }, 1500);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); if (timer) clearTimeout(timer); };
  }, [profile, fetchDashboard]);

  if (!profile) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 40, color: 'var(--txt2)' }}>
      <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      <span style={{ fontSize: 14 }}>Loading…</span>
    </div>
  );

  const consumed = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  todayLogs.forEach((m: any) => {
    consumed.calories += m.calories;
    consumed.protein  += Number(m.protein_g);
    consumed.carbs    += Number(m.carbs_g);
    consumed.fat      += Number(m.fat_g);
  });

  const goals   = calcGoals(profile);
  const calGoal = profile.daily_calorie_goal;
  const remaining = Math.max(calGoal - consumed.calories, 0);
  const pctDone   = Math.min(consumed.calories / (calGoal || 1), 1);

  const calStatus  = pctDone >= 1 ? 'Target Reached' : pctDone >= 0.75 ? 'Almost There' : pctDone >= 0.40 ? 'On Track' : pctDone >= 0.10 ? 'In Progress' : 'Not Started';
  const calMessage = pctDone >= 1
    ? `You've hit your ${calGoal.toLocaleString()} kcal target for today.`
    : pctDone >= 0.75
    ? `${remaining.toLocaleString()} kcal remaining. Almost there.`
    : pctDone >= 0.40
    ? `${remaining.toLocaleString()} kcal left in your daily budget.`
    : `Start logging meals to track today's intake.`;

  const SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const;
  const slotMap: Record<string, any | null> = { Breakfast: null, Lunch: null, Dinner: null };
  todayLogs.forEach(m => {
    const slot = getMealSlot(m.eaten_at);
    if (slot in slotMap && slotMap[slot] === null) slotMap[slot] = m;
  });
  const extraMeals = todayLogs.filter(m => {
    const slot = getMealSlot(m.eaten_at);
    return !(slot in slotMap) || slotMap[slot]?.id !== m.id;
  });

  const firstName = profile.name?.split(' ')[0] ?? 'there';

  return (
    <div className="pageWrapper" style={{ gap: 20, paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--txt)', lineHeight: 1.2 }}>
            {getGreeting()} {firstName}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {streak > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              background: 'rgba(249,115,22,0.10)',
              border: '1px solid rgba(249,115,22,0.22)',
              borderRadius: 10, padding: '8px 14px',
            }}>
              <Flame size={15} color="#f97316" strokeWidth={2} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f97316', fontVariantNumeric: 'tabular-nums' }}>{streak}</span>
              <span style={{ fontSize: 12, color: 'rgba(249,115,22,0.70)', fontWeight: 500 }}>day streak</span>
            </div>
          )}
          <button
            className="tbBtn"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => navigate('/meals')}
          >
            <Sparkles size={14} />
            Suggest Meal
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Calories Consumed', value: consumed.calories.toLocaleString(), unit: 'kcal', color: 'var(--acc)' },
          { label: 'Daily Target', value: calGoal.toLocaleString(), unit: 'kcal', color: 'var(--txt)' },
          { label: 'Protein Today', value: `${Math.round(consumed.protein)}`, unit: 'g', color: 'var(--acc3)' },
          { label: 'Meals Logged', value: String(todayLogs.length), unit: 'today', color: 'var(--txt)' },
        ].map(({ label, value, unit, color }) => (
          <div key={label} className="kpi">
            <div className="kpiLabel">{label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
              <span className="kpiVal num" style={{ color }}>{value}</span>
              <span className="kpiUnit">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Calorie ring + Macros ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 284px', gap: 16 }}>

        {/* Ring card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 40, padding: '28px 36px' }}>
          <CalorieRing remaining={remaining} total={calGoal} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: pctDone >= 1 ? '#ef4444' : pctDone >= 0.75 ? '#f97316' : 'var(--acc)',
              }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', letterSpacing: '-0.01em' }}>{calStatus}</span>
            </div>
            <p style={{ margin: '0 0 24px', fontSize: 13.5, color: 'var(--txt2)', lineHeight: 1.65 }}>
              {calMessage}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '10px 18px', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, fontWeight: 600 }}>Consumed</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--acc)' }}>{consumed.calories.toLocaleString()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '10px 18px', flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3, fontWeight: 600 }}>Target</div>
                <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{calGoal.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Macros + expiry */}
        <div className="card" style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt2)', marginBottom: 18 }}>
            Macros Today
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
            <MacroBar label="Protein" value={consumed.protein} goal={goals.protein} color="var(--acc)" />
            <MacroBar label="Carbs"   value={consumed.carbs}   goal={goals.carbs}   color="var(--acc3)" />
            <MacroBar label="Fat"     value={consumed.fat}     goal={goals.fat}     color="#f97316" />
          </div>

          {expiryItems.length > 0 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '18px 0 14px' }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--txt2)', marginBottom: 10 }}>
                Expiring Soon
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {expiryItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--txt)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {item.name}
                    </span>
                    <span className={`expPill ${item.pillCls}`} style={{ marginLeft: 8, flexShrink: 0 }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Today's Meals ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--txt)' }}>
            Today's Meals
          </h2>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--acc)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0, fontFamily: 'var(--fb)' }}
            onClick={() => navigate('/meals')}
          >
            Get Suggestions
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {SLOTS.map(slot => {
            const meal = slotMap[slot];
            const cfg  = SLOT_CONFIG[slot];
            const Icon = cfg.icon;

            if (meal) {
              return (
                <div
                  key={slot}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => navigate('/meals')}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; }}
                >
                  <div style={{
                    height: 100,
                    background: `linear-gradient(135deg, ${cfg.color}18 0%, ${cfg.color}06 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `${cfg.color}18`,
                      border: `1px solid ${cfg.color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={20} color={cfg.color} strokeWidth={1.5} />
                    </div>
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(200,255,0,0.10)', border: '1px solid rgba(200,255,0,0.22)',
                      color: 'var(--acc)', fontSize: 10, fontWeight: 700,
                      padding: '3px 9px', borderRadius: 20, letterSpacing: '0.04em',
                      display: 'flex', alignItems: 'center', gap: 5,
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--acc)' }} />
                      Logged
                    </div>
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>
                      {slot}
                    </div>
                    <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6, color: 'var(--txt)', lineHeight: 1.3, letterSpacing: '-0.01em' }}>
                      {meal.meal_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--txt2)' }}>
                      <TrendingUp size={12} color="var(--txt3)" strokeWidth={2} />
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{meal.calories} kcal</span>
                    </div>
                  </div>
                </div>
              );
            }

            // Empty slot
            return (
              <div
                key={slot}
                style={{
                  background: 'rgba(255,255,255,0.018)',
                  border: '1px dashed rgba(255,255,255,0.10)',
                  borderRadius: 'var(--rad-lg)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  minHeight: 190, padding: 24, gap: 10,
                  cursor: 'pointer', transition: 'border-color .15s, background .15s',
                }}
                onClick={() => navigate('/meals')}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'rgba(255,255,255,0.20)'; d.style.background = 'rgba(255,255,255,0.035)'; }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'rgba(255,255,255,0.10)'; d.style.background = 'rgba(255,255,255,0.018)'; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${cfg.color}12`,
                  border: `1px solid ${cfg.color}20`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Plus size={16} color={cfg.color} strokeWidth={2} />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--txt)', marginBottom: 4, letterSpacing: '-0.01em' }}>
                    Log {slot}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5 }}>
                    Get AI suggestions based on your remaining macros
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Extra snacks / overflow meals */}
        {extraMeals.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {extraMeals.map((m: any) => (
              <div
                key={m.id}
                className="mealRow"
                style={{ padding: '10px 14px' }}
                onClick={() => navigate('/meals')}
              >
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Utensils size={15} color="var(--txt3)" strokeWidth={1.5} />
                </div>
                <div className="mealInfo">
                  <div className="mealNm" style={{ fontWeight: 600 }}>{m.meal_name}</div>
                  <div className="mealTm" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={10} color="var(--txt3)" />
                    {new Date(m.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Snack
                  </div>
                </div>
                <div className="mealKcal num">{m.calories}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
