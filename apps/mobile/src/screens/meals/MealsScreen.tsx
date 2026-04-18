// src/screens/meals/MealsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useMealStore } from '../../stores/mealStore';
import { usePantryStore } from '../../stores/pantryStore';
import { useGroceryStore } from '../../stores/groceryStore';
import type { MealSuggestion } from '@preppal/types';

export function MealsScreen() {
  const {
    suggestions, suggestionsLoading, suggestionsError,
    fallbackUsed, fallbackReason, fetchSuggestions, logMeal,
  } = useMealStore();
  const { deductQuantities } = usePantryStore();
  const { addMissingIngredients } = useGroceryStore();
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);

  const handleLog = async (meal: MealSuggestion, index: number) => {
    setLoggingIndex(index);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { error } = await logMeal({
      meal_name: meal.meal_name,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      ingredients_used: meal.ingredients_used.map((i) => ({
        pantry_item_id: '', // resolved at log time
        name: i.name,
        quantity_used: i.quantity,
        unit: i.unit as any,
      })),
      claude_suggestion: true,
      meal_tags: meal.tags,
    });

    if (error) {
      Alert.alert('Error', 'Failed to log meal. Please try again.');
      setLoggingIndex(null);
      return;
    }

    // Deduct pantry quantities
    // (In production: match pantry_item_ids properly via pantry store lookup)
    await deductQuantities(
      meal.ingredients_used.map((i) => ({
        pantry_item_id: '', // match by name in real implementation
        quantity_used: i.quantity,
      }))
    );

    // Prompt to add missing ingredients to grocery list
    if (meal.missing_ingredients.length > 0) {
      Alert.alert(
        'Missing Ingredients',
        `Add ${meal.missing_ingredients.map((i) => i.name).join(', ')} to your grocery list?`,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes, add them',
            onPress: () => addMissingIngredients(meal.missing_ingredients),
          },
        ]
      );
    }

    setLoggingIndex(null);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Meal Ideas</Text>
          <Text style={s.subtitle}>Based on what's in your pantry</Text>
        </View>

        {/* Fallback notice */}
        {fallbackUsed && fallbackReason === 'stale_cache' && (
          <View style={s.notice}>
            <Text style={s.noticeText}>
              ⏱ These suggestions may be outdated. Tap refresh to try again.
            </Text>
          </View>
        )}

        {/* Suggest button */}
        <TouchableOpacity
          style={[s.generateBtn, suggestionsLoading && s.generateBtnDisabled]}
          onPress={fetchSuggestions}
          disabled={suggestionsLoading}
          activeOpacity={0.85}
        >
          {suggestionsLoading ? (
            <ActivityIndicator color="#0f1117" />
          ) : (
            <Text style={s.generateBtnText}>
              {suggestions.length > 0 ? '🔄  Regenerate' : '✨  Suggest a Meal'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Error state */}
        {suggestionsError && suggestions.length === 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorEmoji}>😕</Text>
            <Text style={s.errorTitle}>Suggestions unavailable</Text>
            <Text style={s.errorText}>
              We couldn't generate suggestions right now. Add more items to your pantry or try again.
            </Text>
          </View>
        )}

        {/* Meal cards */}
        {suggestions.map((meal, idx) => (
          <MealCard
            key={`${meal.meal_name}-${idx}`}
            meal={meal}
            expanded={expandedCard === idx}
            onToggle={() => setExpandedCard(expandedCard === idx ? null : idx)}
            onLog={() => handleLog(meal, idx)}
            logging={loggingIndex === idx}
          />
        ))}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function MealCard({
  meal, expanded, onToggle, onLog, logging,
}: {
  meal: MealSuggestion;
  expanded: boolean;
  onToggle: () => void;
  onLog: () => void;
  logging: boolean;
}) {
  return (
    <View style={s.card}>
      {/* Title row */}
      <TouchableOpacity style={s.cardHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={s.cardTitleRow}>
          <Text style={s.cardTitle}>{meal.meal_name}</Text>
          {meal.missing_ingredients.length > 0 && (
            <View style={s.missingBadge}>
              <Text style={s.missingBadgeText}>
                {meal.missing_ingredients.length} missing
              </Text>
            </View>
          )}
        </View>
        <Text style={s.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Macros row */}
      <View style={s.macroRow}>
        {[
          { label: 'kcal', value: meal.calories, color: '#22c55e' },
          { label: 'Protein', value: `${meal.protein_g}g`, color: '#3b82f6' },
          { label: 'Carbs', value: `${meal.carbs_g}g`, color: '#f59e0b' },
          { label: 'Fat', value: `${meal.fat_g}g`, color: '#f97316' },
        ].map(({ label, value, color }) => (
          <View key={label} style={s.macroPill}>
            <Text style={[s.macroValue, { color }]}>{value}</Text>
            <Text style={s.macroLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Tags */}
      {meal.tags.length > 0 && (
        <View style={s.tagsRow}>
          {meal.tags.map((tag) => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded: instructions + ingredients */}
      {expanded && (
        <View style={s.expanded}>
          <Text style={s.sectionLabel}>Instructions</Text>
          <Text style={s.instructions}>{meal.instructions}</Text>

          <Text style={s.sectionLabel}>Ingredients Used</Text>
          {meal.ingredients_used.map((i, idx) => (
            <Text key={idx} style={s.ingredientRow}>
              • {i.name} — {i.quantity} {i.unit}
            </Text>
          ))}

          {meal.missing_ingredients.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: '#f59e0b' }]}>Missing Ingredients</Text>
              {meal.missing_ingredients.map((i, idx) => (
                <Text key={idx} style={[s.ingredientRow, { color: '#f59e0b' }]}>
                  ⚠ {i.name} — {i.quantity} {i.unit}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      {/* Log button */}
      <TouchableOpacity
        style={[s.logBtn, logging && { opacity: 0.7 }]}
        onPress={onLog}
        disabled={logging}
        activeOpacity={0.85}
      >
        {logging ? (
          <ActivityIndicator color="#0f1117" size="small" />
        ) : (
          <Text style={s.logBtnText}>Log This Meal</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  scroll: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 26, fontWeight: '800', color: '#f9fafb' },
  subtitle: { fontSize: 14, color: '#9ca3af', marginTop: 2 },
  notice: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#422006', borderRadius: 10, padding: 12,
    borderLeftWidth: 3, borderLeftColor: '#f59e0b',
  },
  noticeText: { color: '#fbbf24', fontSize: 13 },
  generateBtn: {
    marginHorizontal: 16, marginBottom: 20,
    backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    shadowColor: '#22c55e', shadowOpacity: 0.35,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
  errorCard: {
    margin: 16, backgroundColor: '#1a1f2e', borderRadius: 16,
    padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1f2937',
  },
  errorEmoji: { fontSize: 40, marginBottom: 8 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#f9fafb', marginBottom: 6 },
  errorText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  card: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: '#1a1f2e', borderRadius: 16,
    borderWidth: 1, borderColor: '#1f2937', overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: 16, paddingBottom: 8,
  },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#f9fafb', flex: 1 },
  missingBadge: {
    backgroundColor: '#422006', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  missingBadgeText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  chevron: { fontSize: 12, color: '#6b7280', marginLeft: 8 },
  macroRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8,
  },
  macroPill: {
    flex: 1, backgroundColor: '#111827', borderRadius: 10,
    paddingVertical: 8, alignItems: 'center',
  },
  macroValue: { fontSize: 15, fontWeight: '800' },
  macroLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, paddingBottom: 12 },
  tag: {
    backgroundColor: '#1f2937', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  tagText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  expanded: { paddingHorizontal: 16, paddingBottom: 4 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 6, marginTop: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  instructions: { fontSize: 14, color: '#d1d5db', lineHeight: 21 },
  ingredientRow: { fontSize: 14, color: '#9ca3af', lineHeight: 22 },
  logBtn: {
    margin: 12, backgroundColor: '#22c55e', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  logBtnText: { fontSize: 15, fontWeight: '700', color: '#0f1117' },
});
