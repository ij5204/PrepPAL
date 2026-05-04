// src/screens/meals/MealsScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useMealStore } from '../../stores/mealStore';
import { usePantryStore } from '../../stores/pantryStore';
import { useGroceryStore } from '../../stores/groceryStore';
import { matchSuggestionIngredientsToPantry } from '@preppal/utils';
import type { MealSuggestion } from '@preppal/types';
import { LogMealSchema } from '@preppal/validation';

export function MealsScreen() {
  const {
    suggestions, suggestionsLoading, suggestionsError,
    fallbackUsed, fallbackReason, fetchSuggestions, logMeal,
  } = useMealStore();
  const pantryItems = usePantryStore((s) => s.items);
  const fetchPantry = usePantryStore((s) => s.fetch);
  const { addMissingIngredients } = useGroceryStore();
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [loggingIndex, setLoggingIndex] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualCals, setManualCals] = useState('');
  const [manualP, setManualP] = useState('');
  const [manualC, setManualC] = useState('');
  const [manualF, setManualF] = useState('');

  const handleLog = async (meal: MealSuggestion, index: number) => {
    setLoggingIndex(index);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const ingredients_used = matchSuggestionIngredientsToPantry(
      pantryItems,
      meal.ingredients_used.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
      }))
    );

    const payload = {
      meal_name: meal.meal_name,
      calories: meal.calories,
      protein_g: meal.protein_g,
      carbs_g: meal.carbs_g,
      fat_g: meal.fat_g,
      ingredients_used,
      claude_suggestion: true,
      meal_tags: meal.tags,
    };

    const parsed = LogMealSchema.safeParse(payload);
    if (!parsed.success) {
      Alert.alert('Could not log meal', 'Please try again in a moment.');
      setLoggingIndex(null);
      return;
    }

    const { error } = await logMeal(parsed.data);

    if (error) {
      Alert.alert('Could not log meal', 'Something went wrong. Please try again.');
      setLoggingIndex(null);
      return;
    }

    await fetchPantry();

    if (meal.missing_ingredients.length > 0) {
      Alert.alert(
        'Add missing ingredients?',
        `Add ${meal.missing_ingredients.map((i) => i.name).join(', ')} to your grocery list?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Yes, add them', onPress: () => addMissingIngredients(meal.missing_ingredients) },
        ]
      );
    }

    setLoggingIndex(null);
  };

  const handleManualLog = async () => {
    const name = manualName.trim();
    const calories = Number(manualCals);
    const protein_g = Number(manualP || 0);
    const carbs_g = Number(manualC || 0);
    const fat_g = Number(manualF || 0);
    const parsed = LogMealSchema.safeParse({
      meal_name: name || 'Manual meal',
      calories,
      protein_g,
      carbs_g,
      fat_g,
      ingredients_used: [],
      claude_suggestion: false,
      meal_tags: ['manual'],
    });
    if (!parsed.success) {
      Alert.alert('Check your numbers', 'Calories must be greater than zero.');
      return;
    }
    const { error } = await logMeal(parsed.data);
    if (error) {
      Alert.alert('Could not log meal', 'Please try again.');
      return;
    }
    setManualOpen(false);
    setManualName('');
    setManualCals('');
    setManualP('');
    setManualC('');
    setManualF('');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll}>
        <View style={s.header}>
          <Text style={s.title}>Meal Ideas</Text>
          <Text style={s.subtitle}>Based on what is in your pantry</Text>
        </View>

        {fallbackUsed && fallbackReason === 'stale_cache' && (
          <View style={s.notice}>
            <Text style={s.noticeText}>
              These suggestions may be outdated. Tap refresh to try again.
            </Text>
          </View>
        )}

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
              {suggestions.length > 0 ? 'Regenerate suggestions' : 'Suggest a Meal'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.manualLink}
          onPress={() => setManualOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={s.manualLinkText}>Log a meal manually</Text>
        </TouchableOpacity>

        {suggestionsError && suggestions.length === 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorEmoji}>🧺</Text>
            <Text style={s.errorTitle}>No suggestions yet</Text>
            <Text style={s.errorText}>{suggestionsError}</Text>
          </View>
        )}

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

      <Modal visible={manualOpen} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setManualOpen(false)}>
          <TouchableOpacity style={s.modalSheet} activeOpacity={1}>
            <Text style={s.modalTitle}>Manual meal</Text>
            <Text style={s.modalHint}>Nutrition is marked as an estimate for MVP.</Text>
            <TextInput
              style={s.input}
              placeholder="Meal name"
              placeholderTextColor="#6b7280"
              value={manualName}
              onChangeText={setManualName}
            />
            <TextInput
              style={s.input}
              placeholder="Calories (kcal)"
              placeholderTextColor="#6b7280"
              value={manualCals}
              onChangeText={setManualCals}
              keyboardType="decimal-pad"
            />
            <View style={s.macroInputs}>
              <TextInput
                style={[s.input, s.macroInput]}
                placeholder="Protein g"
                placeholderTextColor="#6b7280"
                value={manualP}
                onChangeText={setManualP}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[s.input, s.macroInput]}
                placeholder="Carbs g"
                placeholderTextColor="#6b7280"
                value={manualC}
                onChangeText={setManualC}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[s.input, s.macroInput]}
                placeholder="Fat g"
                placeholderTextColor="#6b7280"
                value={manualF}
                onChangeText={setManualF}
                keyboardType="decimal-pad"
              />
            </View>
            <TouchableOpacity style={s.primaryBtn} onPress={handleManualLog}>
              <Text style={s.primaryBtnText}>Save meal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setManualOpen(false)}>
              <Text style={s.secondaryBtnText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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

      {meal.tags.length > 0 && (
        <View style={s.tagsRow}>
          {meal.tags.map((tag) => (
            <View key={tag} style={s.tag}>
              <Text style={s.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}

      {expanded && (
        <View style={s.expanded}>
          <Text style={s.sectionLabel}>Instructions</Text>
          <Text style={s.instructions}>{meal.instructions}</Text>

          <Text style={s.sectionLabel}>Ingredients used</Text>
          {meal.ingredients_used.map((i, idx) => (
            <Text key={idx} style={s.ingredientRow}>
              • {i.name} — {i.quantity} {i.unit}
            </Text>
          ))}

          {meal.missing_ingredients.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: '#f59e0b' }]}>Missing ingredients</Text>
              {meal.missing_ingredients.map((i, idx) => (
                <Text key={idx} style={[s.ingredientRow, { color: '#f59e0b' }]}>
                  {i.name} — {i.quantity} {i.unit}
                </Text>
              ))}
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[s.logBtn, logging && { opacity: 0.7 }]}
        onPress={onLog}
        disabled={logging}
        activeOpacity={0.85}
      >
        {logging ? (
          <ActivityIndicator color="#0f1117" size="small" />
        ) : (
          <Text style={s.logBtnText}>Log this meal</Text>
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
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#422006',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  noticeText: { color: '#fbbf24', fontSize: 13 },
  generateBtn: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
  manualLink: { alignItems: 'center', marginBottom: 16 },
  manualLinkText: { color: '#22c55e', fontWeight: '700', fontSize: 14 },
  errorCard: {
    margin: 16,
    backgroundColor: '#1a1f2e',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  errorEmoji: { fontSize: 40, marginBottom: 8 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#f9fafb', marginBottom: 6 },
  errorText: { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  card: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#1a1f2e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1f2937',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 8,
  },
  cardTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#f9fafb', flex: 1 },
  missingBadge: {
    backgroundColor: '#422006',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  missingBadgeText: { fontSize: 11, fontWeight: '700', color: '#f59e0b' },
  chevron: { fontSize: 12, color: '#6b7280', marginLeft: 8 },
  macroRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  macroPill: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  macroValue: { fontSize: 15, fontWeight: '800' },
  macroLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 6, paddingBottom: 12 },
  tag: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  expanded: { paddingHorizontal: 16, paddingBottom: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6b7280',
    marginBottom: 6,
    marginTop: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  instructions: { fontSize: 14, color: '#d1d5db', lineHeight: 21 },
  ingredientRow: { fontSize: 14, color: '#9ca3af', lineHeight: 22 },
  logBtn: {
    margin: 12,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  logBtnText: { fontSize: 15, fontWeight: '700', color: '#0f1117' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1a1f2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#f9fafb', marginBottom: 6 },
  modalHint: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  input: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#f9fafb',
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 10,
  },
  macroInputs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  macroInput: { flex: 1, marginBottom: 0 },
  primaryBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: '#9ca3af', fontWeight: '600' },
});
