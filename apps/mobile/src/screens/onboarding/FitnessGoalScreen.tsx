// src/screens/onboarding/FitnessGoalScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';
import type { FitnessGoal, ActivityLevel } from '@preppal/types';

const GOALS: Array<{ key: FitnessGoal; label: string; emoji: string; desc: string }> = [
  { key: 'cutting', label: 'Cutting', emoji: '🔥', desc: 'Reduce body fat while preserving muscle' },
  { key: 'maintaining', label: 'Maintaining', emoji: '⚖️', desc: 'Stay at your current weight and composition' },
  { key: 'bulking', label: 'Bulking', emoji: '💪', desc: 'Build muscle and size with a calorie surplus' },
];

const ACTIVITY_LEVELS: Array<{ key: ActivityLevel; label: string; desc: string }> = [
  { key: 'sedentary', label: 'Sedentary', desc: 'Desk job, little exercise' },
  { key: 'light', label: 'Light', desc: '1–3 days exercise/week' },
  { key: 'moderate', label: 'Moderate', desc: '3–5 days exercise/week' },
  { key: 'active', label: 'Active', desc: '6–7 days hard exercise' },
];

export function FitnessGoalScreen() {
  const navigation = useNavigation<any>();
  const { updateProfile } = useAuthStore();
  const [goal, setGoal] = useState<FitnessGoal>('maintaining');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [proteinGoal, setProteinGoal] = useState('');
  const [saving, setSaving] = useState(false);

  const handleNext = async () => {
    setSaving(true);
    await updateProfile({
      fitness_goal: goal,
      activity_level: activityLevel,
      protein_goal_g: proteinGoal ? parseInt(proteinGoal) : null,
    });
    setSaving(false);
    navigation.navigate('DietaryRestrictions');
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll}>
        <View style={s.inner}>
          <OnboardingProgress step={3} total={8} />
          <Text style={s.title}>What's your fitness goal?</Text>
          <Text style={s.subtitle}>This helps us tailor meal suggestions for you.</Text>

          {/* Goal selector */}
          <View style={s.section}>
            {GOALS.map(({ key, label, emoji, desc }) => (
              <TouchableOpacity
                key={key}
                style={[s.option, goal === key && s.optionActive]}
                onPress={() => setGoal(key)}
                activeOpacity={0.8}
              >
                <Text style={s.optionEmoji}>{emoji}</Text>
                <View style={s.optionText}>
                  <Text style={[s.optionLabel, goal === key && s.optionLabelActive]}>{label}</Text>
                  <Text style={s.optionDesc}>{desc}</Text>
                </View>
                <View style={[s.radio, goal === key && s.radioActive]}>
                  {goal === key && <View style={s.radioDot} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Activity level */}
          <Text style={s.sectionTitle}>Activity level</Text>
          <View style={s.activityGrid}>
            {ACTIVITY_LEVELS.map(({ key, label, desc }) => (
              <TouchableOpacity
                key={key}
                style={[s.activityChip, activityLevel === key && s.activityChipActive]}
                onPress={() => setActivityLevel(key)}
              >
                <Text style={[s.activityLabel, activityLevel === key && s.activityLabelActive]}>
                  {label}
                </Text>
                <Text style={s.activityDesc}>{desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Optional protein goal */}
          <Text style={s.sectionTitle}>Daily protein goal (optional)</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 150g"
            placeholderTextColor="#6b7280"
            value={proteinGoal}
            onChangeText={setProteinGoal}
            keyboardType="numeric"
          />

          {/* Actions */}
          <View style={s.actions}>
            <TouchableOpacity style={s.skipBtn} onPress={() => navigation.navigate('DietaryRestrictions')}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.nextBtn, saving && { opacity: 0.7 }]}
              onPress={handleNext}
              disabled={saving}
            >
              <Text style={s.nextBtnText}>{saving ? 'Saving…' : 'Continue →'}</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  scroll: { flex: 1 },
  inner: { padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#f9fafb', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 24 },
  section: { gap: 10, marginBottom: 28 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#1a1f2e', borderRadius: 14, padding: 14,
    borderWidth: 2, borderColor: '#1f2937',
  },
  optionActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  optionEmoji: { fontSize: 28 },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: '#f9fafb', marginBottom: 2 },
  optionLabelActive: { color: '#22c55e' },
  optionDesc: { fontSize: 12, color: '#9ca3af' },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#374151',
    justifyContent: 'center', alignItems: 'center',
  },
  radioActive: { borderColor: '#22c55e' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#f9fafb', marginBottom: 10 },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  activityChip: {
    width: '48%', backgroundColor: '#1a1f2e', borderRadius: 12, padding: 12,
    borderWidth: 1.5, borderColor: '#1f2937',
  },
  activityChipActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  activityLabel: { fontSize: 13, fontWeight: '700', color: '#9ca3af', marginBottom: 2 },
  activityLabelActive: { color: '#22c55e' },
  activityDesc: { fontSize: 11, color: '#6b7280' },
  input: {
    backgroundColor: '#1a1f2e', borderRadius: 14, padding: 16,
    fontSize: 16, color: '#f9fafb', borderWidth: 1.5,
    borderColor: '#374151', marginBottom: 28,
  },
  actions: { flexDirection: 'row', gap: 12 },
  skipBtn: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#374151',
  },
  skipText: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  nextBtn: {
    flex: 2, backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
});
