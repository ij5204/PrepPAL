// src/components/common/OnboardingProgress.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export function OnboardingProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={s.container}>
      <View style={s.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              i + 1 === step && s.dotCurrent,
              i + 1 < step && s.dotDone,
            ]}
          />
        ))}
      </View>
      <Text style={s.label}>Step {step} of {total}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginBottom: 28, alignItems: 'flex-start' },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1f2937' },
  dotCurrent: { backgroundColor: '#22c55e', width: 24 },
  dotDone: { backgroundColor: '#166534' },
  label: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
});
