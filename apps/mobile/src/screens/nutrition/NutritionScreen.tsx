import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useMealStore, type DayMacros } from '../../stores/mealStore';
import { usePantryStore } from '../../stores/pantryStore';
import { calcMacroGoals, getExpiryStatus, formatTime } from '@preppal/utils';
import type { MealLog } from '@preppal/types';

// ── Types ──────────────────────────────────────────────────────────────────────

type Timeframe = 'today' | 'week' | 'month';
type MealType  = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

interface Insight {
  type: 'warning' | 'success' | 'info';
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getMealType(eaten_at: string): MealType {
  const h = new Date(eaten_at).getHours();
  if (h >= 5 && h < 11)  return 'Breakfast';
  if (h >= 11 && h < 15) return 'Lunch';
  if (h >= 15 && h < 21) return 'Dinner';
  return 'Snack';
}

const MEAL_ICONS: Record<MealType, string> = {
  Breakfast: '🌅', Lunch: '☀️', Dinner: '🌙', Snack: '🍎',
};
const MEAL_ORDER: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

function buildInsights(
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
    insights.push({ type: 'warning', message: `${Math.round(calories - calorieGoal)} kcal over your target today.` });
  } else if (hour >= 18 && calories < calorieGoal * 0.5) {
    insights.push({ type: 'info', message: `You may need a filling meal — ${Math.round(calorieGoal - calories)} kcal remaining.` });
  }

  if (protein < proteinGoal * 0.5) {
    insights.push({ type: 'warning', message: `Behind on protein today. ${Math.round(proteinGoal - protein)}g to go.` });
  }

