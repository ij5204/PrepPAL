// src/screens/onboarding/NotificationsScreen.tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';
import {
  ensurePushPermissions,
  registerPushTokenToProfile,
  scheduleDailyEngagementReminders,
  scheduleTestLocalNotification,
} from '../../lib/notifications';

const BENEFITS = [
  { emoji: '⚠️', text: "We'll alert you before food expires or goes out of stock" },
  { emoji: '🛒', text: 'Restock pings when pantry hits zero quantity' },
  { emoji: '🍳', text: '9 AM nudge if you skip logging in the morning' },
  { emoji: '📊', text: '7 PM calorie check-in when you’re far below goal' },
];

export function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const [requesting, setRequesting] = useState(false);

  const goDone = () => navigation.navigate('Done');

  const handleEnable = async () => {
    setRequesting(true);
    try {
      await ensurePushPermissions();
      if (user?.id) await registerPushTokenToProfile(user.id);
      await scheduleDailyEngagementReminders();
      await scheduleTestLocalNotification(4);
    } catch {
      /* optional path */
    }
    setRequesting(false);
    goDone();
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip notifications?',
      'You won\'t receive expiry alerts or meal reminders. You can enable them later in Settings.',
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Skip anyway', onPress: goDone },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.inner}>
        <OnboardingProgress step={7} total={8} />

        <Text style={s.emoji}>🔔</Text>
        <Text style={s.title}>Stay on top of your food</Text>
        <Text style={s.subtitle}>
          PrepPAL works best when it can reach you. Here is what you will get:
        </Text>

        <View style={s.benefits}>
          {BENEFITS.map(({ emoji, text }) => (
            <View key={text} style={s.benefit}>
              <Text style={s.benefitEmoji}>{emoji}</Text>
              <Text style={s.benefitText}>{text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[s.enableBtn, requesting && { opacity: 0.7 }]}
          onPress={handleEnable}
          disabled={requesting}
          activeOpacity={0.85}
        >
          <Text style={s.enableBtnText}>{requesting ? 'Enabling…' : 'Enable Notifications'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { flex: 1, padding: 24, justifyContent: 'center' },
  emoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#f9fafb', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 32, textAlign: 'center' },
  benefits: { gap: 16, marginBottom: 40 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitEmoji: { fontSize: 26, width: 36, textAlign: 'center' },
  benefitText: { fontSize: 15, color: '#d1d5db', flex: 1, lineHeight: 22 },
  enableBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#22c55e',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  enableBtnText: { fontSize: 17, fontWeight: '700', color: '#0f1117' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, color: '#6b7280' },
});
