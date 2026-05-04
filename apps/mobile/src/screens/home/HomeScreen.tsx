// src/screens/home/HomeScreen.tsx
import React, { useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useMealStore } from '../../stores/mealStore';
import { usePantryStore } from '../../stores/pantryStore';
import { calcMacroGoals, getExpiryStatus, formatTime } from '@preppal/utils';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuthStore();
  const {
    dailySummary,
    fetchTodayLogs,
    fetchWeekCalories,
    weekCaloriesByDay,
    logsLoading,
    subscribeRealtime,
  } = useMealStore();
  const { items: pantryItems, fetch: fetchPantry } = usePantryStore();

  useFocusEffect(
    useCallback(() => {
      fetchTodayLogs();
      fetchWeekCalories();
      fetchPantry();
      const unsub = subscribeRealtime();
      return unsub;
    }, [])
  );

  if (!profile) return null;

  const { calories_consumed, protein_g, carbs_g, fat_g, meals } = dailySummary;
  const calorieGoal = profile.daily_calorie_goal;
  const macroGoals = calcMacroGoals(profile);
  const caloriePercent = Math.min(calories_consumed / calorieGoal, 1);
  const isOverGoal = calories_consumed > calorieGoal;

  const expiringItems = pantryItems.filter((item) => {
    const { status } = getExpiryStatus(item.expiry_date);
    return status === 'warning' || status === 'danger';
  });

  const weekGoalLine = calorieGoal * 7;
  const maxWeekCal =
    Math.max(
      weekGoalLine,
      ...weekCaloriesByDay.map((d) => d.calories),
      1
    ) || 1;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        style={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={logsLoading}
            onRefresh={fetchTodayLogs}
            tintColor="#22c55e"
          />
        }
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.greeting}>
            Good {getTimeOfDay()}, {profile.name?.split(' ')[0] || 'there'} 👋
          </Text>
          <Text style={s.subheading}>Here's your day so far</Text>
        </View>

        {/* Expiry banner */}
        {expiringItems.length > 0 && (
          <TouchableOpacity
            style={s.expiryBanner}
            onPress={() => navigation.navigate('Pantry')}
          >
            <Text style={s.expiryBannerText}>
              ⚠️ {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon —{' '}
              <Text style={s.expiryBannerLink}>view pantry</Text>
            </Text>
          </TouchableOpacity>
        )}

        {/* Calorie Ring */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Calories Today</Text>
          <View style={s.ringContainer}>
            <View style={[s.ringTrack]}>
              <View
                style={[
                  s.ringFill,
                  {
                    width: `${caloriePercent * 100}%`,
                    backgroundColor: isOverGoal ? '#ef4444' : '#22c55e',
                  },
                ]}
              />
            </View>
            <View style={s.ringNumbers}>
              <Text style={[s.ringConsumed, isOverGoal && { color: '#ef4444' }]}>
                {calories_consumed}
              </Text>
              <Text style={s.ringGoal}> / {calorieGoal} kcal</Text>
            </View>
          </View>

          {/* Macro bars */}
          <View style={s.macros}>
            {[
              { label: 'Protein', consumed: protein_g, goal: macroGoals.protein, color: '#3b82f6' },
              { label: 'Carbs', consumed: carbs_g, goal: macroGoals.carbs, color: '#f59e0b' },
              { label: 'Fat', consumed: fat_g, goal: macroGoals.fat, color: '#f97316' },
            ].map(({ label, consumed, goal, color }) => (
              <View key={label} style={s.macroRow}>
                <Text style={s.macroLabel}>{label}</Text>
                <View style={s.macroBarTrack}>
                  <View
                    style={[
                      s.macroBarFill,
                      { width: `${Math.min(consumed / goal, 1) * 100}%`, backgroundColor: color },
                    ]}
                  />
                </View>
                <Text style={s.macroValue}>
                  {Math.round(consumed)}g / {goal}g
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Suggest a meal CTA */}
        <TouchableOpacity
          style={s.suggestBtn}
          onPress={() => navigation.navigate('Meals')}
          activeOpacity={0.85}
        >
          <Text style={s.suggestBtnText}>🍳  Suggest a Meal</Text>
        </TouchableOpacity>

        {/* Weekly calories */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Last 7 days</Text>
          <View style={s.weekChart}>
            {weekCaloriesByDay.map(({ date, calories }) => {
              const pct = Math.min(1, calories / maxWeekCal);
              const barH = Math.max(6, Math.round(pct * 100));
              const dow = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
                weekday: 'narrow',
              });
              const fillColor = calories > calorieGoal ? '#ef4444' : '#22c55e';
              return (
                <View key={date} style={s.weekCol}>
                  <View style={s.weekBarTrack}>
                    <View style={[s.weekBarFill, { height: barH, backgroundColor: fillColor }]} />
                  </View>
                  <Text style={s.weekSmallCals}>{Math.round(calories)}</Text>
                  <Text style={s.weekLabel}>{dow}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Today's meals */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Today's Meals</Text>
          {meals.length === 0 ? (
            <Text style={s.emptyText}>No meals logged yet. Tap "Suggest a Meal" above.</Text>
          ) : (
            meals.map((meal) => (
              <View key={meal.id} style={s.mealRow}>
                <View style={s.mealRowLeft}>
                  <Text style={s.mealName}>{meal.meal_name}</Text>
                  <Text style={s.mealTime}>{formatTime(meal.eaten_at)}</Text>
                </View>
                <Text style={s.mealCals}>{meal.calories} kcal</Text>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  scroll: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#f9fafb' },
  subheading: { fontSize: 14, color: '#9ca3af', marginTop: 2 },
  expiryBanner: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#422006', borderRadius: 10,
    padding: 12, borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  expiryBannerText: { color: '#fbbf24', fontSize: 13 },
  expiryBannerLink: { fontWeight: '700', textDecorationLine: 'underline' },
  card: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1a1f2e', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: '#1f2937',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#f9fafb', marginBottom: 12 },
  ringContainer: { marginBottom: 16 },
  ringTrack: {
    height: 12, backgroundColor: '#374151', borderRadius: 6, overflow: 'hidden',
  },
  ringFill: { height: '100%', borderRadius: 6 },
  ringNumbers: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  ringConsumed: { fontSize: 28, fontWeight: '800', color: '#22c55e' },
  ringGoal: { fontSize: 16, color: '#9ca3af' },
  macros: { gap: 10 },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  macroLabel: { width: 52, fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  macroBarTrack: { flex: 1, height: 6, backgroundColor: '#374151', borderRadius: 3, overflow: 'hidden' },
  macroBarFill: { height: '100%', borderRadius: 3 },
  macroValue: { width: 80, fontSize: 11, color: '#6b7280', textAlign: 'right' },
  suggestBtn: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: '#22c55e', shadowOpacity: 0.4,
    shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  suggestBtnText: { fontSize: 17, fontWeight: '700', color: '#0f1117' },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  mealRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1f2937',
  },
  mealRowLeft: { flex: 1 },
  mealName: { fontSize: 15, fontWeight: '600', color: '#f9fafb' },
  mealTime: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  mealCals: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  weekChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 8,
  },
  weekCol: { flex: 1, alignItems: 'center', gap: 4 },
  weekBarTrack: {
    width: '100%',
    height: 104,
    justifyContent: 'flex-end',
    backgroundColor: '#111827',
    borderRadius: 8,
    overflow: 'hidden',
  },
  weekBarFill: {
    width: '100%',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  weekSmallCals: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  weekLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600' },
});
