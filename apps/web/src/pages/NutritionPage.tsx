import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { calcMacroGoals, getExpiryStatus, formatTime } from '@preppal/utils';
import { PrepBarChart, PrepAreaChart } from '../components/ui/AnalyticsChart';
import type { MealLog } from '@preppal/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Timeframe = 'today' | 'week' | 'month';
type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

interface DayData {
  date: string;
  day: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  [key: string]: unknown;
}

interface Insight {
  type: 'warning' | 'success' | 'info';
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMealType(eaten_at: string): MealType {
  const h = new Date(eaten_at).getHours();
  if (h >= 5 && h < 11) return 'Breakfast';
  if (h >= 11 && h < 15) return 'Lunch';
  if (h >= 15 && h < 21) return 'Dinner';
  return 'Snack';
}

const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Snack: '🍎',
};
const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function formatDayKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function aggregateByDay(
  rows: Array<{ eaten_at: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }>,
  days: Map<string, DayData>
): DayData[] {
  for (const row of rows) {
    const key = formatDayKey(new Date(row.eaten_at));
    if (!days.has(key)) continue;
    const cur = days.get(key)!;
    days.set(key, {
      ...cur,
      calories: cur.calories + row.calories,
      protein: cur.protein + Number(row.protein_g),
      carbs: cur.carbs + Number(row.carbs_g),
      fat: cur.fat + Number(row.fat_g),
    });
  }
  return Array.from(days.values());
}

function getTodayInsights(
  calories: number, calorieGoal: number,
  protein: number, proteinGoal: number,
  mealsCount: number
): Insight[] {
  if (mealsCount === 0) {
    return [{ type: 'info', message: 'Log your first meal to start tracking.' }];
  }
  const insights: Insight[] = [];
  const hour = new Date().getHours();

  if (calories > calorieGoal) {
    insights.push({ type: 'warning', message: `You're ${Math.round(calories - calorieGoal)} kcal over your calorie target today.` });
  } else if (hour >= 18 && calories < calorieGoal * 0.5) {
    insights.push({ type: 'info', message: `You may need a filling meal to reach your goal. ${Math.round(calorieGoal - calories)} kcal remaining.` });
  }

  if (protein < proteinGoal * 0.5) {
    insights.push({ type: 'warning', message: `You're behind on protein today. ${Math.round(proteinGoal - protein)}g to go.` });
  }

  if (insights.length === 0) {
    const prot_ok = protein >= proteinGoal * 0.9;
    insights.push({
      type: 'success',
      message: prot_ok
        ? "On track with calories and hitting your protein goal. Great work!"
        : "You're on track today. Keep it up!",
    });
  }
  return insights;
}

// ── Reusable components ────────────────────────────────────────────────────────

