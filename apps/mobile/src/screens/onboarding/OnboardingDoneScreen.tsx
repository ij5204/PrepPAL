// src/screens/onboarding/OnboardingDoneScreen.tsx
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { useMealStore } from '../../stores/mealStore';

export function OnboardingDoneScreen() {
  const navigation = useNavigation<any>();
  const { updateProfile, profile } = useAuthStore();
  const { fetchSuggestions } = useMealStore();
  const scale = new Animated.Value(0);

  useEffect(() => {
    // Mark onboarding complete
    updateProfile({ onboarding_complete: true });

    // Animate the checkmark in
    Animated.spring(scale, {
      toValue: 1,
      friction: 4,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleGetStarted = async () => {
    // Pre-fetch suggestions so they're ready when user hits Meals tab
    fetchSuggestions();
    // Navigate to main app
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.inner}>
        <Animated.View style={[s.checkCircle, { transform: [{ scale }] }]}>
          <Text style={s.checkEmoji}>✅</Text>
        </Animated.View>

        <Text style={s.title}>You're all set{profile?.name ? `, ${profile.name.split(' ')[0]}` : ''}!</Text>
        <Text style={s.subtitle}>
          PrepPAL is ready. Your first meal suggestions are being prepared based on your pantry.
        </Text>

        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>What happens next</Text>
          {[
            '🍳  Get 3 meal ideas from your pantry instantly',
            '📊  Track calories and macros as you eat',
            '⚠️  Get alerts before food expires',
            '🛒  Your grocery list builds itself',
          ].map((line) => (
            <Text key={line} style={s.summaryLine}>{line}</Text>
          ))}
        </View>

        <TouchableOpacity style={s.ctaBtn} onPress={handleGetStarted} activeOpacity={0.85}>
          <Text style={s.ctaBtnText}>Get My First Meal Suggestion →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { flex: 1, padding: 28, justifyContent: 'center', alignItems: 'center' },
  checkCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#052e16', justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, borderWidth: 2, borderColor: '#22c55e',
  },
  checkEmoji: { fontSize: 48 },
  title: { fontSize: 30, fontWeight: '900', color: '#f9fafb', textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 16, color: '#9ca3af', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  summaryCard: {
    width: '100%', backgroundColor: '#1a1f2e', borderRadius: 16,
    padding: 20, marginBottom: 32, borderWidth: 1, borderColor: '#1f2937', gap: 10,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryLine: { fontSize: 15, color: '#d1d5db', lineHeight: 24 },
  ctaBtn: {
    width: '100%', backgroundColor: '#22c55e', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#22c55e', shadowOpacity: 0.4,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 8,
  },
  ctaBtnText: { fontSize: 17, fontWeight: '800', color: '#0f1117' },
});