  if (insights.length === 0) {
    insights.push({ type: 'success', message: "You're on track today. Keep it up!" });
  }
  return insights;
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export function NutritionScreen() {
  const [timeframe, setTimeframe] = useState<Timeframe>('today');
  const [refreshing, setRefreshing] = useState(false);

  const { profile } = useAuthStore();
  const {
    dailySummary, todayLogs, logsLoading,
    weekData, weekDataLoading,
    monthData, monthDataLoading,
    fetchTodayLogs, fetchWeekData, fetchMonthData,
    subscribeRealtime,
  } = useMealStore();
  const { items: pantryItems, fetch: fetchPantry } = usePantryStore();

  useFocusEffect(useCallback(() => {
    fetchTodayLogs();
    fetchWeekData();
    fetchMonthData();
    fetchPantry();
    const unsub = subscribeRealtime();
    return unsub;
  }, []));

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchTodayLogs(), fetchWeekData(), fetchMonthData(), fetchPantry()]);
    setRefreshing(false);
  }, [fetchTodayLogs, fetchWeekData, fetchMonthData, fetchPantry]);

  if (!profile) return null;

  const macroGoals  = calcMacroGoals(profile);
  const calorieGoal = profile.daily_calorie_goal;
  const expiringItems = pantryItems.filter(item => {
    const { status } = getExpiryStatus(item.expiry_date);
    return status === 'warning' || status === 'danger';
  });

  const loading =
    (timeframe === 'today' ? logsLoading     :
     timeframe === 'week'  ? weekDataLoading :
     monthDataLoading) && !refreshing;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#22c55e" />}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Nutrition</Text>
          <Text style={s.subtitle}>Am I eating right for my goal?</Text>
        </View>

        {/* Timeframe tabs */}
        <View style={s.tabsRow}>
          {(['today', 'week', 'month'] as Timeframe[]).map(tf => (
            <TouchableOpacity
              key={tf}
              style={[s.tab, timeframe === tf && s.tabActive]}
              onPress={() => setTimeframe(tf)}
              activeOpacity={0.75}
            >
              <Text style={[s.tabText, timeframe === tf && s.tabTextActive]}>
                {tf === 'today' ? 'Today' : tf === 'week' ? 'Week' : 'Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color="#22c55e" size="large" />
          </View>
        ) : (
          <>
            {timeframe === 'today' && (
              <TodayView
                dailySummary={dailySummary}
                todayLogs={todayLogs}
                calorieGoal={calorieGoal}
                macroGoals={macroGoals}
                pantryCount={pantryItems.length}
                expiringCount={expiringItems.length}
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

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Today View ─────────────────────────────────────────────────────────────────

function TodayView({ dailySummary, todayLogs, calorieGoal, macroGoals, pantryCount, expiringCount }: {
  dailySummary: { calories_consumed: number; protein_g: number; carbs_g: number; fat_g: number };
  todayLogs: MealLog[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
  pantryCount: number;
  expiringCount: number;
}) {
  const { calories_consumed, protein_g, carbs_g, fat_g } = dailySummary;
  const remaining = calorieGoal - calories_consumed;
  const isOver    = calories_consumed > calorieGoal;
  const pct       = Math.min(calories_consumed / calorieGoal, 1);

  const insights = buildInsights(calories_consumed, calorieGoal, protein_g, macroGoals.protein, todayLogs.length);

  const totalCals  = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const proteinPct = totalCals > 0 ? Math.round((protein_g * 4 / totalCals) * 100) : 0;
  const carbsPct   = totalCals > 0 ? Math.round((carbs_g * 4 / totalCals) * 100) : 0;
  const fatPct     = totalCals > 0 ? Math.max(0, 100 - proteinPct - carbsPct) : 0;

  const groups = new Map<MealType, MealLog[]>();
  for (const meal of todayLogs) {
    const t = getMealType(meal.eaten_at);
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t)!.push(meal);
  }

  return (
    <>
      {/* Calorie card */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Calories Today</Text>

        <View style={s.calBarTrack}>
          <View style={[s.calBarFill, { width: `${pct * 100}%`, backgroundColor: isOver ? '#ef4444' : '#22c55e' }]} />
        </View>

        <View style={s.calNumbers}>
          <View>
            <Text style={[s.calConsumed, isOver && { color: '#ef4444' }]}>
              {Math.round(calories_consumed)}
              <Text style={s.calUnit}> kcal</Text>
            </Text>
            <Text style={s.calLabel}>consumed</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[s.calRemaining, isOver && { color: '#ef4444' }]}>
              {isOver ? `${Math.abs(Math.round(remaining))} over` : `${Math.round(remaining)} left`}
            </Text>
            <Text style={s.calLabel}>goal: {calorieGoal} kcal</Text>
          </View>
        </View>

        <View style={s.sep} />

        {[
          { label: 'Protein', value: protein_g, goal: macroGoals.protein, color: '#3b82f6' },
          { label: 'Carbs',   value: carbs_g,   goal: macroGoals.carbs,   color: '#f59e0b' },
          { label: 'Fat',     value: fat_g,     goal: macroGoals.fat,     color: '#f97316' },
        ].map(({ label, value, goal, color }) => (
          <View key={label} style={s.macroRow}>
            <Text style={s.macroLabel}>{label}</Text>
            <View style={s.macroTrack}>
              <View style={[s.macroFill, { width: `${Math.min(value / goal, 1) * 100}%`, backgroundColor: color }]} />
            </View>
            <Text style={s.macroVal}>{Math.round(value)}g/{goal}g</Text>
          </View>
        ))}

        {totalCals > 0 && (
          <>
            <View style={s.sep} />
            <Text style={s.splitLabel}>MACRO SPLIT</Text>
            <View style={s.splitBar}>
              <View style={{ flex: proteinPct, height: '100%', backgroundColor: '#3b82f6' }} />
              <View style={{ flex: carbsPct,   height: '100%', backgroundColor: '#f59e0b' }} />
              <View style={{ flex: Math.max(fatPct, 0), height: '100%', backgroundColor: '#f97316' }} />
            </View>
            <View style={s.splitLegend}>
              {[
                { label: 'P', pct: proteinPct, color: '#3b82f6' },
                { label: 'C', pct: carbsPct,   color: '#f59e0b' },
                { label: 'F', pct: fatPct,     color: '#f97316' },
              ].map(m => (
                <View key={m.label} style={s.splitItem}>
                  <View style={[s.splitDot, { backgroundColor: m.color }]} />
                  <Text style={s.splitItemText}>{m.label} {m.pct}%</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {/* Insights */}
      <View style={s.card}>
        <Text style={s.cardTitle}>⚡ Insights</Text>
        {insights.map((ins, i) => {
          const borderColor =
            ins.type === 'warning' ? '#f59e0b' :
            ins.type === 'success' ? '#22c55e' : '#3b82f6';
          return (
            <View key={i} style={[s.insightRow, { borderLeftColor: borderColor }]}>
              <Text style={s.insightText}>{ins.message}</Text>
            </View>
          );
        })}
      </View>

      {/* Meal Timeline */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Meal Timeline</Text>
        {todayLogs.length === 0 ? (
          <Text style={s.emptyText}>No meals logged yet. Log a meal to start tracking.</Text>
        ) : (
          MEAL_ORDER.map(type => {
            const meals = groups.get(type);
            if (!meals?.length) return null;
            return (
              <View key={type} style={s.mealGroup}>
                <Text style={s.mealGroupHeader}>{MEAL_ICONS[type]}  {type}</Text>
                {meals.map(meal => (
                  <View key={meal.id} style={s.mealCard}>
                    <View style={s.mealCardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={s.mealName}>{meal.meal_name}</Text>
                          {meal.claude_suggestion && (
                            <View style={s.aiBadge}>
                              <Text style={s.aiBadgeText}>AI</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.mealTime}>{formatTime(meal.eaten_at)}</Text>
                      </View>
                      <Text style={s.mealCals}>{meal.calories} kcal</Text>
                    </View>
                    <View style={s.mealMacros}>
                      <Text style={[s.mealMacro, { color: '#3b82f6' }]}>P {Math.round(meal.protein_g)}g</Text>
                      <Text style={s.mealMacroDot}>·</Text>
                      <Text style={[s.mealMacro, { color: '#f59e0b' }]}>C {Math.round(meal.carbs_g)}g</Text>
                      <Text style={s.mealMacroDot}>·</Text>
                      <Text style={[s.mealMacro, { color: '#f97316' }]}>F {Math.round(meal.fat_g)}g</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </View>

      {/* Pantry hints */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🥦 Pantry Status</Text>
        <View style={s.pantryRow}>
          <Text style={s.pantryText}>
            <Text style={s.pantryBold}>{pantryCount}</Text> items available for meal suggestions
          </Text>
        </View>
        {expiringCount > 0 && (
          <>
            <View style={[s.pantryRow, { marginTop: 8 }]}>
              <Text style={s.pantryText}>
                <Text style={{ color: '#f59e0b', fontWeight: '700' }}>{expiringCount}</Text>
                {' '}items expiring soon
              </Text>
            </View>
            <View style={s.pantryHint}>
              <Text style={s.pantryHintText}>Use expiring items first in your next meal.</Text>
            </View>
          </>
        )}
        {pantryCount === 0 && (
          <Text style={[s.pantryText, { marginTop: 8, color: '#6b7280' }]}>
            No pantry items yet. Add items to get meal suggestions.
          </Text>
        )}
      </View>
    </>
  );
}

// ── Week View ──────────────────────────────────────────────────────────────────

function WeekView({ weekData, calorieGoal, macroGoals }: {
  weekData: DayMacros[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
}) {
  const daysWithData = weekData.filter(d => d.calories > 0);
  if (daysWithData.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.emptyText}>No meals logged this week yet.</Text>
      </View>
    );
  }

  const avgCal  = Math.round(daysWithData.reduce((a, d) => a + d.calories, 0) / daysWithData.length);
  const avgProt = Math.round(daysWithData.reduce((a, d) => a + d.protein_g, 0) / daysWithData.length);
  const adherent = daysWithData.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(daysWithData.length, 1)) * 100);

  const maxCal  = Math.max(calorieGoal * 1.25, ...weekData.map(d => d.calories), 1);
  const maxProt = Math.max(macroGoals.protein * 1.25, ...weekData.map(d => d.protein_g), 1);

  const calBars  = weekData.map(d => ({ label: new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' }), value: d.calories }));
  const protBars = weekData.map(d => ({ label: new Date(d.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' }), value: d.protein_g }));

  return (
    <>
      <View style={s.statsGrid}>
        <StatBox label="Avg Calories"   value={`${avgCal}`}          unit="kcal" />
        <StatBox label="Avg Protein"    value={`${avgProt}`}          unit="g"    valueColor="#3b82f6" />
        <StatBox label="Goal Adherence" value={`${adherencePct}%`}               valueColor={adherencePct >= 70 ? '#22c55e' : '#f59e0b'} />
        <StatBox label="Days Tracked"   value={`${daysWithData.length}/7`} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Daily Calories</Text>
        <Text style={s.chartNote}>Goal: {calorieGoal} kcal/day</Text>
        <BarChart data={calBars} maxValue={maxCal} goalValue={calorieGoal} barColor="#22c55e" />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Daily Protein</Text>
        <Text style={s.chartNote}>Goal: {macroGoals.protein}g/day</Text>
        <BarChart data={protBars} maxValue={maxProt} goalValue={macroGoals.protein} barColor="#3b82f6" />
      </View>
    </>
  );
}

// ── Month View ─────────────────────────────────────────────────────────────────

function MonthView({ monthData, calorieGoal, macroGoals }: {
  monthData: DayMacros[];
  calorieGoal: number;
  macroGoals: { protein: number; carbs: number; fat: number };
}) {
  const daysWithData = monthData.filter(d => d.calories > 0);
  if (daysWithData.length === 0) {
    return (
      <View style={s.card}>
        <Text style={s.emptyText}>No meals logged this month yet.</Text>
      </View>
    );
  }

  const avgCal  = Math.round(daysWithData.reduce((a, d) => a + d.calories, 0) / daysWithData.length);
  const avgProt = Math.round(daysWithData.reduce((a, d) => a + d.protein_g, 0) / daysWithData.length);
  const adherent = daysWithData.filter(d => Math.abs(d.calories - calorieGoal) / calorieGoal <= 0.1).length;
  const adherencePct = Math.round((adherent / Math.max(daysWithData.length, 1)) * 100);
  const maxCal = Math.max(calorieGoal * 1.25, ...monthData.map(d => d.calories), 1);

  const calBars = monthData.map(d => ({
    label: new Date(d.date + 'T12:00:00').getDate().toString(),
    value: d.calories,
  }));

  return (
    <>
      <View style={s.statsGrid}>
        <StatBox label="Avg Calories"   value={`${avgCal}`}         unit="kcal" />
        <StatBox label="Avg Protein"    value={`${avgProt}`}         unit="g"    valueColor="#3b82f6" />
        <StatBox label="Goal Adherence" value={`${adherencePct}%`}              valueColor={adherencePct >= 70 ? '#22c55e' : '#f59e0b'} />
        <StatBox label="Days Logged"    value={`${daysWithData.length}`} />
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Monthly Calorie Trend</Text>
        <Text style={s.chartNote}>Goal: {calorieGoal} kcal/day · {monthData.length} days</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <BarChart
            data={calBars}
            maxValue={maxCal}
            goalValue={calorieGoal}
            barColor="#22c55e"
            barWidth={20}
            labelEvery={5}
            showValues={false}
          />
        </ScrollView>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Monthly Summary</Text>
        {[
          { label: 'Avg calories',    value: `${avgCal} kcal` },
          { label: 'Avg protein',     value: `${avgProt}g` },
          { label: 'Days on track',   value: `${adherent} / ${daysWithData.length}` },
          { label: 'Goal adherence',  value: `${adherencePct}%` },
        ].map(item => (
          <View key={item.label} style={s.summaryRow}>
            <Text style={s.summaryLabel}>{item.label}</Text>
            <Text style={s.summaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

// ── Shared components ──────────────────────────────────────────────────────────

function StatBox({ label, value, unit, valueColor }: {
  label: string; value: string; unit?: string; valueColor?: string;
}) {
  return (
    <View style={s.statBox}>
      <Text style={s.statLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
        <Text style={[s.statValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
        {unit && <Text style={s.statUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

function BarChart({ data, maxValue, goalValue, barColor, barWidth = 0, labelEvery = 1, showValues = true }: {
  data: Array<{ label: string; value: number }>;
  maxValue: number;
  goalValue?: number;
  barColor: string;
  barWidth?: number;
  labelEvery?: number;
  showValues?: boolean;
}) {
  const CHART_H = 100;
  return (
    <View>
      {goalValue != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View style={{ width: 14, height: 2, backgroundColor: '#374151', marginRight: 6 }} />
          <Text style={{ fontSize: 10, color: '#6b7280' }}>Goal: {goalValue}</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: barWidth > 0 ? 2 : 4 }}>
        {data.map((item, i) => {
          const pct  = maxValue > 0 ? Math.min(item.value / maxValue, 1) : 0;
          const barH = Math.max(4, Math.round(pct * CHART_H));
          const isOver = goalValue != null && item.value > goalValue;
          const showLabel = barWidth === 0 || i % labelEvery === 0;
          return (
            <View
              key={i}
              style={[
                { alignItems: 'center', gap: 3 },
                barWidth > 0 ? { width: barWidth } : { flex: 1 },
              ]}
            >
              {showValues && item.value > 0 ? (
                <Text style={{ fontSize: 9, color: '#6b7280', fontWeight: '600' }} numberOfLines={1}>
                  {item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : Math.round(item.value)}
                </Text>
              ) : (
                <View style={{ height: 13 }} />
              )}
              <View style={{ width: '100%', height: CHART_H, justifyContent: 'flex-end', backgroundColor: '#111827', borderRadius: 6, overflow: 'hidden' }}>
                <View style={{ width: '100%', height: barH, backgroundColor: isOver ? '#ef4444' : barColor, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
              </View>
              {showLabel ? (
                <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '600' }}>{item.label}</Text>
              ) : (
                <View style={{ height: 13 }} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#0f1117' },
  scroll: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title:    { fontSize: 26, fontWeight: '800', color: '#f9fafb' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },

  tabsRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 14,
    backgroundColor: '#1a1f2e', borderRadius: 12, padding: 4,
  },
  tab:           { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  tabActive:     { backgroundColor: '#22c55e' },
  tabText:       { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#0f1117' },

  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },

  card: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#1a1f2e', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#1f2937',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#f9fafb', marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#6b7280', textAlign: 'center', paddingVertical: 20 },

  // Calorie section
  calBarTrack: { height: 10, backgroundColor: '#374151', borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
  calBarFill:  { height: '100%', borderRadius: 5 },
  calNumbers:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 4 },
  calConsumed: { fontSize: 32, fontWeight: '800', color: '#22c55e', lineHeight: 36 },
  calUnit:     { fontSize: 14, color: '#9ca3af' },
  calRemaining: { fontSize: 16, fontWeight: '700', color: '#22c55e' },
  calLabel:    { fontSize: 11, color: '#6b7280', marginTop: 1 },
  sep:         { height: 1, backgroundColor: '#1f2937', marginVertical: 12 },

  // Macro bars
  macroRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  macroLabel: { width: 50, fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  macroTrack: { flex: 1, height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden' },
  macroFill:  { height: '100%', borderRadius: 3 },
  macroVal:   { width: 82, fontSize: 11, color: '#6b7280', textAlign: 'right' },

  // Macro split
  splitLabel:    { fontSize: 10, color: '#6b7280', letterSpacing: 0.5, marginBottom: 6, fontWeight: '600' },
  splitBar:      { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  splitLegend:   { flexDirection: 'row', gap: 16, marginTop: 8 },
  splitItem:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  splitDot:      { width: 8, height: 8, borderRadius: 2 },
  splitItemText: { fontSize: 11, color: '#6b7280' },

  // Insights
  insightRow: {
    borderLeftWidth: 3, paddingLeft: 12, paddingVertical: 8,
    marginBottom: 8, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 4,
  },
  insightText: { fontSize: 13, color: '#d1d5db', lineHeight: 18 },

  // Meal timeline
  mealGroup:       { marginBottom: 16 },
  mealGroupHeader: { fontSize: 12, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, marginBottom: 8 },
  mealCard:        { backgroundColor: '#111827', borderRadius: 10, padding: 12, marginBottom: 6 },
  mealCardTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  mealName:        { fontSize: 14, fontWeight: '600', color: '#f9fafb' },
  mealTime:        { fontSize: 11, color: '#6b7280', marginTop: 2 },
  mealCals:        { fontSize: 16, fontWeight: '800', color: '#22c55e' },
  mealMacros:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mealMacro:       { fontSize: 11, fontWeight: '600' },
  mealMacroDot:    { fontSize: 11, color: '#374151' },
  aiBadge:         { paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 4 },
  aiBadgeText:     { fontSize: 9, fontWeight: '700', color: '#22c55e', letterSpacing: 0.5 },

  // Pantry
  pantryRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pantryText:     { fontSize: 13, color: '#9ca3af' },
  pantryBold:     { fontWeight: '700', color: '#f9fafb' },
  pantryHint:     { marginTop: 10, padding: 10, backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 8, borderLeftWidth: 2, borderLeftColor: '#22c55e' },
  pantryHintText: { fontSize: 12, color: '#22c55e' },

  // Stats grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, marginBottom: 12, gap: 8 },
  statBox:   { flex: 1, minWidth: '45%', backgroundColor: '#1a1f2e', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#1f2937' },
  statLabel: { fontSize: 10, color: '#6b7280', fontWeight: '600', letterSpacing: 0.3, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#f9fafb', lineHeight: 26 },
  statUnit:  { fontSize: 11, color: '#6b7280' },

  // Chart
  chartNote: { fontSize: 11, color: '#6b7280', marginBottom: 12, marginTop: -4 },

  // Month summary
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1f2937' },
  summaryLabel: { fontSize: 13, color: '#9ca3af' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#f9fafb' },
});