function CalorieRing({ consumed, goal }: { consumed: number; goal: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(consumed / goal, 1);
  const offset = circ * (1 - pct);
  const isOver = consumed > goal;
  const color = isOver ? '#EF4444' : '#C8FF00';

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 140, height: 140, flexShrink: 0 }}>
      <svg width={140} height={140} viewBox="0 0 140 140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={12} />
        <motion.circle
          cx={70} cy={70} r={r} fill="none"
          stroke={color} strokeWidth={12} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ delay: 0.2, duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${isOver ? 'rgba(239,68,68,0.4)' : 'rgba(200,255,0,0.35)'})` }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <span style={{ fontFamily: 'var(--fd)', fontSize: 26, lineHeight: 1, color: isOver ? '#EF4444' : 'var(--txt)', letterSpacing: '-0.5px' }}>
          {consumed >= 1000 ? `${(consumed / 1000).toFixed(1)}k` : Math.round(consumed)}
        </span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>of {goal.toLocaleString()}</span>
        <span style={{ fontSize: 10, color: 'var(--txt3)' }}>kcal</span>
      </div>
    </div>
  );
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const pct = Math.min(value / goal, 1) * 100;
  const isOver = value > goal;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 52, fontSize: 12, color: 'var(--txt2)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 3, backgroundColor: isOver ? '#EF4444' : color }}
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span style={{ width: 90, fontSize: 11, color: 'var(--txt3)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {Math.round(value)}g / {goal}g
      </span>
    </div>
  );
}

function InsightRow({ insight }: { insight: Insight }) {
  const map = {
    warning: { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', icon: '⚠️' },
    success: { border: '#22C55E', bg: 'rgba(34,197,94,0.08)', icon: '✅' },
    info:    { border: '#3B82F6', bg: 'rgba(59,130,246,0.08)', icon: '💡' },
  };
  const c = map[insight.type];
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 14px', background: c.bg, borderLeft: `3px solid ${c.border}`, borderRadius: '0 8px 8px 0', marginBottom: 8 }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{c.icon}</span>
      <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.5 }}>{insight.message}</span>
    </div>
  );
}

function StatBlock({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{ padding: '14px 16px', background: 'var(--surf2)', borderRadius: 'var(--rad)' }}>
      <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 6, letterSpacing: '.3px', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--fd)', fontSize: 26, color: color ?? 'var(--txt)', lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{unit}</span>}
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children, delay = 0 }: { title: string; subtitle?: string; children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </motion.div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '64px 24px', color: 'var(--txt3)' }}>
      <div style={{ fontSize: 40, marginBottom: 14 }}>📊</div>
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

// ── Today View ─────────────────────────────────────────────────────────────────

function TodayView({ logs, calorieGoal, macroGoals, pantryCount, expiringCount }: {
  logs: MealLog[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
  pantryCount: number;
  expiringCount: number;
}) {
  const calories = logs.reduce((s, m) => s + m.calories, 0);
  const protein  = logs.reduce((s, m) => s + Number(m.protein_g), 0);
  const carbs    = logs.reduce((s, m) => s + Number(m.carbs_g), 0);
  const fat      = logs.reduce((s, m) => s + Number(m.fat_g), 0);
  const remaining = calorieGoal - calories;
  const isOver = calories > calorieGoal;

  const groups = new Map<MealType, MealLog[]>();
  for (const meal of logs) {
    const t = getMealType(meal.eaten_at);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(meal);
  }

  const insights = getTodayInsights(calories, calorieGoal, protein, macroGoals.protein, logs.length);

  const totalCals = protein * 4 + carbs * 4 + fat * 9;
  const proteinPct = totalCals > 0 ? Math.round((protein * 4 / totalCals) * 100) : 0;
  const carbsPct   = totalCals > 0 ? Math.round((carbs * 4 / totalCals) * 100) : 0;
  const fatPct     = totalCals > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

  return (
    <>
      {/* Calorie overview */}
      <motion.div className="card p-5 mb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <h3 className="text-sm font-semibold text-text-primary mb-5">Calories Today</h3>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <CalorieRing consumed={Math.round(calories)} goal={calorieGoal} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: isOver ? '#EF4444' : 'var(--acc)' }}>
                {isOver
                  ? `${Math.abs(Math.round(remaining))} kcal over goal`
                  : `${Math.round(remaining)} kcal remaining`}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <MacroBar label="Protein" value={protein} goal={macroGoals.protein} color="#3B82F6" />
              <MacroBar label="Carbs"   value={carbs}   goal={macroGoals.carbs}   color="#F59E0B" />
              <MacroBar label="Fat"     value={fat}     goal={macroGoals.fat}     color="#F97316" />
            </div>
          </div>
        </div>

        {totalCals > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8, letterSpacing: '.3px', textTransform: 'uppercase' }}>Macro Split</p>
            <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
              <motion.div style={{ backgroundColor: '#3B82F6', height: '100%' }} initial={{ flex: 0 }} animate={{ flex: proteinPct }} transition={{ delay: 0.4, duration: 0.8 }} />
              <motion.div style={{ backgroundColor: '#F59E0B', height: '100%' }} initial={{ flex: 0 }} animate={{ flex: carbsPct }}   transition={{ delay: 0.4, duration: 0.8 }} />
              <motion.div style={{ backgroundColor: '#F97316', height: '100%' }} initial={{ flex: 0 }} animate={{ flex: fatPct }}     transition={{ delay: 0.4, duration: 0.8 }} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'Protein', pct: proteinPct, g: Math.round(protein), color: '#3B82F6' },
                { label: 'Carbs',   pct: carbsPct,   g: Math.round(carbs),   color: '#F59E0B' },
                { label: 'Fat',     pct: fatPct,     g: Math.round(fat),     color: '#F97316' },
              ].map(m => (
                <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: m.color }} />
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{m.label} · {m.pct}% · {m.g}g</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Insights */}
      <motion.div className="card p-5 mb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h3 className="text-sm font-semibold text-text-primary mb-3">⚡ Insights</h3>
        {insights.map((ins, i) => <InsightRow key={i} insight={ins} />)}
      </motion.div>

      {/* Meal Timeline */}
      <motion.div className="card p-5 mb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Meal Timeline</h3>
        {logs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--txt3)', textAlign: 'center', padding: '20px 0' }}>
            No meals logged today. Head to Meal Suggestions to log your first meal.
          </p>
        ) : (
          MEAL_ORDER.map(type => {
            const meals = groups.get(type);
            if (!meals?.length) return null;
            return (
              <div key={type} style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{MEAL_ICONS[type]}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', letterSpacing: '.5px', textTransform: 'uppercase' }}>{type}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {meals.map(meal => (
                    <div key={meal.id} style={{ padding: '12px 14px', background: 'var(--surf2)', borderRadius: 'var(--rad)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{meal.meal_name}</span>
                          {meal.claude_suggestion && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', background: 'rgba(200,255,0,0.12)', color: 'var(--acc)', borderRadius: 4, letterSpacing: '.5px' }}>AI</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{formatTime(meal.eaten_at)}</span>
                          <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600 }}>P {Math.round(meal.protein_g)}g</span>
                          <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>C {Math.round(meal.carbs_g)}g</span>
                          <span style={{ fontSize: 11, color: '#F97316', fontWeight: 600 }}>F {Math.round(meal.fat_g)}g</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontFamily: 'var(--fd)', fontSize: 22, color: 'var(--acc)' }}>{meal.calories}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 2 }}>kcal</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </motion.div>

      {/* Pantry hints */}
      <motion.div className="card p-5 mb-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h3 className="text-sm font-semibold text-text-primary mb-3">🥦 Pantry Status</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>📦</div>
            <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
              <strong style={{ color: 'var(--txt)' }}>{pantryCount}</strong> items available for meal suggestions
            </span>
          </div>
          {expiringCount > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>⚠️</div>
                <span style={{ fontSize: 13, color: 'var(--txt2)' }}>
                  <strong style={{ color: '#F59E0B' }}>{expiringCount}</strong> items expiring soon
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--acc)', padding: '9px 13px', background: 'rgba(200,255,0,0.06)', borderRadius: 8, borderLeft: '2px solid var(--acc)' }}>
                Use expiring items first in your next meal suggestion.
              </div>
            </>
          )}
          {pantryCount === 0 && (
            <p style={{ fontSize: 13, color: 'var(--txt3)' }}>No pantry items yet. Add items to get meal suggestions.</p>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ weekData, calorieGoal, macroGoals }: {
  weekData: DayData[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
}) {
  const daysWithData = weekData.filter(d => d.calories > 0);
  if (daysWithData.length === 0) {
    return <EmptyState message="No meals logged this week yet. Start tracking to see your trends." />;
  }

  const avgCalories = Math.round(daysWithData.reduce((s, d) => s + d.calories, 0) / daysWithData.length);
  const avgProtein  = Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / daysWithData.length);
  const avgCarbs    = Math.round(daysWithData.reduce((s, d) => s + d.carbs, 0) / daysWithData.length);
  const avgFat      = Math.round(daysWithData.reduce((s, d) => s + d.fat, 0) / daysWithData.length);
  const adherent    = daysWithData.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(daysWithData.length, 1)) * 100);

  const calChartData  = weekData.map(d => ({ ...d, target: calorieGoal }));

  return (
    <>
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
        <StatBlock label="Avg Calories"    value={avgCalories.toLocaleString()} unit="kcal" color="var(--acc)" />
        <StatBlock label="Avg Protein"     value={avgProtein} unit="g" color="#3B82F6" />
        <StatBlock label="Goal Adherence"  value={`${adherencePct}%`} color={adherencePct >= 70 ? '#22C55E' : '#F59E0B'} />
        <StatBlock label="Days Tracked"    value={`${daysWithData.length}/7`} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard title="Daily Calories" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day`} delay={0.1}>
          <PrepBarChart data={calChartData} dataKey="calories" xKey="day" secondDataKey="target" secondColor="rgba(255,255,255,0.05)" color="#C8FF00" unit=" kcal" height={180} />
        </ChartCard>
        <ChartCard title="Daily Protein" subtitle={`Goal: ${macroGoals.protein}g/day`} delay={0.15}>
          <PrepAreaChart data={weekData} dataKey="protein" xKey="day" color="#3B82F6" unit="g" referenceValue={macroGoals.protein} height={180} />
        </ChartCard>
      </div>

      <motion.div className="card p-5 mb-4" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Weekly Macro Averages</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Avg Protein', avg: avgProtein, goal: macroGoals.protein, color: '#3B82F6' },
            { label: 'Avg Carbs',   avg: avgCarbs,   goal: macroGoals.carbs,   color: '#F59E0B' },
            { label: 'Avg Fat',     avg: avgFat,     goal: macroGoals.fat,     color: '#F97316' },
          ].map(m => (
            <div key={m.label} style={{ padding: 14, background: 'var(--surf2)', borderRadius: 'var(--rad)' }}>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 6 }}>{m.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--fd)', fontSize: 24, color: m.color }}>{m.avg}</span>
                <span style={{ fontSize: 11, color: 'var(--txt3)' }}>g</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(m.avg / m.goal, 1) * 100}%`, backgroundColor: m.color, borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>goal: {m.goal}g</div>
            </div>
          ))}
        </div>
      </motion.div>
    </>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

function MonthView({ monthData, calorieGoal, macroGoals }: {
  monthData: DayData[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
}) {
  const daysWithData = monthData.filter(d => d.calories > 0);
  if (daysWithData.length === 0) {
    return <EmptyState message="No meals logged this month yet. Start tracking to see your trends." />;
  }

  const avgCalories = Math.round(daysWithData.reduce((s, d) => s + d.calories, 0) / daysWithData.length);
  const avgProtein  = Math.round(daysWithData.reduce((s, d) => s + d.protein, 0) / daysWithData.length);
  const adherent    = daysWithData.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(daysWithData.length, 1)) * 100);
  const totalLogged = daysWithData.reduce((s, d) => s + d.calories, 0);

  return (
    <>
      <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
        <StatBlock label="Avg Calories"   value={avgCalories.toLocaleString()} unit="kcal" color="var(--acc)" />
        <StatBlock label="Avg Protein"    value={avgProtein} unit="g" color="#3B82F6" />
        <StatBlock label="Goal Adherence" value={`${adherencePct}%`} color={adherencePct >= 70 ? '#22C55E' : '#F59E0B'} />
        <StatBlock label="Days Logged"    value={daysWithData.length.toString()} />
      </motion.div>

      <ChartCard title="Monthly Calorie Trend" subtitle={`Goal: ${calorieGoal.toLocaleString()} kcal/day · ${monthData.length} days`} delay={0.1}>
        <PrepAreaChart data={monthData} dataKey="calories" xKey="day" color="#C8FF00" unit=" kcal" referenceValue={calorieGoal} height={200} />
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 mb-4">
        <ChartCard title="Monthly Protein Trend" subtitle={`Goal: ${macroGoals.protein}g/day`} delay={0.15}>
          <PrepAreaChart data={monthData} dataKey="protein" xKey="day" color="#3B82F6" unit="g" referenceValue={macroGoals.protein} height={160} />
        </ChartCard>

        <motion.div className="card p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <h3 className="text-sm font-semibold text-text-primary mb-4">Monthly Summary</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { label: 'Total calories logged', value: totalLogged.toLocaleString(), unit: 'kcal' },
              { label: 'Monthly avg calories',  value: avgCalories.toLocaleString(), unit: 'kcal' },
              { label: 'Monthly avg protein',   value: `${avgProtein}`, unit: 'g' },
              { label: 'Days on track',         value: `${adherent} / ${daysWithData.length}`, unit: '' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ fontSize: 13, color: 'var(--txt2)' }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>
                  {item.value}{item.unit ? <span style={{ color: 'var(--txt3)', fontWeight: 400 }}> {item.unit}</span> : null}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function NutritionPage() {
  const { profile } = useAuthStore();
  const [timeframe, setTimeframe] = useState<Timeframe>('today');

  const [todayLogs, setTodayLogs]   = useState<MealLog[]>([]);
  const [weekData,  setWeekData]    = useState<DayData[]>([]);
  const [monthData, setMonthData]   = useState<DayData[]>([]);
  const [pantryCount,    setPantryCount]    = useState(0);
  const [expiringCount,  setExpiringCount]  = useState(0);

  const [todayLoading,  setTodayLoading]  = useState(true);
  const [weekLoading,   setWeekLoading]   = useState(false);
  const [monthLoading,  setMonthLoading]  = useState(false);
  const [todayError,    setTodayError]    = useState<string | null>(null);

  const macroGoals  = profile ? calcMacroGoals(profile) : { protein: 130, carbs: 200, fat: 60 };
  const calorieGoal = profile?.daily_calorie_goal ?? 2000;

  const fetchToday = useCallback(async () => {
    setTodayLoading(true);
    setTodayError(null);
    try {
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !session) throw new Error(sessionErr?.message ?? 'Your session expired. Please sign in again.');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('meal_logs')
        .select('*')
        .gte('eaten_at', today.toISOString())
        .order('eaten_at', { ascending: false });
      if (error) throw error;
      setTodayLogs((data as MealLog[]) ?? []);
    } catch (e: unknown) {
      setTodayError((e as Error).message ?? 'Failed to load today\'s meals');
    } finally {
      setTodayLoading(false);
    }
  }, []);

  const fetchWeek = useCallback(async () => {
    setWeekLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const start = new Date(today);
      start.setDate(start.getDate() - 6);

      const { data } = await supabase
        .from('meal_logs')
        .select('eaten_at, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', user.id)
        .gte('eaten_at', start.toISOString())
        .order('eaten_at');

      const days = new Map<string, DayData>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: d.toLocaleDateString(undefined, { weekday: 'short' }), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      setWeekData(aggregateByDay(data ?? [], days));
    } finally {
      setWeekLoading(false);
    }
  }, []);

  const fetchMonth = useCallback(async () => {
    setMonthLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const { data } = await supabase
        .from('meal_logs')
        .select('eaten_at, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', user.id)
        .gte('eaten_at', startOfMonth.toISOString())
        .order('eaten_at');

      const days = new Map<string, DayData>();
      for (let i = 1; i <= now.getDate(); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), i);
        const key = formatDayKey(d);
        days.set(key, { date: key, day: String(i), calories: 0, protein: 0, carbs: 0, fat: 0 });
      }
      setMonthData(aggregateByDay(data ?? [], days));
    } finally {
      setMonthLoading(false);
    }
  }, []);

  const fetchPantry = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('pantry_items').select('expiry_date').eq('user_id', user.id);
    if (!data) return;
    setPantryCount(data.length);
    setExpiringCount(data.filter(item => {
      const { status } = getExpiryStatus(item.expiry_date);
      return status === 'warning' || status === 'danger';
    }).length);
  }, []);

  // Fetch all on mount; re-fetch today on timeframe switch to keep it fresh
  useEffect(() => {
    fetchToday();
    fetchWeek();
    fetchMonth();
    fetchPantry();
  }, []);

  useEffect(() => {
    if (timeframe === 'today') fetchToday();
  }, [timeframe]);

  const currentLoading =
    timeframe === 'today' ? todayLoading :
    timeframe === 'week'  ? weekLoading  :
    monthLoading;

  if (!profile) return null;

  return (
    <div className="px-4 md:px-6 pt-4 pb-24 md:pb-8 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div className="mb-6" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-bold font-display text-text-primary">Nutrition</h2>
        <p className="text-sm text-text-muted mt-0.5">Am I eating right for my goal?</p>
      </motion.div>

      {/* Timeframe tabs */}
      <motion.div
        style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--surf)', padding: 4, borderRadius: 'var(--rad)', width: 'fit-content' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
      >
        {(['today', 'week', 'month'] as Timeframe[]).map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            style={{
              padding: '7px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s ease',
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
          <p style={{ color: '#EF4444', fontSize: 13 }}>{todayError}</p>
          <button
            onClick={fetchToday}
            style={{ marginTop: 12, padding: '8px 16px', background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, color: 'var(--txt)', cursor: 'pointer', fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {timeframe === 'today' && (
            <TodayView logs={todayLogs} calorieGoal={calorieGoal} macroGoals={macroGoals} pantryCount={pantryCount} expiringCount={expiringCount} />
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
  );
}
