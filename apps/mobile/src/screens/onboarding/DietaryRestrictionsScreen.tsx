// src/screens/onboarding/DietaryRestrictionsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';
import type { DietaryRestriction } from '@preppal/types';

const OPTIONS: Array<{ key: DietaryRestriction; label: string; emoji: string }> = [
  { key: 'vegetarian', label: 'Vegetarian', emoji: '🥗' },
  { key: 'vegan', label: 'Vegan', emoji: '🌱' },
  { key: 'no-gluten', label: 'No Gluten', emoji: '🌾' },
  { key: 'no-nuts', label: 'No Nuts', emoji: '🥜' },
  { key: 'no-dairy', label: 'No Dairy', emoji: '🥛' },
  { key: 'halal', label: 'Halal', emoji: '☪️' },
  { key: 'none', label: 'No restrictions', emoji: '🍽️' },
];

export function DietaryRestrictionsScreen() {
  const navigation = useNavigation<any>();
  const { updateProfile } = useAuthStore();
  const [selected, setSelected] = useState<DietaryRestriction[]>([]);
  const [saving, setSaving] = useState(false);

  const toggle = (key: DietaryRestriction) => {
    if (key === 'none') {
      setSelected(['none']);
      return;
    }
    setSelected((prev) => {
      const without = prev.filter((k) => k !== 'none');
      return without.includes(key)
        ? without.filter((k) => k !== key)
        : [...without, key];
    });
  };

  const handleNext = async () => {
    setSaving(true);
    await updateProfile({ dietary_restrictions: selected });
    setSaving(false);
    navigation.navigate('Allergies');
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView>
        <View style={s.inner}>
          <OnboardingProgress step={4} total={8} />
          <Text style={s.title}>Any dietary preferences?</Text>
          <Text style={s.subtitle}>
            Claude will never suggest meals that conflict with your restrictions.
          </Text>

          <View style={s.grid}>
            {OPTIONS.map(({ key, label, emoji }) => {
              const active = selected.includes(key);
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => toggle(key)}
                  activeOpacity={0.8}
                >
                  <Text style={s.chipEmoji}>{emoji}</Text>
                  <Text style={[s.chipLabel, active && s.chipLabelActive]}>{label}</Text>
                  {active && <Text style={s.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.skipBtn} onPress={() => navigation.navigate('Allergies')}>
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
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#f9fafb', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 32 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1f2e', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: '#1f2937',
  },
  chipActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  chipEmoji: { fontSize: 20 },
  chipLabel: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  chipLabelActive: { color: '#22c55e' },
  checkmark: { fontSize: 13, color: '#22c55e', fontWeight: '800' },
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
