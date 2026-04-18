// src/screens/onboarding/AllergiesScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../stores/authStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';

const ALLERGY_SUGGESTIONS = ['Peanuts', 'Tree nuts', 'Shellfish', 'Fish', 'Eggs', 'Soy', 'Wheat'];
const DISLIKE_SUGGESTIONS = ['Cilantro', 'Mushrooms', 'Olives', 'Anchovies', 'Brussels sprouts'];

export function AllergiesScreen() {
  const navigation = useNavigation<any>();
  const { updateProfile } = useAuthStore();
  const [allergies, setAllergies] = useState<string[]>([]);
  const [dislikes, setDislikes] = useState<string[]>([]);
  const [allergyInput, setAllergyInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const [saving, setSaving] = useState(false);

  const addAllergy = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !allergies.includes(trimmed)) {
      setAllergies((prev) => [...prev, trimmed]);
    }
    setAllergyInput('');
  };

  const addDislike = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !dislikes.includes(trimmed)) {
      setDislikes((prev) => [...prev, trimmed]);
    }
    setDislikeInput('');
  };

  const handleNext = async () => {
    setSaving(true);
    await updateProfile({ allergies, disliked_foods: dislikes });
    setSaving(false);
    navigation.navigate('PantrySetup');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView>
          <View style={s.inner}>
            <OnboardingProgress step={5} total={8} />
            <Text style={s.title}>Any allergies or dislikes?</Text>
            <Text style={s.subtitle}>
              Claude will never suggest meals containing these. Be as specific as you like.
            </Text>

            {/* Allergies */}
            <Text style={s.label}>Allergies</Text>
            <View style={s.tagRow}>
              {allergies.map((a) => (
                <TouchableOpacity key={a} style={s.tag} onPress={() => setAllergies((p) => p.filter((x) => x !== a))}>
                  <Text style={s.tagText}>{a} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Type an allergy…"
                placeholderTextColor="#6b7280"
                value={allergyInput}
                onChangeText={setAllergyInput}
                returnKeyType="done"
                onSubmitEditing={() => addAllergy(allergyInput)}
              />
              <TouchableOpacity style={s.addBtn} onPress={() => addAllergy(allergyInput)}>
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <View style={s.suggestions}>
              {ALLERGY_SUGGESTIONS.map((s_) => (
                <TouchableOpacity key={s_} style={s.suggChip} onPress={() => addAllergy(s_)}>
                  <Text style={s.suggText}>+ {s_}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dislikes */}
            <Text style={[s.label, { marginTop: 24 }]}>Foods you dislike</Text>
            <View style={s.tagRow}>
              {dislikes.map((d) => (
                <TouchableOpacity key={d} style={[s.tag, s.dislikeTag]} onPress={() => setDislikes((p) => p.filter((x) => x !== d))}>
                  <Text style={s.tagText}>{d} ✕</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Type a food you dislike…"
                placeholderTextColor="#6b7280"
                value={dislikeInput}
                onChangeText={setDislikeInput}
                returnKeyType="done"
                onSubmitEditing={() => addDislike(dislikeInput)}
              />
              <TouchableOpacity style={s.addBtn} onPress={() => addDislike(dislikeInput)}>
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
            <View style={s.suggestions}>
              {DISLIKE_SUGGESTIONS.map((s_) => (
                <TouchableOpacity key={s_} style={s.suggChip} onPress={() => addDislike(s_)}>
                  <Text style={s.suggText}>+ {s_}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.actions}>
              <TouchableOpacity style={s.skipBtn} onPress={() => navigation.navigate('PantrySetup')}>
                <Text style={s.skipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.nextBtn, saving && { opacity: 0.7 }]} onPress={handleNext} disabled={saving}>
                <Text style={s.nextBtnText}>{saving ? 'Saving…' : 'Continue →'}</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  inner: { padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: '#f9fafb', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '700', color: '#f9fafb', marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  tag: { backgroundColor: '#422006', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  dislikeTag: { backgroundColor: '#1e3a5f' },
  tagText: { fontSize: 13, fontWeight: '600', color: '#fbbf24' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  input: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 12, padding: 13,
    fontSize: 15, color: '#f9fafb', borderWidth: 1, borderColor: '#374151',
  },
  addBtn: { backgroundColor: '#1f2937', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggChip: {
    backgroundColor: '#1a1f2e', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#374151',
  },
  suggText: { fontSize: 12, color: '#9ca3af' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 32 },
  skipBtn: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#374151',
  },
  skipText: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  nextBtn: { flex: 2, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
});
