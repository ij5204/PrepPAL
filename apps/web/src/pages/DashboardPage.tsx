import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';

/* ── Large calorie ring ───────────────────────────────────────────────────── */

function CalorieRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 80;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(remaining / (total || 1), 1);
  const offset = circ - pct * circ;
  const color = pct <= 0.15 ? 'var(--acc2)' : 'var(--acc)';

  return (
    <div style={{ position: 'relative', flexShrink: 0, width: 200, height: 200 }}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
        <circle
          cx="100" cy="100" r={r}
          fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          transform="rotate(-90 100 100)"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .7s ease, stroke .3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--fd)', fontSize: 40, lineHeight: 1, color: 'var(--txt)' }}>
          {remaining.toLocaleString()}
        </div>
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 2, color: 'var(--txt2)', marginTop: 5, fontWeight: 600 }}>
          kcal remaining
        </div>
      </div>
    </div>
  );
}

/* ── Macro bar ────────────────────────────────────────────────────────────── */

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(value / (goal || 1), 1) * 100;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
        <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13 }}>
          <span style={{ color, fontWeight: 700 }}>{Math.round(value)}g</span>
          <span style={{ color: 'var(--txt2)' }}> / {goal}g</span>
        </span>
      </div>
      <div style={{ height: 7, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .6s cubic-bezier(.4,0,.2,1)' }} />
      </div>
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

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

const SLOT_META: Record<string, { emoji: string; color: string; planLabel: string }> = {
  Breakfast: { emoji: '🥣', color: '#f59e0b', planLabel: 'Plan Breakfast' },
  Lunch:     { emoji: '🥗', color: '#3b82f6', planLabel: 'Plan Lunch' },
  Dinner:    { emoji: '🍽️', color: '#8b5cf6', planLabel: 'Plan Dinner' },
  Snack:     { emoji: '🍎', color: '#10b981', planLabel: 'Add a Snack' },
};

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function DashboardPage() {
  const { profile } = useAuthStore();
  const navigate = useNavigate();
  const [todayLogs, setTodayLogs] = useState<any[]>([]);
  const [expiryItems, setExpiryItems] = useState<any[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const fetchingRef = useRef(false);

  const fetchDashboard = useCallback(async (currentProfile: any) => {
    if (!currentProfile || fetchingRef.current) return;
    fetchingRef.current = true;
    setDataLoading(true);
    try {
      const { session } = useAuthStore.getState();
      if (!session) throw new Error('Session expired');

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const in14Days = new Date(today); in14Days.setDate(in14Days.getDate() + 14);

      const [logsRes, expiryRes] = await Promise.all([
        supabase.from('meal_logs').select('*').gte('eaten_at', today.toISOString()),
        supabase.from('pantry_items')
          .select('id, name, quantity, unit, category, expiry_date')
          .lte('expiry_date', in14Days.toISOString().split('T')[0])
          .gte('expiry_date', today.toISOString().split('T')[0])
          .order('expiry_date').limit(5),
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
    } catch (err) {
      console.error('[Dashboard] fetch error:', err);
    } finally {
      setDataLoading(false);
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
      <div style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin .8s linear infinite' }} />
      Loading…
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

  let calStatus  = 'Just Starting';
  let calMessage = 'Your day is just beginning. Log your meals to stay on track.';
  if (pctDone >= 1)    { calStatus = 'Goal Reached';  calMessage = `You've hit your ${calGoal.toLocaleString()} kcal target for today. Great work!`; }
  else if (pctDone >= 0.75) { calStatus = 'Almost There';  calMessage = `Only ${remaining.toLocaleString()} kcal left. Finish strong!`; }
  else if (pctDone >= 0.40) { calStatus = 'On Track';      calMessage = `You're maintaining a healthy deficit for today.`; }
  else if (pctDone >= 0.10) { calStatus = 'Keep Going';    calMessage = `${remaining.toLocaleString()} kcal left in your budget. Time for your next meal.`; }

  // Group meals into slots (at most one per slot shown)
  const SLOTS = ['Breakfast', 'Lunch', 'Dinner'] as const;
  const slotMap: Record<string, any | null> = { Breakfast: null, Lunch: null, Dinner: null };
  todayLogs.forEach(m => {
    const slot = getMealSlot(m.eaten_at);
    if (slot in slotMap && slotMap[slot] === null) slotMap[slot] = m;
  });
  // Extra meals not in main slots
  const extraMeals = todayLogs.filter(m => {
    const slot = getMealSlot(m.eaten_at);
    return !(slot in slotMap) || slotMap[slot]?.id !== m.id;
  });

  return (
    <div className="pageWrapper" style={{ gap: 24, paddingBottom: 40 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--txt)' }}>
            Today's Progress
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--txt2)' }}>
            Stay on track with your nutritional goals.
          </p>
        </div>
        <button className="tbBtn" onClick={() => navigate('/meals')}>
          ✦ Suggest Meal
        </button>
      </div>

      {/* ── Main grid: ring + macros ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* Calorie ring card */}
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 36, padding: 32 }}>
          <CalorieRing remaining={remaining} total={calGoal} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6, color: 'var(--txt)' }}>
              {calStatus}
            </div>
            <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--txt2)', lineHeight: 1.6 }}>
              {calMessage}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 20px' }}>
                <div style={{ fontSize: 10, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Consumed</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{consumed.calories.toLocaleString()}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '10px 20px' }}>
                <div style={{ fontSize: 10, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3, fontWeight: 600 }}>Target</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{calGoal.toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Macros card */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 24, color: 'var(--txt)' }}>Macros</div>
          <MacroBar label="Protein" value={consumed.protein} goal={goals.protein} color="var(--acc)" />
          <MacroBar label="Carbs"   value={consumed.carbs}   goal={goals.carbs}   color="var(--acc3)" />
          <MacroBar label="Fat"     value={consumed.fat}     goal={goals.fat}     color="var(--acc2)" />

          {/* Expiry quick view */}
          {expiryItems.length > 0 && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '18px 0' }} />
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--txt2)', fontWeight: 600, marginBottom: 10 }}>Expiring Soon</div>
              {expiryItems.slice(0, 3).map((item, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                  <span className={`expPill ${item.pillCls}`} style={{ marginLeft: 8 }}>{item.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Today's Meals ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--txt)' }}>Today's Meals</h2>
          <span
            style={{ fontSize: 12, color: 'var(--acc)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}
            onClick={() => navigate('/meals')}
          >
            Get Suggestions →
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {SLOTS.map(slot => {
            const meal = slotMap[slot];
            const meta = SLOT_META[slot];

            if (meal) {
              return (
                <div
                  key={slot}
                  className="card"
                  style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'transform .15s, box-shadow .15s' }}
                  onClick={() => navigate('/meals')}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; }}
                >
                  {/* Meal image area */}
                  <div style={{
                    height: 130,
                    background: `linear-gradient(135deg, ${meta.color}28 0%, ${meta.color}0a 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    <span style={{ fontSize: 52 }}>{meta.emoji}</span>
                    <div style={{
                      position: 'absolute', top: 10, right: 10,
                      background: 'rgba(200,255,0,0.14)', border: '1px solid rgba(200,255,0,0.30)',
                      color: 'var(--acc)', fontSize: 10, fontWeight: 700,
                      padding: '3px 9px', borderRadius: 20, letterSpacing: 0.4,
                    }}>
                      ● Logged
                    </div>
                  </div>
                  {/* Info */}
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, color: meta.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
                      {slot}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: 'var(--txt)', lineHeight: 1.3 }}>{meal.meal_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--txt2)' }}>🔥 {meal.calories} kcal</div>
                  </div>
                </div>
              );
            }

            // Placeholder
            return (
              <div
                key={slot}
                style={{
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px dashed rgba(255,255,255,0.12)',
                  borderRadius: 'var(--rad-lg)',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  minHeight: 200, padding: 24,
                  cursor: 'pointer', transition: 'border-color .15s, background .15s',
                }}
                onClick={() => navigate('/meals')}
                onMouseEnter={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'rgba(255,255,255,0.24)'; d.style.background = 'rgba(255,255,255,0.045)'; }}
                onMouseLeave={e => { const d = e.currentTarget as HTMLDivElement; d.style.borderColor = 'rgba(255,255,255,0.12)'; d.style.background = 'rgba(255,255,255,0.025)'; }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.14)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, marginBottom: 14, color: 'var(--txt2)',
                }}>+</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 5, color: 'var(--txt)' }}>{meta.planLabel}</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', textAlign: 'center', lineHeight: 1.55 }}>
                  Tap to suggest a meal based on your remaining macros.
                </div>
              </div>
            );
          })}
        </div>

        {/* Extra meals (snacks etc.) */}
        {extraMeals.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {extraMeals.map((m: any) => (
              <div className="mealRow" key={m.id} onClick={() => navigate('/meals')}>
                <div className="mealIcon">🍎</div>
                <div className="mealInfo">
                  <div className="mealNm">{m.meal_name}</div>
                  <div className="mealTm">{new Date(m.eaten_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · Snack</div>
                </div>
                <div className="mealKcal">{m.calories}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loading shimmer overlay */}
      {dataLoading && todayLogs.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }} />
      )}
    </div>
  );
}
