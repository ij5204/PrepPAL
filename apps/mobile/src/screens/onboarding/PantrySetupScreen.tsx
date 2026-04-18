// src/screens/onboarding/PantrySetupScreen.tsx
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  ScrollView, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { usePantryStore } from '../../stores/pantryStore';
import { OnboardingProgress } from '../../components/common/OnboardingProgress';
import type { Unit, Category } from '@preppal/types';

const QUICK_ADDS = [
  { name: 'Eggs', quantity: 6, unit: 'pieces' as Unit, category: 'protein' as Category },
  { name: 'Salt', quantity: 200, unit: 'g' as Unit, category: 'spice' as Category },
  { name: 'Olive Oil', quantity: 500, unit: 'ml' as Unit, category: 'pantry' as Category },
  { name: 'Garlic', quantity: 5, unit: 'pieces' as Unit, category: 'produce' as Category },
  { name: 'Onion', quantity: 3, unit: 'pieces' as Unit, category: 'produce' as Category },
  { name: 'Rice', quantity: 500, unit: 'g' as Unit, category: 'pantry' as Category },
  { name: 'Butter', quantity: 250, unit: 'g' as Unit, category: 'dairy' as Category },
  { name: 'Black Pepper', quantity: 50, unit: 'g' as Unit, category: 'spice' as Category },
];

export function PantrySetupScreen() {
  const navigation = useNavigation<any>();
  const { add, items } = usePantryStore();
  const [added, setAdded] = useState<string[]>([]);
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);

  const MIN_ITEMS = 3;
  const canProceed = (items.length + added.length) >= MIN_ITEMS;

  const handleQuickAdd = async (item: typeof QUICK_ADDS[0]) => {
    if (added.includes(item.name)) return;
    await add(item);
    setAdded((prev) => [...prev, item.name]);
  };

  const handleAddCustom = async () => {
    const name = customName.trim();
    if (!name) return;
    await add({ name, quantity: 1, unit: 'pieces', category: 'other' });
    setAdded((prev) => [...prev, name]);
    setCustomName('');
  };

  const handleNext = () => {
    if (!canProceed) {
      Alert.alert('Add more items', `Please add at least ${MIN_ITEMS} pantry items to get better suggestions.`);
      return;
    }
    navigation.navigate('Notifications');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView>
          <View style={s.inner}>
            <OnboardingProgress step={6} total={8} />
            <Text style={s.title}>What's in your kitchen?</Text>
            <Text style={s.subtitle}>
              Add everything — even salt, oil, and spices. The more you add, the better your meal suggestions will be.
            </Text>

            {/* Progress indicator */}
            <View style={s.progressBar}>
              <View style={[s.progressFill, { width: `${Math.min((items.length / 10) * 100, 100)}%` }]} />
            </View>
            <Text style={s.progressText}>
              {items.length} item{items.length !== 1 ? 's' : ''} added
              {!canProceed && ` — add ${MIN_ITEMS - items.length} more to continue`}
            </Text>

            {/* Quick-add common items */}
            <Text style={s.sectionTitle}>Common kitchen staples</Text>
            <View style={s.quickGrid}>
              {QUICK_ADDS.map((item) => {
                const isAdded = added.includes(item.name);
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[s.quickChip, isAdded && s.quickChipAdded]}
                    onPress={() => handleQuickAdd(item)}
                    disabled={isAdded}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.quickChipText, isAdded && s.quickChipTextAdded]}>
                      {isAdded ? '✓ ' : '+ '}{item.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom add */}
            <Text style={s.sectionTitle}>Add something else</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="e.g. Chicken breast, Pasta, Tomatoes…"
                placeholderTextColor="#6b7280"
                value={customName}
                onChangeText={setCustomName}
                returnKeyType="done"
                onSubmitEditing={handleAddCustom}
              />
              <TouchableOpacity style={s.addBtn} onPress={handleAddCustom}>
                <Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.nextBtn, !canProceed && s.nextBtnDisabled]}
              onPress={handleNext}
              disabled={saving}
            >
              <Text style={s.nextBtnText}>{saving ? 'Saving…' : 'Continue →'}</Text>
            </TouchableOpacity>

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
  subtitle: { fontSize: 15, color: '#9ca3af', lineHeight: 22, marginBottom: 20 },
  progressBar: { height: 6, backgroundColor: '#1f2937', borderRadius: 3, marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  progressText: { fontSize: 13, color: '#9ca3af', marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#f9fafb', marginBottom: 12 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  quickChip: {
    backgroundColor: '#1a1f2e', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: '#374151',
  },
  quickChipAdded: { backgroundColor: '#052e16', borderColor: '#22c55e' },
  quickChipText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  quickChipTextAdded: { color: '#22c55e' },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  input: {
    flex: 1, backgroundColor: '#1a1f2e', borderRadius: 12, padding: 13,
    fontSize: 15, color: '#f9fafb', borderWidth: 1, borderColor: '#374151',
  },
  addBtn: { backgroundColor: '#1f2937', borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#22c55e' },
  nextBtn: { backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#1f2937', opacity: 0.6 },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
});
