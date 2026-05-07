import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { calcMacroGoals, getExpiryStatus, formatTime } from '@preppal/utils';
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

interface Insight { type: 'warning' | 'success' | 'info'; message: string; }

interface NutritionScore {
  score: number; grade: string; gradeColor: string; tagline: string;
  bestMacro: string; biggestGap: string;
}

interface PantryHint { name: string; category: string; expiry_date: string | null; }

// ── Constants ──────────────────────────────────────────────────────────────────

const MEAL_TYPE_COLORS: Record<MealType, string> = {
  Breakfast: '#F59E0B', Lunch: '#3B82F6', Dinner: '#8B5CF6', Snack: '#22C55E',
};
const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Snack: '🍎',
};
const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const MACRO_INFO: Record<string, { color: string; why: string; lowRec: string; highRec: string }> = {
  Protein: {
    color: '#3B82F6',
    why: 'Repairs muscle, controls hunger, and stabilises blood sugar.',
    lowRec: 'Add eggs, chicken, fish, Greek yogurt, or legumes to your next meal.',
    highRec: 'Great protein intake — keeps muscle and satiety on point.',
  },
  Carbs: {
    color: '#F59E0B',
    why: 'Primary fuel for brain and muscles. Quality matters more than quantity.',
    lowRec: 'Add oats, rice, fruit, or sweet potato for sustained energy.',
    highRec: 'Carbs are elevated. Opt for fibre-rich carbs and pair with protein.',
  },
  Fat: {
    color: '#F97316',
    why: 'Essential for hormones, brain function, and absorbing fat-soluble vitamins.',
    lowRec: 'Add avocado, nuts, olive oil, or fatty fish for essential fats.',
    highRec: 'Watch for hidden fats in sauces, cheese, and fried foods.',
  },
};

