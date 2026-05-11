import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { calcMacroGoals, getExpiryStatus } from '@preppal/utils';
import { PrepBarChart, PrepAreaChart } from '../components/ui/AnalyticsChart';
import type { MealLog } from '@preppal/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Timeframe = 'today' | 'week' | 'month';
type MealType  = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
type MacroStatus = 'low' | 'balanced' | 'high';

interface DayData {
  date: string; day: string;
  calories: number; protein: number; carbs: number; fat: number;
  [key: string]: unknown;
}

interface PantryHint { name: string; category: string; expiry_date: string | null; }

interface NutritionScore {
  score: number; grade: string; gradeColor: string; tagline: string;
  bestMacro: string; biggestGap: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMealType(eaten_at: string): MealType {
  const h = new Date(eaten_at).getHours();
  if (h >= 5  && h < 11) return 'Breakfast';
  if (h >= 11 && h < 15) return 'Lunch';
  if (h >= 15 && h < 21) return 'Dinner';
  return 'Snack';
}

function formatDayKey(d: Date) { return d.toISOString().split('T')[0]; }

function aggregateByDay(
  rows: Array<{ eaten_at: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>,
  days: Map<string, DayData>
): DayData[] {
  for (const row of rows) {
    const key = formatDayKey(new Date(row.eaten_at));
    if (!days.has(key)) continue;
    const c = days.get(key)!;
    days.set(key, { ...c, calories: c.calories + row.calories, protein: c.protein + Number(row.protein_g), carbs: c.carbs + Number(row.carbs_g), fat: c.fat + Number(row.fat_g) });
  }
  return Array.from(days.values());
}

function getMacroStatus(value: number, goal: number): MacroStatus {
  const p = value / (goal || 1);
  if (p < 0.70) return 'low';
  if (p > 1.15) return 'high';
  return 'balanced';
}

function calcNutritionScore(
  calories: number, calorieGoal: number,
  protein: number, proteinGoal: number,
  carbs: number, carbGoal: number,
  fat: number, fatGoal: number,
  mealsCount: number
): NutritionScore {
  if (mealsCount === 0) return {
    score: 0, grade: 'No Data', gradeColor: 'var(--txt3)',
    tagline: 'Log a meal to get your daily nutrition score.',
    bestMacro: '—', biggestGap: '—',
  };

  let score = 100;
  const calPct  = calories / (calorieGoal  || 1);
  const protPct = protein  / (proteinGoal  || 1);

  if      (calPct > 1.25) score -= 25;
  else if (calPct > 1.10) score -= 15;
  else if (calPct > 1.00) score -= 5;
  else if (calPct < 0.40) score -= 25;
  else if (calPct < 0.60) score -= 15;
  else if (calPct < 0.80) score -= 8;

  if      (protPct < 0.30) score -= 30;
  else if (protPct < 0.50) score -= 20;
  else if (protPct < 0.70) score -= 12;
  else if (protPct < 0.90) score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade      = score >= 90 ? 'Optimal Baseline' : score >= 75 ? 'Good Standing' : score >= 55 ? 'Needs Tuning' : 'Deficit Mode';
  const gradeColor = score >= 90 ? 'var(--acc)' : score >= 75 ? 'var(--acc)' : score >= 55 ? '#F59E0B' : '#EF4444';

  const macros = [
    { name: 'Protein', pct: protPct },
    { name: 'Carbs',   pct: carbs / (carbGoal || 1) },
    { name: 'Fat',     pct: fat   / (fatGoal  || 1) },
  ];
  const closest  = macros.reduce((a, b) => Math.abs(a.pct - 1) <= Math.abs(b.pct - 1) ? a : b);
  const farthest = macros.reduce((a, b) => Math.abs(a.pct - 1) >= Math.abs(b.pct - 1) ? a : b);

  let tagline = '';
  if      (score >= 90)                    tagline = 'Metabolic rate is steady. Caloric deficit is on track, but macro balance requires slight tuning for muscle retention.';
  else if (score >= 75)                    tagline = `Good calorie control${protPct < 0.8 ? ', but protein is a bit low.' : '. Keep the momentum going.'}`;
  else if (calPct > 1.1 && protPct < 0.7) tagline = 'Over on calories and low on protein. Adjust your next meal focus.';
  else if (calPct > 1.1)                  tagline = "Calorie goal exceeded. Consider a lighter next meal.";
  else if (protPct < 0.5)                 tagline = 'Protein is the main gap today. Add a protein-rich meal.';
  else                                     tagline = 'Room to improve — check macro targets below.';

  return { score, grade, gradeColor, tagline, bestMacro: closest.name, biggestGap: farthest.name };
}

// ── Intelligence card data ─────────────────────────────────────────────────────

interface IntelCard {
  badgeType: 'attention' | 'optimal' | 'info';
  icon: string;
  title: string;
  body: string;
}

function getIntelCards(
  consumed: { calories: number; protein: number; carbs: number; fat: number },
  goals: { protein: number; carbs: number; fat: number },
  calorieGoal: number,
  logs: MealLog[]
): [IntelCard, IntelCard] {
  const protPct = consumed.protein / (goals.protein || 1);
  const carbPct = consumed.carbs   / (goals.carbs   || 1);
  const calPct  = consumed.calories / (calorieGoal  || 1);

  // Card A: protein or calorie status
  let cardA: IntelCard;
  if (logs.length === 0) {
    cardA = { badgeType: 'info', icon: '◎', title: 'No meals logged', body: 'Log your first meal to start receiving AI-powered nutrition insights.' };
  } else if (protPct < 0.65) {
    const gap = Math.round(goals.protein - consumed.protein);
    cardA = { badgeType: 'attention', icon: '!', title: 'Low protein today', body: `You are currently ${gap}g under your daily target. Consider a lean source for your next meal.` };
  } else if (calPct > 1.12) {
    cardA = { badgeType: 'attention', icon: '!', title: 'Calorie goal exceeded', body: `You're ${Math.round(consumed.calories - calorieGoal)} kcal over your target. Plan a lighter next meal.` };
  } else if (protPct >= 0.90) {
    cardA = { badgeType: 'optimal', icon: '◎', title: 'Protein on target', body: `${Math.round(consumed.protein)}g logged — solid contribution. Your muscle synthesis is well-supported today.` };
  } else {
    cardA = { badgeType: 'info', icon: '◈', title: `Protein at ${Math.round(protPct * 100)}%`, body: `${Math.round(goals.protein - consumed.protein)}g remaining to hit your protein target for today.` };
  }

  // Card B: carbs, calorie balance or positive metric
  let cardB: IntelCard;
  if (carbPct >= 0.85 && carbPct <= 1.10) {
    cardB = { badgeType: 'optimal', icon: '◇', title: 'Carb Intake Peak', body: 'Carbohydrate intake aligns perfectly with your energy requirements and planned activity levels today.' };
  } else if (calPct >= 0.78 && calPct <= 1.02 && logs.length > 0) {
    cardB = { badgeType: 'optimal', icon: '◇', title: 'Calorie Balance Peak', body: 'Your calorie intake is aligned with your daily goal. Great energy management and pacing today.' };
  } else if (carbPct > 1.20) {
    cardB = { badgeType: 'attention', icon: '↑', title: 'High carb intake', body: `Carbs are at ${Math.round(carbPct * 100)}% of goal. Pair remaining meals with more protein to re-balance.` };
  } else if (consumed.fat / (goals.fat || 1) >= 0.85) {
    cardB = { badgeType: 'optimal', icon: '◇', title: 'Fat Balance Maintained', body: 'Dietary fat is within a healthy range. Hormonal function and fat-soluble vitamin absorption are supported.' };
  } else {
    const rem = Math.max(calorieGoal - consumed.calories, 0);
    cardB = { badgeType: 'info', icon: '◈', title: 'Calorie Tracking', body: `${rem.toLocaleString()} kcal remaining in your daily budget. Keep logging to stay on track.` };
  }

  return [cardA, cardB];
}

function getDinnerProjection(
  logs: MealLog[],
  consumed: { calories: number },
  calorieGoal: number
): string | null {
  const hour   = new Date().getHours();
  const dinner  = logs.filter(m => getMealType(m.eaten_at) === 'Dinner');
  const lunch   = logs.filter(m => getMealType(m.eaten_at) === 'Lunch');
  const rem     = calorieGoal - consumed.calories;

  if (dinner.length > 0) {
    const dc  = dinner.reduce((s, m) => s + m.calories, 0);
    const pct = consumed.calories > 0 ? dc / consumed.calories : 0;
    if (pct > 0.45) return `Dinner accounts for ${Math.round(pct * 100)}% of your calories. AI suggests shifting more food earlier in the day for better energy distribution.`;
    return `Dinner looks well-proportioned at ${dc} kcal. ${rem > 0 ? `${Math.round(rem)} kcal remaining for a light snack.` : 'Daily goal reached.'}`;
  }

  if (hour >= 13 && lunch.length > 0) {
    if (rem < 0) return 'Based on your logged meals, you\'ve already exceeded your calorie goal. AI suggests skipping dinner or having a very light meal.';
    if (rem > calorieGoal * 0.42) return `Based on your logged lunch, your planned dinner may be too calorie-heavy. AI suggests reducing the carb portion by 20% to maintain your deficit.`;
    return `Based on current intake, you have ${Math.round(rem)} kcal left for dinner. A balanced meal with lean protein is the optimal choice.`;
  }

  return null;
}

// ── Macro status config ────────────────────────────────────────────────────────

const MACRO_BAR_COLOR: Record<MacroStatus, string> = {
  low:      '#ef4444',
  balanced: 'var(--acc)',
  high:     '#f59e0b',
};
const MACRO_STATUS_ICON: Record<MacroStatus, string> = {
  low:      '↗',
  balanced: '✓',
  high:     '!',
};
const MACRO_STATUS_MSG = (name: string, status: MacroStatus, value: number, goal: number): string => {
  const gap = Math.abs(Math.round(goal - value));
  if (status === 'low')      return `Primary deficit area. ${gap}g below target — needs immediate attention.`;
  if (status === 'high')     return `Exceeding target by ${gap}g. Consider lighter ${name.toLowerCase()} sources.`;
  return name === 'Protein' ? 'On track. Sufficient for muscle repair and satiety.' : 'On track. Optimal for your planned activity level.';
};

// ── Week / Month view helpers ──────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--txt3)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Today view ─────────────────────────────────────────────────────────────────

function TodayView({ logs, calorieGoal, macroGoals }: {
  logs: MealLog[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
}) {
  const consumed = {
    calories: logs.reduce((s, m) => s + m.calories, 0),
    protein:  logs.reduce((s, m) => s + Number(m.protein_g), 0),
    carbs:    logs.reduce((s, m) => s + Number(m.carbs_g), 0),
    fat:      logs.reduce((s, m) => s + Number(m.fat_g), 0),
  };

  const score          = calcNutritionScore(consumed.calories, calorieGoal, consumed.protein, macroGoals.protein, consumed.carbs, macroGoals.carbs, consumed.fat, macroGoals.fat, logs.length);
  const [cardA, cardB] = getIntelCards(consumed, macroGoals, calorieGoal, logs);
  const dinnerProj     = getDinnerProjection(logs, consumed, calorieGoal);

  const protStatus = getMacroStatus(consumed.protein, macroGoals.protein);
  const carbStatus = getMacroStatus(consumed.carbs,   macroGoals.carbs);
  const fatStatus  = getMacroStatus(consumed.fat,     macroGoals.fat);

  // Calorie load distribution
  const slotCals = { Brk: 0, Lun: 0, Snk: 0, Din: 0 };
  logs.forEach(m => {
    const t = getMealType(m.eaten_at);
    if (t === 'Breakfast') slotCals.Brk += m.calories;
    else if (t === 'Lunch') slotCals.Lun += m.calories;
    else if (t === 'Snack') slotCals.Snk += m.calories;
    else if (t === 'Dinner') slotCals.Din += m.calories;
  });
  const maxSlotCal = Math.max(...Object.values(slotCals), 1);
  const hour = new Date().getHours();
  const SLOTS = [
    { key: 'Brk' as const, label: 'Brk', upcoming: slotCals.Brk === 0 && hour < 11 },
    { key: 'Lun' as const, label: 'Lun', upcoming: slotCals.Lun === 0 && hour < 13 },
    { key: 'Snk' as const, label: 'Snk', upcoming: slotCals.Snk === 0 },
    { key: 'Din' as const, label: 'Din', upcoming: slotCals.Din === 0 && hour < 17 },
  ];

  const BADGE_STYLE: Record<IntelCard['badgeType'], { bg: string; color: string }> = {
    attention: { bg: 'rgba(239,68,68,0.15)',  color: '#ef4444' },
    optimal:   { bg: 'rgba(200,255,0,0.14)',  color: 'var(--acc)' },
    info:      { bg: 'rgba(0,212,255,0.12)',  color: 'var(--acc3)' },
  };

  const BADGE_LABEL: Record<IntelCard['badgeType'], string> = {
    attention: 'Attention',
    optimal:   'Optimal',
    info:      'Info',
  };

  function IntelCardEl({ card }: { card: IntelCard }) {
    const bs = BADGE_STYLE[card.badgeType];
    return (
      <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: 'var(--txt)',
          }}>{card.icon}</div>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            padding: '3px 9px', borderRadius: 20,
            background: bs.bg, color: bs.color,
          }}>{BADGE_LABEL[card.badgeType]}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.25 }}>{card.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.6 }}>{card.body}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── Intelligence grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gridTemplateRows: 'auto auto', gap: 14 }}>

        {/* Daily Intelligence (spans 2 rows) */}
        <div className="card" style={{ gridColumn: 1, gridRow: '1 / 3', padding: 24, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--txt2)', textTransform: 'uppercase', marginBottom: 16 }}>
            Daily Intelligence
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--fd)', fontSize: 64, lineHeight: 1, color: score.gradeColor }}>{score.score}</span>
            <span style={{ fontSize: 18, color: 'var(--txt3)', fontWeight: 400 }}>/100</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 'auto', paddingBottom: 24 }}>{score.grade}</div>
          <div style={{
            padding: '14px 16px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--acc)', flexShrink: 0, marginTop: 8, display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.6 }}>{score.tagline}</span>
            </div>
          </div>
        </div>

        {/* Card A */}
        <div style={{ gridColumn: 2, gridRow: 1 }}>
          <IntelCardEl card={cardA} />
        </div>

        {/* Card B */}
        <div style={{ gridColumn: 3, gridRow: 1 }}>
          <IntelCardEl card={cardB} />
        </div>

        {/* Dinner Projection */}
        {dinnerProj ? (
          <div className="card" style={{ gridColumn: '2 / 4', gridRow: 2, padding: 22, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>🍽️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Dinner Projection</div>
              <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.6 }}>{dinnerProj}</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ gridColumn: '2 / 4', gridRow: 2, padding: 22, display: 'flex', alignItems: 'center', gap: 14, opacity: 0.6 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🍽️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 4 }}>Dinner Projection</div>
              <div style={{ fontSize: 12, color: 'var(--txt2)' }}>Log more meals to generate a dinner projection.</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom two-col ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Macro Architecture */}
        <div className="card" style={{ padding: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--txt)' }}>Macro Architecture</div>
            <div style={{ fontSize: 12, color: 'var(--acc)', cursor: 'pointer', fontWeight: 600 }}>Edit Targets</div>
          </div>

          {/* Protein */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>Protein</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: MACRO_BAR_COLOR[protStatus], fontWeight: 700 }}>{Math.round(consumed.protein)}g</span>
                <span style={{ color: 'var(--txt2)' }}> / {macroGoals.protein}g</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${Math.min(consumed.protein / (macroGoals.protein || 1), 1) * 100}%`, background: MACRO_BAR_COLOR[protStatus], borderRadius: 4, transition: 'width .7s ease' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: MACRO_BAR_COLOR[protStatus], fontWeight: 700 }}>{MACRO_STATUS_ICON[protStatus]}</span>
              {MACRO_STATUS_MSG('Protein', protStatus, consumed.protein, macroGoals.protein)}
            </div>
          </div>

          {/* Carbohydrates */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>Carbohydrates</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: MACRO_BAR_COLOR[carbStatus], fontWeight: 700 }}>{Math.round(consumed.carbs)}g</span>
                <span style={{ color: 'var(--txt2)' }}> / {macroGoals.carbs}g</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${Math.min(consumed.carbs / (macroGoals.carbs || 1), 1) * 100}%`, background: MACRO_BAR_COLOR[carbStatus], borderRadius: 4, transition: 'width .7s ease' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: MACRO_BAR_COLOR[carbStatus], fontWeight: 700 }}>{MACRO_STATUS_ICON[carbStatus]}</span>
              {MACRO_STATUS_MSG('Carbs', carbStatus, consumed.carbs, macroGoals.carbs)}
            </div>
          </div>

          {/* Fats */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>Fats</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: MACRO_BAR_COLOR[fatStatus], fontWeight: 700 }}>{Math.round(consumed.fat)}g</span>
                <span style={{ color: 'var(--txt2)' }}> / {macroGoals.fat}g</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${Math.min(consumed.fat / (macroGoals.fat || 1), 1) * 100}%`, background: MACRO_BAR_COLOR[fatStatus], borderRadius: 4, transition: 'width .7s ease' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: MACRO_BAR_COLOR[fatStatus], fontWeight: 700 }}>{MACRO_STATUS_ICON[fatStatus]}</span>
              {MACRO_STATUS_MSG('Fats', fatStatus, consumed.fat, macroGoals.fat)}
            </div>
          </div>
        </div>

        {/* Right charts column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Calorie Load Distribution */}
          <div className="card" style={{ padding: 22, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 22 }}>Calorie Load Distribution</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 0, height: 100, padding: '0 8px' }}>
              {SLOTS.map(({ key, label, upcoming }) => {
                const cal = slotCals[key];
                const barH = upcoming ? 0 : Math.max((cal / maxSlotCal) * 85, cal > 0 ? 10 : 0);
                return (
                  <div key={key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8, height: '100%' }}>
                    <div style={{ width: '50%', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: 85 }}>
                      {upcoming && cal === 0 ? (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
                          <div style={{ width: '100%', height: 4, borderTop: '2px dashed rgba(255,255,255,0.18)', marginBottom: 0 }} />
                        </div>
                      ) : (
                        <div style={{
                          width: '100%',
                          height: barH,
                          background: cal > 0 ? 'rgba(200,255,0,0.75)' : 'rgba(255,255,255,0.08)',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height .6s ease',
                        }} />
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--txt2)', fontWeight: 600, letterSpacing: 0.5 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 7-Day Consistency */}
          <div className="card" style={{ padding: 22, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 8 }}>7-Day Consistency</div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 18 }}>Calories vs goal per day</div>
            {/* Day dots — simple SVG scatter */}
            <div style={{ position: 'relative', height: 70 }}>
              <svg width="100%" height="70" style={{ overflow: 'visible' }}>
                {/* Goal line */}
                <line x1="0" y1="10" x2="100%" y2="10" stroke="rgba(200,255,0,0.15)" strokeWidth="1" strokeDasharray="4 3" />
              </svg>
              {/* Overlay labels + dots using flexbox for even spacing */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end' }}>
                {/* We render this from weekData, but since we're in TodayView we don't have weekData - use placeholder if not passed */}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--txt2)', fontWeight: 600 }}>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Today', 'Sun'].map(d => (
                <span key={d} style={{ color: d === 'Today' ? 'var(--acc)' : undefined }}>{d}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 7-Day Consistency chart (uses weekData) ────────────────────────────────────

function ConsistencyChart({ weekData, calorieGoal }: { weekData: DayData[]; calorieGoal: number }) {
  const H = 70;
  return (
    <div style={{ position: 'relative', height: H + 24, overflow: 'visible' }}>
      <svg width="100%" height={H} viewBox={`0 0 ${weekData.length * 40} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <line x1={0} y1={10} x2={weekData.length * 40} y2={10} stroke="rgba(200,255,0,0.18)" strokeWidth="1" strokeDasharray="4 3" />
        {weekData.map((d, i) => {
          const pct  = Math.min(d.calories / (calorieGoal || 1), 1.2);
          const cy   = d.calories > 0 ? H - (pct * (H - 10)) - 4 : H - 4;
          const isToday = i === weekData.length - 1;
          return d.calories > 0 ? (
            <circle key={i} cx={i * 40 + 20} cy={cy} r={isToday ? 5 : 4}
              fill={isToday ? 'var(--acc)' : 'rgba(200,255,0,0.60)'} />
          ) : (
            <circle key={i} cx={i * 40 + 20} cy={H - 4} r={3}
              fill="rgba(255,255,255,0.12)" />
          );
        })}
      </svg>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', paddingTop: H }}>
        {weekData.map((d, i) => (
          <span key={i} style={{ fontSize: 10, color: i === weekData.length - 1 ? 'var(--acc)' : 'var(--txt2)', fontWeight: i === weekData.length - 1 ? 700 : 400 }}>
            {i === weekData.length - 1 ? 'Today' : d.day}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ weekData, calorieGoal, macroGoals }: { weekData: DayData[]; calorieGoal: number; macroGoals: { protein: number; carbs: number; fat: number } }) {
  const tracked = weekData.filter(d => d.calories > 0);
  if (tracked.length === 0) return <EmptyState message="No meals logged this week yet. Start tracking to see your trends." />;

  const avgCalories  = Math.round(tracked.reduce((s, d) => s + d.calories, 0) / tracked.length);
  const avgProtein   = Math.round(tracked.reduce((s, d) => s + d.protein,  0) / tracked.length);
  const adherent     = tracked.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(tracked.length, 1)) * 100);
  const bestDay      = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) <= Math.abs(b.calories - calorieGoal) ? a : b);
  const worstDay     = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) >= Math.abs(b.calories - calorieGoal) ? a : b);
  const calChartData = weekData.map(d => ({ ...d, target: calorieGoal }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Avg Calories',   value: avgCalories.toLocaleString(), unit: 'kcal', color: 'var(--acc)' },
          { label: 'Avg Protein',    value: String(avgProtein), unit: 'g', color: '#3B82F6' },
          { label: 'Goal Adherence', value: `${adherencePct}%`, unit: '', color: adherencePct >= 70 ? 'var(--acc)' : '#F59E0B' },
          { label: 'Days Tracked',   value: `${tracked.length}/7`, unit: '', color: 'var(--txt)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: 'var(--txt3)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: 'var(--fd)', fontSize: 26, color: s.color, lineHeight: 1 }}>{s.value}</span>
              {s.unit && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <ChartCard title="Daily Calories" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day`}>
          <PrepBarChart data={calChartData} dataKey="calories" xKey="day" secondDataKey="target" secondColor="rgba(255,255,255,0.05)" color="#C8FF00" unit=" kcal" height={180} />
        </ChartCard>
        <ChartCard title="Daily Protein" subtitle={`Goal: ${macroGoals.protein}g/day`}>
          <PrepAreaChart data={weekData} dataKey="protein" xKey="day" color="#3B82F6" unit="g" referenceValue={macroGoals.protein} height={180} />
        </ChartCard>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '16px 18px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--rad)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>Best Day</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>{bestDay.day}</p>
          <p style={{ fontSize: 12, color: 'var(--txt3)' }}>{bestDay.calories.toLocaleString()} kcal · {Math.round(Math.abs(bestDay.calories - calorieGoal))} kcal from goal</p>
        </div>
        <div style={{ padding: '16px 18px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--rad)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>Most Off-Track</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>{worstDay.day}</p>
          <p style={{ fontSize: 12, color: 'var(--txt3)' }}>{worstDay.calories.toLocaleString()} kcal · {Math.round(Math.abs(worstDay.calories - calorieGoal))} kcal from goal</p>
        </div>
      </div>
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

function MonthView({ monthData, calorieGoal, macroGoals }: { monthData: DayData[]; calorieGoal: number; macroGoals: { protein: number; carbs: number; fat: number } }) {
  const tracked = monthData.filter(d => d.calories > 0);
  if (tracked.length === 0) return <EmptyState message="No meals logged this month yet. Start tracking to see your trends." />;

  const avgCalories   = Math.round(tracked.reduce((s, d) => s + d.calories, 0) / tracked.length);
  const avgProtein    = Math.round(tracked.reduce((s, d) => s + d.protein,  0) / tracked.length);
  const adherent      = tracked.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct  = Math.round((adherent / Math.max(tracked.length, 1)) * 100);
  const totalLogged   = tracked.reduce((s, d) => s + d.calories, 0);
  const protAdherent  = tracked.filter(d => d.protein >= macroGoals.protein * 0.9).length;
  const protPct       = Math.round((protAdherent / Math.max(tracked.length, 1)) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Avg Calories',  value: avgCalories.toLocaleString(), unit: 'kcal', color: 'var(--acc)' },
          { label: 'Avg Protein',   value: String(avgProtein), unit: 'g', color: '#3B82F6' },
          { label: 'Cal Adherence', value: `${adherencePct}%`, unit: '', color: adherencePct >= 70 ? 'var(--acc)' : '#F59E0B' },
          { label: 'Protein Days',  value: `${protPct}%`, unit: '', color: protPct >= 70 ? 'var(--acc)' : '#F59E0B' },
          { label: 'Days Logged',   value: String(tracked.length), unit: '', color: 'var(--txt)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: 'var(--txt3)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: 'var(--fd)', fontSize: 26, color: s.color, lineHeight: 1 }}>{s.value}</span>
              {s.unit && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <ChartCard title="Monthly Calorie Trend" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day`}>
        <PrepAreaChart data={monthData} dataKey="calories" xKey="day" color="#C8FF00" unit=" kcal" referenceValue={calorieGoal} height={200} />
      </ChartCard>
      <div className="card" style={{ padding: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 14 }}>Monthly Summary</p>
        {[
          { label: 'Total calories logged',  value: `${totalLogged.toLocaleString()} kcal` },
          { label: 'Avg calories / day',     value: `${avgCalories.toLocaleString()} kcal` },
          { label: 'Avg protein / day',      value: `${avgProtein}g` },
          { label: 'Days on calorie target', value: `${adherent} / ${tracked.length}` },
          { label: 'Days hitting protein',   value: `${protAdherent} / ${tracked.length}` },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{item.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Module-level cache ─────────────────────────────────────────────────────────

interface NutritionCache {
  todayLogs: MealLog[];
  weekData: DayData[];
  monthData: DayData[];
  pantryItems: PantryHint[];
  pantryCount: number;
  expiringCount: number;
}
let _nutritionCache: NutritionCache | null = null;

// ── Main Page ──────────────────────────────────────────────────────────────────

export function NutritionPage() {
  const { profile } = useAuthStore();
  const [timeframe, setTimeframe] = useState<Timeframe>('today');

  const [todayLogs,  setTodayLogs]  = useState<MealLog[]>(_nutritionCache?.todayLogs ?? []);
  const [weekData,   setWeekData]   = useState<DayData[]>(_nutritionCache?.weekData  ?? []);
  const [monthData,  setMonthData]  = useState<DayData[]>(_nutritionCache?.monthData ?? []);

  const [todayLoading, setTodayLoading] = useState(!_nutritionCache);
  const [weekLoading,  setWeekLoading]  = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [todayError,   setTodayError]   = useState<string | null>(null);

  const fetchingToday  = useRef(false);
  const fetchingWeek   = useRef(false);
  const fetchingMonth  = useRef(false);
  const fetchingPantry = useRef(false);
  const isMountedRef   = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  const macroGoals  = profile ? calcMacroGoals(profile) : { protein: 130, carbs: 200, fat: 60 };
  const calorieGoal = profile?.daily_calorie_goal ?? 2000;

  const fetchToday = useCallback(async (background = false) => {
    if (fetchingToday.current) return;
    fetchingToday.current = true;
    if (!background && !_nutritionCache) { setTodayLoading(true); setTodayError(null); }
    try {
      const { session } = useAuthStore.getState();
      if (!session) throw new Error('Your session expired. Please sign in again.');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('meal_logs').select('*').gte('eaten_at', today.toISOString()).order('eaten_at', { ascending: false });
      if (error) throw error;
      const logs = (data as MealLog[]) ?? [];
      if (!isMountedRef.current) return;
      setTodayLogs(logs);
      _nutritionCache = { ...(_nutritionCache ?? { weekData: [], monthData: [], pantryItems: [], pantryCount: 0, expiringCount: 0 }), todayLogs: logs };
    } catch (e: unknown) {
      if (!isMountedRef.current) return;
      if (!_nutritionCache) setTodayError((e as Error).message ?? "Failed to load today's meals");
    } finally {
      fetchingToday.current = false;
      if (isMountedRef.current) setTodayLoading(false);
    }
  }, []);

  const fetchWeek = useCallback(async (background = false) => {
    if (fetchingWeek.current) return;
    fetchingWeek.current = true;
    if (!background) setWeekLoading(true);
    try {
      const { session } = useAuthStore.getState();
      if (!session) return;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const start = new Date(today); start.setDate(start.getDate() - 6);
      const { data } = await supabase.from('meal_logs').select('eaten_at, calories, protein_g, carbs_g, fat_g').gte('eaten_at', start.toISOString()).order('eaten_at');
      const days = new Map<string, DayData>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: d.toLocaleDateString(undefined, { weekday: 'short' }), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      const result = aggregateByDay(data ?? [], days);
      if (!isMountedRef.current) return;
      setWeekData(result);
      _nutritionCache = { ...(_nutritionCache ?? { todayLogs: [], monthData: [], pantryItems: [], pantryCount: 0, expiringCount: 0 }), weekData: result };
    } finally { fetchingWeek.current = false; if (isMountedRef.current) setWeekLoading(false); }
  }, []);

  const fetchMonth = useCallback(async (background = false) => {
    if (fetchingMonth.current) return;
    fetchingMonth.current = true;
    if (!background) setMonthLoading(true);
    try {
      const { session } = useAuthStore.getState();
      if (!session) return;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data } = await supabase.from('meal_logs').select('eaten_at, calories, protein_g, carbs_g, fat_g').gte('eaten_at', startOfMonth.toISOString()).order('eaten_at');
      const days = new Map<string, DayData>();
      for (let i = 1; i <= now.getDate(); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: String(i), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      const result = aggregateByDay(data ?? [], days);
      if (!isMountedRef.current) return;
      setMonthData(result);
      _nutritionCache = { ...(_nutritionCache ?? { todayLogs: [], weekData: [], pantryItems: [], pantryCount: 0, expiringCount: 0 }), monthData: result };
    } finally { fetchingMonth.current = false; if (isMountedRef.current) setMonthLoading(false); }
  }, []);

  const fetchPantry = useCallback(async () => {
    if (fetchingPantry.current) return;
    fetchingPantry.current = true;
    try {
      const { session } = useAuthStore.getState();
      if (!session) return;
      const { data } = await supabase.from('pantry_items').select('name, category, expiry_date');
      if (!data || !isMountedRef.current) return;
      const items = data as PantryHint[];
      const expiring = items.filter(item => { const { status } = getExpiryStatus(item.expiry_date); return status === 'warning' || status === 'danger'; }).length;
      _nutritionCache = { ...(_nutritionCache ?? { todayLogs: [], weekData: [], monthData: [] }), pantryItems: items, pantryCount: items.length, expiringCount: expiring };
    } finally { fetchingPantry.current = false; }
  }, []);

  useEffect(() => {
    const bg = !!_nutritionCache;
    fetchToday(bg); fetchWeek(bg); fetchMonth(bg); fetchPantry();
  }, []);

  useEffect(() => {
    if (timeframe === 'today') fetchToday(true);
    if (timeframe === 'week')  fetchWeek(true);
    if (timeframe === 'month') fetchMonth(true);
  }, [timeframe]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchToday(true); fetchPantry();
        if (timeframe === 'week')  fetchWeek(true);
        if (timeframe === 'month') fetchMonth(true);
      }, 1200);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); if (timer) clearTimeout(timer); };
  }, [fetchToday, fetchWeek, fetchMonth, fetchPantry, timeframe]);

  const currentLoading = timeframe === 'today' ? todayLoading : timeframe === 'week' ? weekLoading : monthLoading;
  if (!profile) return null;

  const today = new Date();
  const dateLabel = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="pageWrapper" style={{ paddingBottom: 40, gap: 20 }}>

      {/* ── Page header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--acc)', letterSpacing: '-0.01em' }}>
            Analysis
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--txt2)', maxWidth: 440, lineHeight: 1.6 }}>
            Your daily metabolic review. Metrics are currently tracking
            {todayLogs.length > 0 ? ' and being analysed in real time.' : ' — log a meal to begin.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Timeframe switcher */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, overflow: 'hidden', backdropFilter: 'blur(12px)' }}>
            {(['today', 'week', 'month'] as Timeframe[]).map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} style={{
                padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: timeframe === tf ? 'var(--acc)' : 'transparent',
                color: timeframe === tf ? '#0A0A0A' : 'var(--txt2)',
                transition: 'all .15s',
              }}>
                {tf === 'today' ? 'Today' : tf === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          {/* Date badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10, backdropFilter: 'blur(12px)',
          }}>
            <span style={{ fontSize: 13 }}>📅</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
              {timeframe === 'today' ? `Today, ${dateLabel}` : timeframe === 'week' ? 'This Week' : 'This Month'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {currentLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
          <div style={{ width: 32, height: 32, borderRadius: 999, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--acc)' }} className="animate-spin" />
        </div>
      ) : todayError && timeframe === 'today' ? (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{todayError}</p>
          <button onClick={() => fetchToday(false)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'var(--txt)', cursor: 'pointer', fontSize: 13 }}>
            Retry
          </button>
        </div>
      ) : (
        <>
          {timeframe === 'today' && (
            <>
              <TodayView logs={todayLogs} calorieGoal={calorieGoal} macroGoals={macroGoals} />
              {/* 7-day consistency using real week data */}
              {weekData.length > 0 && (
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>7-Day Consistency</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 18 }}>Calories vs goal per day</div>
                  <ConsistencyChart weekData={weekData} calorieGoal={calorieGoal} />
                </div>
              )}
            </>
          )}
          {timeframe === 'week'  && <WeekView  weekData={weekData}   calorieGoal={calorieGoal} macroGoals={macroGoals} />}
          {timeframe === 'month' && <MonthView monthData={monthData} calorieGoal={calorieGoal} macroGoals={macroGoals} />}
        </>
      )}
    </div>
  );
}
