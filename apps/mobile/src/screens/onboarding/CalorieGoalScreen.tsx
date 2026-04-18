// src/screens/onboarding/CalorieGoalScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';

const PRESETS = [
  { label: 'Cutting', kcal: 1800, emoji: '🔥', desc: 'Lose weight gradually' },
  { label: 'Maintenance', kcal: 2200, emoji: '⚖️', desc: 'Stay at current weight' },
  { label: 'Bulking', kcal: 2800, emoji: '💪', desc: 'Build muscle and size' },
];

export function CalorieGoalScreen() {
  const navigation = useNavigation<any>();
  const { updateProfile } = useAuthStore();
  const [selected, setSelected] = useState<number>(2200);
  const [custom, setCustom] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveGoal = custom ? parseInt(custom) : selected;

  const handleNext = async () => {
    if (!effectiveGoal || effectiveGoal < 800 || effectiveGoal > 10000) return;
    setSaving(true);
    await updateProfile({ daily_calorie_goal: effectiveGoal });
    setSaving(false);
    navigation.navigate('FitnessGoal');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.inner} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <OnboardingProgress step={2} total={8} />

        <Text style={s.title}>What's your calorie goal?</Text>
        <Text style={s.subtitle}>
          This sets your daily target. You can change it any time in settings.
        </Text>

        <View style={s.presets}>
          {PRESETS.map(({ label, kcal, emoji, desc }) => (
            <TouchableOpacity
              key={kcal}
              style={[s.preset, selected === kcal && !custom && s.presetActive]}
              onPress={() => { setSelected(kcal); setCustom(''); }}
              activeOpacity={0.8}
            >
              <Text style={s.presetEmoji}>{emoji}</Text>
              <Text style={[s.presetLabel, selected === kcal && !custom && s.presetLabelActive]}>
                {label}
              </Text>
              <Text style={s.presetKcal}>{kcal} kcal</Text>
              <Text style={s.presetDesc}>{desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.orLabel}>or enter a custom amount</Text>
        <TextInput
          style={[s.input, custom && s.inputActive]}
          placeholder="e.g. 2400"
          placeholderTextColor="#6b7280"
          value={custom}
          onChangeText={setCustom}
          keyboardType="numeric"
          returnKeyType="done"
        />

        <TouchableOpacity
          style={[s.btn, saving && { opacity: 0.7 }]}
          onPress={handleNext}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={s.btnText}>{saving ? 'Saving…' : 'Continue →'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { flex: 1, padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#f9fafb', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 28 },
  presets: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  preset: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 16,
    padding: 14, alignItems: 'center', borderWidth: 2, borderColor: '#1f2937',
  },
  presetActive: { borderColor: '#22c55e', backgroundColor: '#052e16' },
  presetEmoji: { fontSize: 26, marginBottom: 6 },
  presetLabel: { fontSize: 13, fontWeight: '700', color: '#9ca3af', marginBottom: 2 },
  presetLabelActive: { color: '#22c55e' },
  presetKcal: { fontSize: 16, fontWeight: '800', color: '#f9fafb', marginBottom: 2 },
  presetDesc: { fontSize: 10, color: '#6b7280', textAlign: 'center' },
  orLabel: { fontSize: 13, color: '#6b7280', textAlign: 'center', marginBottom: 10 },
  input: {
    backgroundColor: '#1a1f2e', borderRadius: 14, padding: 16,
    fontSize: 18, color: '#f9fafb', borderWidth: 1.5,
    borderColor: '#374151', textAlign: 'center', marginBottom: 24,
  },
  inputActive: { borderColor: '#22c55e' },
  btn: {
    backgroundColor: '#22c55e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
  },
  btnText: { fontSize: 17, fontWeight: '700', color: '#0f1117' },
});