const STATUS_MAP: Record<MacroStatus, { label: string; color: string; bg: string }> = {
  low:      { label: 'Low',      color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  balanced: { label: 'On Track', color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  high:     { label: 'High',     color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
};

const PROTEIN_CATS = new Set(['protein', 'dairy']);
const PRODUCE_CATS = new Set(['produce']);

const EDU_CARDS = [
  { icon: '🥩', title: 'Why protein matters', body: 'Protein repairs muscle, keeps you full longer, and has the highest thermic effect — your body burns more calories digesting it than any other macro.' },
  { icon: '⚖️', title: 'What balanced macros look like', body: 'A balanced meal: ~25–35% calories from protein, 40–50% from carbs, 20–30% from fat. This shifts based on your goal (cutting, bulking, maintaining).' },
  { icon: '🔢', title: 'How to read your calorie goal', body: 'Your goal is your TDEE — eat at it to maintain, below to lose, above to gain. Even being within 10% is a great result.' },
  { icon: '🚫', title: 'Why under-eating hurts progress', body: 'Eating too little slows your metabolism, breaks down muscle, and tanks energy levels — the opposite of what most people want from a deficit.' },
  { icon: '🌿', title: 'The role of carbs', body: 'Carbs fuel workouts and brain function. Quality matters more than quantity — whole grains, fruit, and veg beat ultra-processed carbs every time.' },
];

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
  const grade      = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Fair' : 'Needs Work';
  const gradeColor = score >= 90 ? '#22C55E'   : score >= 75 ? '#C8FF00' : score >= 55 ? '#F59E0B' : '#EF4444';

  const macros = [
    { name: 'Protein', pct: protPct },
    { name: 'Carbs',   pct: carbs / (carbGoal || 1) },
    { name: 'Fat',     pct: fat   / (fatGoal  || 1) },
  ];
  const closest  = macros.reduce((a, b) => Math.abs(a.pct - 1) <= Math.abs(b.pct - 1) ? a : b);
  const farthest = macros.reduce((a, b) => Math.abs(a.pct - 1) >= Math.abs(b.pct - 1) ? a : b);

  let tagline = '';
  if      (score >= 90)                        tagline = 'Outstanding nutrition today. Keep it up!';
  else if (score >= 75)                        tagline = `Good calorie control${protPct < 0.8 ? ', but protein is a bit low.' : '.'}`;
  else if (calPct > 1.1 && protPct < 0.7)     tagline = 'Over on calories and low on protein. Adjust your next meal.';
  else if (calPct > 1.1)                       tagline = "You've exceeded your calorie goal. Consider a lighter next meal.";
  else if (protPct < 0.5)                      tagline = 'Protein is the main gap today. Add a protein-rich meal.';
  else                                         tagline = 'Room to improve — check the insights below.';

  return { score, grade, gradeColor, tagline, bestMacro: closest.name, biggestGap: farthest.name };
}

function getMealImpact(meal: MealLog, dailyCalGoal: number): { label: string; color: string; bg: string; explanation: string } {
  const calPct       = meal.calories / (dailyCalGoal || 1);
  const proteinPerCal = meal.protein_g / (meal.calories || 1);
  const carbCals     = meal.carbs_g * 4;
  const protCals     = meal.protein_g * 4;

  if (proteinPerCal > 0.12 && meal.protein_g > 20)
    return { label: 'High Protein', color: '#3B82F6', bg: 'rgba(59,130,246,0.1)',
      explanation: `${Math.round(meal.protein_g)}g protein — solid contribution toward your daily target.` };
  if (calPct > 0.35)
    return { label: 'Calorie Dense', color: '#EF4444', bg: 'rgba(239,68,68,0.1)',
      explanation: `Uses ${Math.round(calPct * 100)}% of your daily calories. Plan lighter meals around it.` };
  if (carbCals > protCals * 2.5 && meal.carbs_g > 30)
    return { label: 'Carb Heavy', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',
      explanation: `High in carbs relative to protein. Good for energy — pair with protein next time.` };
  if (meal.calories > 200 && Math.abs(protCals - carbCals) / (meal.calories || 1) < 0.15)
    return { label: 'Balanced', color: '#22C55E', bg: 'rgba(34,197,94,0.1)',
      explanation: `Good macro balance. Protein and carbs are well-proportioned.` };
  if (meal.calories < 200)
    return { label: 'Light', color: 'var(--txt3)', bg: 'rgba(255,255,255,0.05)',
      explanation: `Low-calorie meal. Good as a snack — add protein to improve satiety.` };
  return { label: 'Mixed', color: 'var(--txt2)', bg: 'rgba(255,255,255,0.06)',
    explanation: `Moderate macros. Adding more protein would improve the nutritional value.` };
}

function getGoalRecs(fitnessGoal: string): Array<{ icon: string; title: string; body: string }> {
  const g = (fitnessGoal ?? '').toLowerCase();
  if (g === 'cutting') return [
    { icon: '🎯', title: 'Hit protein first', body: 'Prioritise protein at every meal to preserve muscle while in a calorie deficit.' },
    { icon: '🥗', title: 'Volume eating', body: 'High-volume, low-calorie foods (veg, lean meats) keep you full without the calories.' },
    { icon: '⏱️', title: 'Track everything', body: 'Sauces, oils, and drinks add up fast. Measure and log even the small stuff.' },
  ];
  if (g === 'bulking') return [
    { icon: '📈', title: 'Hit your surplus', body: 'Eat 200–400 kcal above goal consistently to fuel muscle growth without excess fat gain.' },
    { icon: '🍚', title: 'Calorie-dense foods', body: 'Nuts, olive oil, oats, and rice increase calories without overeating volume.' },
    { icon: '⏰', title: 'Eat frequently', body: 'Spread meals every 3–4 hours. Consistent protein flow maximises muscle protein synthesis.' },
  ];
  return [
    { icon: '⚖️', title: 'Consistency wins', body: 'Hitting within 10% of your goal daily beats any single perfect day.' },
    { icon: '🔄', title: 'Balanced macros', body: 'Protein for muscle, carbs for energy, fat for satiety and hormones — all matter.' },
    { icon: '📊', title: 'Watch weekly averages', body: 'Daily swings are normal. Focus on your 7-day average to see the real trend.' },
  ];
}

function buildInsights(
  calories: number, calorieGoal: number,
  protein: number, proteinGoal: number,
  carbs: number, fat: number, fatGoal: number,
  logs: MealLog[]
): Insight[] {
  if (logs.length === 0) return [{ type: 'info', message: 'No meals logged today. Log your first meal to start tracking.' }];

  const insights: Insight[] = [];
  const hour    = new Date().getHours();
  const calPct  = calories  / (calorieGoal  || 1);
  const protPct = protein   / (proteinGoal  || 1);
  const fatPct  = fat       / (fatGoal      || 1);

  if (calPct > 1.2)
    insights.push({ type: 'warning', message: `You're ${Math.round(calories - calorieGoal)} kcal over your daily goal. Consider a lighter next meal.` });
  else if (hour >= 18 && calPct < 0.5)
    insights.push({ type: 'info', message: `Only ${Math.round(calPct * 100)}% of your calorie goal reached by evening. You may be under-eating.` });
  else if (calPct < 0.4 && hour >= 14)
    insights.push({ type: 'warning', message: `Under-eating can slow metabolism. You still have ${Math.round(calorieGoal - calories)} kcal to hit your goal.` });

  if (protPct < 0.5)
    insights.push({ type: 'warning', message: `Protein is very low — only ${Math.round(protein)}g of ${proteinGoal}g goal. Add chicken, eggs, or Greek yogurt.` });
  else if (protPct < 0.75)
    insights.push({ type: 'info', message: `Protein at ${Math.round(protPct * 100)}% of goal. ${Math.round(proteinGoal - protein)}g remaining.` });

  if (fatPct < 0.4)
    insights.push({ type: 'info', message: 'Fat intake is quite low. Healthy fats (avocado, nuts, olive oil) support hormones and satiety.' });
  else if (fatPct > 1.5)
    insights.push({ type: 'warning', message: 'High fat intake today. Check for hidden sources like sauces, cheese, or fried foods.' });

  if (calories > 0 && (carbs * 4) / calories > 0.6)
    insights.push({ type: 'info', message: 'Carbs are making up over 60% of your calories today. Balance with more protein.' });

  const dinnerLogs = logs.filter(m => getMealType(m.eaten_at) === 'Dinner');
  const dinnerCals = dinnerLogs.reduce((s, m) => s + m.calories, 0);
  if (calories > 0 && dinnerCals / calories > 0.5 && dinnerLogs.length > 0)
    insights.push({ type: 'info', message: `Dinner is ${Math.round(dinnerCals / calories * 100)}% of your calories today. Try shifting more to breakfast and lunch.` });

  if (insights.length === 0)
    insights.push({ type: 'success', message: protPct >= 0.9 ? "On track with both calories and protein today. Great work!" : "Calories are on track. Keep logging to hit your protein target." });

  return insights;
}

// ── Base Components ────────────────────────────────────────────────────────────

function Chip({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.5px', padding: '3px 8px', borderRadius: 4, color, background: bg, textTransform: 'uppercase', display: 'inline-block', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '.8px', textTransform: 'uppercase', marginBottom: 14 }}>{children}</h3>;
}

function Card({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: React.CSSProperties }) {
  return (
    <motion.div
      className="card"
      style={{ padding: 20, ...style }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--txt3)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
      <p style={{ fontSize: 14 }}>{message}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 24px' }}>
      <div style={{ width: 32, height: 32, borderRadius: 999, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--acc)' }} className="animate-spin" />
    </div>
  );
}

function ChartCard({ title, subtitle, children, delay = 0 }: { title: string; subtitle?: string; children: React.ReactNode; delay?: number }) {
  return (
    <Card delay={delay}>
      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

// ── Score Card ─────────────────────────────────────────────────────────────────

function NutritionScoreCard({ score, grade, gradeColor, tagline, bestMacro, biggestGap, calorieGoal, consumed }: NutritionScore & { calorieGoal: number; consumed: number }) {
  const calPct = Math.round(Math.min(consumed / (calorieGoal || 1), 1.5) * 100);
  return (
    <motion.div
      className="card"
      style={{ padding: 24, position: 'relative', overflow: 'hidden' }}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div style={{ position: 'absolute', top: -60, right: -60, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${gradeColor}14 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>Nutrition Score</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontFamily: 'var(--fd)', fontSize: 64, lineHeight: 1, color: gradeColor }}>{score}</span>
            <span style={{ fontSize: 20, color: 'var(--txt3)' }}>/100</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <Chip label={grade} color={gradeColor} bg={`${gradeColor}18`} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <p style={{ fontSize: 14, color: 'var(--txt)', lineHeight: 1.65, marginBottom: 16 }}>{tagline}</p>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginBottom: 16 }}>
            <motion.div style={{ height: '100%', borderRadius: 3, backgroundColor: gradeColor }} initial={{ width: '0%' }} animate={{ width: `${score}%` }} transition={{ delay: 0.3, duration: 1.0, ease: [0.16, 1, 0.3, 1] }} />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Best today', value: bestMacro, color: 'var(--acc)' },
              { label: 'Biggest gap', value: biggestGap, color: '#EF4444' },
              { label: 'Calorie goal', value: `${calPct}%`, color: calPct >= 100 ? '#EF4444' : 'var(--acc)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '7px 13px', background: 'var(--surf2)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--txt3)' }}>{s.label}: </span>
                <span style={{ color: s.color, fontWeight: 700 }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Macro Quality Cards ────────────────────────────────────────────────────────

function MacroQualityCard({ name, value, goal, delay }: { name: string; value: number; goal: number; delay: number }) {
  const info   = MACRO_INFO[name];
  const status = getMacroStatus(value, goal);
  const st     = STATUS_MAP[status];
  const pct    = Math.min(value / (goal || 1), 1.2) * 100;

  return (
    <motion.div style={{ padding: 18, background: 'var(--surf2)', borderRadius: 'var(--rad)', border: `1px solid var(--bdr)` }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: info.color }}>{name}</span>
        <Chip label={st.label} color={st.color} bg={st.bg} />
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--fd)', fontSize: 30, color: 'var(--txt)', lineHeight: 1 }}>{Math.round(value)}</span>
        <span style={{ fontSize: 12, color: 'var(--txt3)' }}>g&nbsp;/&nbsp;{goal}g</span>
      </div>

      <div style={{ height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
        <motion.div style={{ height: '100%', borderRadius: 3, backgroundColor: status === 'balanced' ? info.color : st.color }} initial={{ width: '0%' }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ delay: delay + 0.2, duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
      </div>

      <p style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8, lineHeight: 1.55, fontStyle: 'italic' }}>{info.why}</p>
      <p style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.55 }}>{status === 'low' ? info.lowRec : info.highRec}</p>
    </motion.div>
  );
}

// ── Calorie Distribution ───────────────────────────────────────────────────────

function CalorieDistributionCard({ logs, delay }: { logs: MealLog[]; calorieGoal?: number; delay: number }) {
  const byType: Record<MealType, number> = { Breakfast: 0, Lunch: 0, Dinner: 0, Snack: 0 };
  for (const m of logs) byType[getMealType(m.eaten_at)] += m.calories;
  const total    = Object.values(byType).reduce((s, v) => s + v, 0);
  const dinnerPct = total > 0 ? byType.Dinner / total : 0;

  if (total === 0) return null;

  return (
    <Card delay={delay}>
      <SecTitle>Calorie Distribution</SecTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {MEAL_ORDER.map(type => {
          const cals = byType[type];
          const pct  = total > 0 ? (cals / total) * 100 : 0;
          return (
            <div key={type}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {MEAL_ICONS[type]} {type}
                </span>
                <span style={{ fontSize: 12, color: cals > 0 ? 'var(--txt2)' : 'var(--txt3)', fontVariantNumeric: 'tabular-nums' }}>
                  {cals > 0 ? `${cals} kcal · ${Math.round(pct)}%` : '—'}
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <motion.div style={{ height: '100%', backgroundColor: MEAL_TYPE_COLORS[type], borderRadius: 3 }} initial={{ width: '0%' }} animate={{ width: `${pct}%` }} transition={{ delay: delay + 0.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
              </div>
            </div>
          );
        })}
      </div>
      {dinnerPct > 0.5 && (
        <div style={{ marginTop: 14, padding: '10px 13px', background: 'rgba(245,158,11,0.07)', borderLeft: '3px solid #F59E0B', borderRadius: '0 8px 8px 0', fontSize: 12, color: 'var(--txt2)', lineHeight: 1.5 }}>
          ⚠️ Dinner is {Math.round(dinnerPct * 100)}% of your calories. Try shifting more to breakfast and lunch.
        </div>
      )}
    </Card>
  );
}

// ── Meal Impact ────────────────────────────────────────────────────────────────

function MealImpactSection({ logs, calorieGoal, delay }: { logs: MealLog[]; calorieGoal: number; delay: number }) {
  if (logs.length === 0) return null;
  return (
    <Card delay={delay}>
      <SecTitle>Meal Impact Analysis</SecTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {logs.map(meal => {
          const impact = getMealImpact(meal, calorieGoal);
          const type   = getMealType(meal.eaten_at);
          return (
            <div key={meal.id} style={{ padding: '14px 16px', background: 'var(--surf2)', borderRadius: 'var(--rad)', borderLeft: `3px solid ${MEAL_TYPE_COLORS[type]}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{meal.meal_name}</span>
                    <Chip label={impact.label} color={impact.color} bg={impact.bg} />
                    {meal.claude_suggestion && <Chip label="AI" color="var(--acc)" bg="rgba(200,255,0,0.12)" />}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{MEAL_ICONS[type]} {type} · {formatTime(meal.eaten_at)}</span>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--fd)', fontSize: 22, color: 'var(--txt)' }}>{meal.calories}</span>
                  <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 2 }}>kcal</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                {[{ l: 'P', v: meal.protein_g, c: '#3B82F6' }, { l: 'C', v: meal.carbs_g, c: '#F59E0B' }, { l: 'F', v: meal.fat_g, c: '#F97316' }].map(m => (
                  <span key={m.l} style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', borderRadius: 4, color: m.c, fontWeight: 600 }}>
                    {m.l} {Math.round(m.v)}g
                  </span>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5, margin: 0 }}>{impact.explanation}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Insights Panel ─────────────────────────────────────────────────────────────

function InsightsPanelSection({ insights, delay }: { insights: Insight[]; delay: number }) {
  const map = {
    warning: { border: '#F59E0B', bg: 'rgba(245,158,11,0.07)', icon: '⚠️' },
    success: { border: '#22C55E', bg: 'rgba(34,197,94,0.07)',  icon: '✅' },
    info:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.07)', icon: '💡' },
  };
  return (
    <Card delay={delay}>
      <SecTitle>⚡ Insights</SecTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {insights.map((ins, i) => {
          const c = map[ins.type];
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: '0 10px 10px 0' }}>
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
              <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.55 }}>{ins.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Goal Recommendations ───────────────────────────────────────────────────────

function GoalRecommendationsSection({ fitnessGoal, delay }: { fitnessGoal: string; delay: number }) {
  const recs      = getGoalRecs(fitnessGoal);
  const goalLabel = (fitnessGoal ?? 'Maintaining');
  return (
    <Card delay={delay}>
      <SecTitle>Goal Plan · {goalLabel}</SecTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recs.map((rec, i) => (
          <div key={i} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', padding: '13px 15px', background: 'var(--surf2)', borderRadius: 'var(--rad)' }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{rec.icon}</span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', marginBottom: 3 }}>{rec.title}</p>
              <p style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.55 }}>{rec.body}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Pantry × Nutrition ─────────────────────────────────────────────────────────

function PantryNutritionSection({ pantryItems, pantryCount, expiringCount, proteinGoalMet, delay }: {
  pantryItems: PantryHint[]; pantryCount: number; expiringCount: number; proteinGoalMet: boolean; delay: number;
}) {
  const proteinSources = pantryItems.filter(i => PROTEIN_CATS.has(i.category));
  const produceSources = pantryItems.filter(i => PRODUCE_CATS.has(i.category));
  const expiring       = pantryItems.filter(i => { if (!i.expiry_date) return false; const { status } = getExpiryStatus(i.expiry_date); return status === 'warning' || status === 'danger'; });

  const hints: Array<{ icon: string; text: string; color: string }> = [];

  if (pantryCount === 0) {
    hints.push({ icon: '📦', text: 'No pantry items yet. Add items to get personalised nutrition suggestions.', color: 'var(--txt3)' });
  } else {
    if (proteinSources.length > 0)
      hints.push({ icon: '💪', text: `${proteinSources.length} protein source${proteinSources.length > 1 ? 's' : ''} available: ${proteinSources.slice(0, 3).map(i => i.name).join(', ')}.`, color: '#3B82F6' });
    if (!proteinGoalMet && proteinSources.length > 0)
      hints.push({ icon: '🎯', text: `Use ${proteinSources[0].name} in your next meal to close the protein gap.`, color: 'var(--acc)' });
    if (produceSources.length > 0)
      hints.push({ icon: '🥗', text: `${produceSources.slice(0, 2).map(i => i.name).join(' and ')} can add fibre and micronutrients to any meal.`, color: '#22C55E' });
    if (proteinSources.length === 0)
      hints.push({ icon: '⚠️', text: 'No protein-friendly pantry items. Consider stocking chicken, eggs, or Greek yogurt.', color: '#F59E0B' });
    if (expiring.length > 0)
      hints.push({ icon: '⏰', text: `${expiring[0].name} is expiring soon — use it in your next meal to avoid waste.`, color: '#EF4444' });
  }

  return (
    <Card delay={delay}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt3)', letterSpacing: '.8px', textTransform: 'uppercase' }}>🥦 Pantry × Nutrition</span>
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{pantryCount} items · {expiringCount} expiring</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {hints.map((hint, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 13px', background: 'var(--surf2)', borderRadius: 8 }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{hint.icon}</span>
            <span style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>{hint.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Educational Micro-Cards ────────────────────────────────────────────────────

function EducationalMicroCards({ delay }: { delay: number }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay }}>
      <SecTitle>Learn</SecTitle>
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
        {EDU_CARDS.map((card, i) => (
          <div key={i} style={{ minWidth: 220, maxWidth: 220, padding: '16px 18px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 'var(--rad)', flexShrink: 0 }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{card.icon}</div>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>{card.title}</p>
            <p style={{ fontSize: 12, color: 'var(--txt3)', lineHeight: 1.6 }}>{card.body}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Today View ─────────────────────────────────────────────────────────────────

function TodayView({ logs, calorieGoal, macroGoals, pantryItems, pantryCount, expiringCount, fitnessGoal }: {
  logs: MealLog[]; calorieGoal: number; macroGoals: { protein: number; carbs: number; fat: number };
  pantryItems: PantryHint[]; pantryCount: number; expiringCount: number; fitnessGoal: string;
}) {
  const calories = logs.reduce((s, m) => s + m.calories, 0);
  const protein  = logs.reduce((s, m) => s + Number(m.protein_g), 0);
  const carbs    = logs.reduce((s, m) => s + Number(m.carbs_g), 0);
  const fat      = logs.reduce((s, m) => s + Number(m.fat_g), 0);

  const score        = calcNutritionScore(calories, calorieGoal, protein, macroGoals.protein, carbs, macroGoals.carbs, fat, macroGoals.fat, logs.length);
  const insights     = buildInsights(calories, calorieGoal, protein, macroGoals.protein, carbs, fat, macroGoals.fat, logs);
  const proteinGoalMet = protein >= macroGoals.protein * 0.9;

  return (
    <div className="grid grid-cols-1 gap-[18px] xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      {/* Main column — analytics (Learn is last row, full width, so nothing sits under it) */}
      <div className="stackSm min-w-0">
        <NutritionScoreCard {...score} calorieGoal={calorieGoal} consumed={calories} />

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
          <SecTitle>Macro Quality</SecTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <MacroQualityCard name="Protein" value={protein} goal={macroGoals.protein} delay={0.10} />
            <MacroQualityCard name="Carbs"   value={carbs}   goal={macroGoals.carbs}   delay={0.15} />
            <MacroQualityCard name="Fat"     value={fat}     goal={macroGoals.fat}     delay={0.20} />
          </div>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <CalorieDistributionCard logs={logs} calorieGoal={calorieGoal} delay={0.26} />
          <GoalRecommendationsSection fitnessGoal={fitnessGoal} delay={0.28} />
        </div>

        <MealImpactSection logs={logs} calorieGoal={calorieGoal} delay={0.30} />
      </div>

      <aside className="stackSm min-w-0 xl:max-w-[320px]" aria-label="Insights and pantry">
        <InsightsPanelSection insights={insights} delay={0.22} />
        <PantryNutritionSection pantryItems={pantryItems} pantryCount={pantryCount} expiringCount={expiringCount} proteinGoalMet={proteinGoalMet} delay={0.33} />
      </aside>

      {/* Full-width footer row — nothing below this */}
      <div className="min-w-0 xl:col-span-2">
        <EducationalMicroCards delay={0.36} />
      </div>
    </div>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ weekData, calorieGoal, macroGoals }: { weekData: DayData[]; calorieGoal: number; macroGoals: { protein: number; carbs: number; fat: number } }) {
  const tracked = weekData.filter(d => d.calories > 0);
  if (tracked.length === 0) return <EmptyState message="No meals logged this week yet. Start tracking to see your trends." />;

  const avgCalories = Math.round(tracked.reduce((s, d) => s + d.calories, 0) / tracked.length);
  const avgProtein  = Math.round(tracked.reduce((s, d) => s + d.protein,  0) / tracked.length);
  const avgCarbs    = Math.round(tracked.reduce((s, d) => s + d.carbs,    0) / tracked.length);
  const avgFat      = Math.round(tracked.reduce((s, d) => s + d.fat,      0) / tracked.length);
  const adherent    = tracked.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(tracked.length, 1)) * 100);
  const bestDay     = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) <= Math.abs(b.calories - calorieGoal) ? a : b);
  const worstDay    = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) >= Math.abs(b.calories - calorieGoal) ? a : b);

  let trendInsight = '';
  if (tracked.length >= 4) {
    const half = Math.floor(tracked.length / 2);
    const firstAvg  = tracked.slice(0, half).reduce((s, d) => s + d.calories, 0) / half;
    const secondAvg = tracked.slice(half).reduce((s, d) => s + d.calories, 0) / (tracked.length - half);
    const diff = secondAvg - firstAvg;
    if      (diff >  150) trendInsight = 'Calories are trending up this week. Keep an eye on portion sizes.';
    else if (diff < -150) trendInsight = "Calories are trending down. Make sure you're not under-eating.";
    else                  trendInsight = 'Calorie intake has been consistent this week. Good stability!';
  }

  const calChartData = weekData.map(d => ({ ...d, target: calorieGoal }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Stats */}
      <motion.div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {[
          { label: 'Avg Calories',   value: avgCalories.toLocaleString(), unit: 'kcal', color: 'var(--acc)' },
          { label: 'Avg Protein',    value: String(avgProtein), unit: 'g', color: '#3B82F6' },
          { label: 'Goal Adherence', value: `${adherencePct}%`, unit: '', color: adherencePct >= 70 ? '#22C55E' : '#F59E0B' },
          { label: 'Days Tracked',   value: `${tracked.length}/7`, unit: '', color: 'var(--txt)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', background: 'var(--surf2)', borderRadius: 'var(--rad)', border: '1px solid var(--bdr)' }}>
            <p style={{ fontSize: 11, color: 'var(--txt3)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: 'var(--fd)', fontSize: 26, color: s.color, lineHeight: 1 }}>{s.value}</span>
              {s.unit && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </motion.div>

      {/* Trend insight */}
      {trendInsight && (
        <motion.div style={{ padding: '12px 16px', background: 'rgba(59,130,246,0.07)', borderLeft: '3px solid #3B82F6', borderRadius: '0 10px 10px 0', fontSize: 13, color: 'var(--txt)', lineHeight: 1.55 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}>
          💡 {trendInsight}
        </motion.div>
      )}

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <ChartCard title="Daily Calories" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day`} delay={0.1}>
          <PrepBarChart data={calChartData} dataKey="calories" xKey="day" secondDataKey="target" secondColor="rgba(255,255,255,0.05)" color="#C8FF00" unit=" kcal" height={180} />
        </ChartCard>
        <ChartCard title="Daily Protein" subtitle={`Goal: ${macroGoals.protein}g/day`} delay={0.15}>
          <PrepAreaChart data={weekData} dataKey="protein" xKey="day" color="#3B82F6" unit="g" referenceValue={macroGoals.protein} height={180} />
        </ChartCard>
      </div>

      {/* Best / Worst */}
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

      {/* Macro averages */}
      <Card delay={0.2}>
        <SecTitle>Average Macro Breakdown</SecTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Avg Protein', avg: avgProtein, goal: macroGoals.protein, color: '#3B82F6' },
            { label: 'Avg Carbs',   avg: avgCarbs,   goal: macroGoals.carbs,   color: '#F59E0B' },
            { label: 'Avg Fat',     avg: avgFat,     goal: macroGoals.fat,     color: '#F97316' },
          ].map(m => (
            <div key={m.label} style={{ padding: 14, background: 'var(--surf2)', borderRadius: 'var(--rad)' }}>
              <p style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8 }}>{m.label}</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--fd)', fontSize: 24, color: m.color }}>{m.avg}</span>
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>g</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(m.avg / m.goal, 1) * 100}%`, backgroundColor: m.color, borderRadius: 2 }} />
              </div>
              <p style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 5 }}>goal: {m.goal}g</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

function MonthView({ monthData, calorieGoal, macroGoals }: { monthData: DayData[]; calorieGoal: number; macroGoals: { protein: number; carbs: number; fat: number } }) {
  const tracked = monthData.filter(d => d.calories > 0);
  if (tracked.length === 0) return <EmptyState message="No meals logged this month yet. Start tracking to see your trends." />;

  const avgCalories  = Math.round(tracked.reduce((s, d) => s + d.calories, 0) / tracked.length);
  const avgProtein   = Math.round(tracked.reduce((s, d) => s + d.protein,  0) / tracked.length);
  const adherent     = tracked.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(tracked.length, 1)) * 100);
  const totalLogged  = tracked.reduce((s, d) => s + d.calories, 0);
  const bestDay      = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) <= Math.abs(b.calories - calorieGoal) ? a : b);
  const worstDay     = tracked.reduce((a, b) => Math.abs(a.calories - calorieGoal) >= Math.abs(b.calories - calorieGoal) ? a : b);

  const protAdherent    = tracked.filter(d => d.protein >= macroGoals.protein * 0.9).length;
  const protAdherencePct = Math.round((protAdherent / Math.max(tracked.length, 1)) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <motion.div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {[
          { label: 'Avg Calories',    value: avgCalories.toLocaleString(), unit: 'kcal', color: 'var(--acc)' },
          { label: 'Avg Protein',     value: String(avgProtein), unit: 'g', color: '#3B82F6' },
          { label: 'Cal Adherence',   value: `${adherencePct}%`,    unit: '', color: adherencePct >= 70 ? '#22C55E' : '#F59E0B' },
          { label: 'Protein Days',    value: `${protAdherencePct}%`, unit: '', color: protAdherencePct >= 70 ? '#22C55E' : '#F59E0B' },
          { label: 'Days Logged',     value: String(tracked.length), unit: '', color: 'var(--txt)' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 16px', background: 'var(--surf2)', borderRadius: 'var(--rad)', border: '1px solid var(--bdr)' }}>
            <p style={{ fontSize: 11, color: 'var(--txt3)', letterSpacing: '.4px', textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: 'var(--fd)', fontSize: 26, color: s.color, lineHeight: 1 }}>{s.value}</span>
              {s.unit && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.unit}</span>}
            </div>
          </div>
        ))}
      </motion.div>

      <ChartCard title="Monthly Calorie Trend" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day · ${monthData.length} days`} delay={0.08}>
        <PrepAreaChart data={monthData} dataKey="calories" xKey="day" color="#C8FF00" unit=" kcal" referenceValue={calorieGoal} height={200} />
      </ChartCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <ChartCard title="Monthly Protein Trend" subtitle={`Goal: ${macroGoals.protein}g/day`} delay={0.12}>
          <PrepAreaChart data={monthData} dataKey="protein" xKey="day" color="#3B82F6" unit="g" referenceValue={macroGoals.protein} height={160} />
        </ChartCard>

        <Card delay={0.15}>
          <SecTitle>Monthly Summary</SecTitle>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { label: 'Total calories logged',  value: totalLogged.toLocaleString(), unit: 'kcal' },
              { label: 'Avg calories / day',     value: avgCalories.toLocaleString(), unit: 'kcal' },
              { label: 'Avg protein / day',      value: String(avgProtein), unit: 'g' },
              { label: 'Days on calorie target', value: `${adherent} / ${tracked.length}`, unit: '' },
              { label: 'Days hitting protein',   value: `${protAdherent} / ${tracked.length}`, unit: '' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}{item.unit ? <span style={{ color: 'var(--txt3)', fontWeight: 400 }}> {item.unit}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ padding: '16px 18px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 'var(--rad)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>Best Day</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>Day {bestDay.day}</p>
          <p style={{ fontSize: 12, color: 'var(--txt3)' }}>{bestDay.calories.toLocaleString()} kcal · {Math.round(Math.abs(bestDay.calories - calorieGoal))} kcal from goal</p>
        </div>
        <div style={{ padding: '16px 18px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--rad)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', letterSpacing: '.6px', textTransform: 'uppercase', marginBottom: 6 }}>Most Off-Track</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}>Day {worstDay.day}</p>
          <p style={{ fontSize: 12, color: 'var(--txt3)' }}>{worstDay.calories.toLocaleString()} kcal · {Math.round(Math.abs(worstDay.calories - calorieGoal))} kcal from goal</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function NutritionPage() {
  const { profile } = useAuthStore();
  const [timeframe, setTimeframe] = useState<Timeframe>('today');

  const [todayLogs,     setTodayLogs]     = useState<MealLog[]>([]);
  const [weekData,      setWeekData]      = useState<DayData[]>([]);
  const [monthData,     setMonthData]     = useState<DayData[]>([]);
  const [pantryItems,   setPantryItems]   = useState<PantryHint[]>([]);
  const [pantryCount,   setPantryCount]   = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);

  const [todayLoading, setTodayLoading] = useState(true);
  const [weekLoading,  setWeekLoading]  = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [todayError,   setTodayError]   = useState<string | null>(null);

  const fetchingToday  = useRef(false);
  const fetchingWeek   = useRef(false);
  const fetchingMonth  = useRef(false);
  const fetchingPantry = useRef(false);

  const macroGoals  = profile ? calcMacroGoals(profile) : { protein: 130, carbs: 200, fat: 60 };
  const calorieGoal = profile?.daily_calorie_goal ?? 2000;
  const fitnessGoal = profile?.fitness_goal ?? 'Maintaining';

  const fetchToday = useCallback(async () => {
    if (fetchingToday.current) return;
    fetchingToday.current = true;
    setTodayLoading(true);
    setTodayError(null);
    try {
      const { data: { session }, error: sErr } = await supabase.auth.getSession();
      if (sErr || !session) throw new Error(sErr?.message ?? 'Your session expired. Please sign in again.');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase.from('meal_logs').select('*').gte('eaten_at', today.toISOString()).order('eaten_at', { ascending: false });
      if (error) throw error;
      setTodayLogs((data as MealLog[]) ?? []);
    } catch (e: unknown) {
      setTodayError((e as Error).message ?? "Failed to load today's meals");
    } finally {
      fetchingToday.current = false;
      setTodayLoading(false);
    }
  }, []);

  const fetchWeek = useCallback(async () => {
    if (fetchingWeek.current) return;
    fetchingWeek.current = true;
    setWeekLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const user = session.user;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const start = new Date(today); start.setDate(start.getDate() - 6);
      const { data } = await supabase.from('meal_logs').select('eaten_at, calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).gte('eaten_at', start.toISOString()).order('eaten_at');
      const days = new Map<string, DayData>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: d.toLocaleDateString(undefined, { weekday: 'short' }), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      setWeekData(aggregateByDay(data ?? [], days));
    } finally { fetchingWeek.current = false; setWeekLoading(false); }
  }, []);

  const fetchMonth = useCallback(async () => {
    if (fetchingMonth.current) return;
    fetchingMonth.current = true;
    setMonthLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const user = session.user;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const { data } = await supabase.from('meal_logs').select('eaten_at, calories, protein_g, carbs_g, fat_g').eq('user_id', user.id).gte('eaten_at', startOfMonth.toISOString()).order('eaten_at');
      const days = new Map<string, DayData>();
      for (let i = 1; i <= now.getDate(); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: String(i), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      setMonthData(aggregateByDay(data ?? [], days));
    } finally { fetchingMonth.current = false; setMonthLoading(false); }
  }, []);

  const fetchPantry = useCallback(async () => {
    if (fetchingPantry.current) return;
    fetchingPantry.current = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.from('pantry_items').select('name, category, expiry_date').eq('user_id', session.user.id);
      if (!data) return;
      setPantryItems(data as PantryHint[]);
      setPantryCount(data.length);
      setExpiringCount(data.filter(item => { const { status } = getExpiryStatus(item.expiry_date); return status === 'warning' || status === 'danger'; }).length);
    } finally { fetchingPantry.current = false; }
  }, []);

  useEffect(() => {
    fetchToday(); fetchWeek(); fetchMonth(); fetchPantry();
  }, []);

  useEffect(() => {
    if (timeframe === 'today') fetchToday();
    if (timeframe === 'week')  fetchWeek();
    if (timeframe === 'month') fetchMonth();
  }, [timeframe]);

  // Re-fetch when tab becomes visible again
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchToday(); fetchPantry();
        if (timeframe === 'week')  fetchWeek();
        if (timeframe === 'month') fetchMonth();
      }, 1200);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); if (timer) clearTimeout(timer); };
  }, [fetchToday, fetchWeek, fetchMonth, fetchPantry, timeframe]);

  const currentLoading = timeframe === 'today' ? todayLoading : timeframe === 'week' ? weekLoading : monthLoading;

  if (!profile) return null;

  return (
    <div className="pageWrapper">
      <div style={{ maxWidth: 1400, margin: '0 auto', width: '100%', paddingBottom: 24 }}>
        {/* Header — poster typography so this route reads as “Nutrition”, not a generic screen */}
        <motion.div className="nutritionPageHero" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <p className="nutritionPageEyebrow">Fuel · macros · habits</p>
          <h1 className="nutritionPageTitle">Nutrition</h1>
          <p className="nutritionPageSubtitle">
            What you’re eating, what it means, and how you can improve.
          </p>
        </motion.div>

        {/* Timeframe tabs */}
        <motion.div
          style={{ display: 'flex', gap: 4, marginBottom: 32, background: 'var(--surf)', padding: 4, borderRadius: 'var(--rad)', width: 'fit-content' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
        >
          {(['today', 'week', 'month'] as Timeframe[]).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '7px 18px',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                transition: 'all 0.15s ease',
                background: timeframe === tf ? 'var(--acc)' : 'transparent',
                color: timeframe === tf ? '#0A0A0A' : 'var(--txt2)',
              }}
            >
              {tf === 'today' ? 'Today' : tf === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </motion.div>

        {/* Content */}
        {currentLoading ? (
          <LoadingSpinner />
        ) : todayError && timeframe === 'today' ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{todayError}</p>
            <button
              onClick={fetchToday}
              style={{ padding: '8px 16px', background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, color: 'var(--txt)', cursor: 'pointer', fontSize: 13 }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {timeframe === 'today' && (
              <TodayView
                logs={todayLogs}
                calorieGoal={calorieGoal}
                macroGoals={macroGoals}
                pantryItems={pantryItems}
                pantryCount={pantryCount}
                expiringCount={expiringCount}
                fitnessGoal={fitnessGoal}
              />
            )}
            {timeframe === 'week' && (
              <WeekView weekData={weekData} calorieGoal={calorieGoal} macroGoals={macroGoals} />
            )}
            {timeframe === 'month' && (
              <MonthView monthData={monthData} calorieGoal={calorieGoal} macroGoals={macroGoals} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
