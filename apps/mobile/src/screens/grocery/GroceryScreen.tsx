// src/screens/grocery/GroceryScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useGroceryStore } from '../../stores/groceryStore';
import type { GroceryListItem, GroceryReason } from '@preppal/types';

const REASON_LABELS: Record<GroceryReason, string> = {
  low_stock: 'Out of stock',
  expired: 'Expired',
  missing_ingredient: 'Missing from recipe',
  manual: 'Manual add',
};

const REASON_COLORS: Record<GroceryReason, string> = {
  low_stock: '#ef4444',
  expired: '#6b7280',
  missing_ingredient: '#f59e0b',
  manual: '#3b82f6',
};

export function GroceryScreen() {
  const { items, loading, fetch, autoPopulate, toggleChecked, clearCompleted, add } = useGroceryStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  useFocusEffect(
    useCallback(() => {
      autoPopulate(); // also calls fetch inside
    }, [])
  );

  const unchecked = items.filter((i) => !i.is_checked);
  const checked = items.filter((i) => i.is_checked);

  const handleToggle = async (item: GroceryListItem) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleChecked(item.id);
  };

  const handleClearCompleted = () => {
    Alert.alert(
      'Clear Completed',
      'Remove all checked items from your grocery list?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearCompleted },
      ]
    );
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    await add({ name: newItemName.trim(), reason: 'manual' });
    setNewItemName('');
    setShowAddModal(false);
  };

  const renderItem = ({ item }: { item: GroceryListItem }) => (
    <TouchableOpacity
      style={[s.itemRow, item.is_checked && s.itemRowChecked]}
      onPress={() => handleToggle(item)}
      activeOpacity={0.7}
    >
      <View style={[s.checkbox, item.is_checked && s.checkboxChecked]}>
        {item.is_checked && <Text style={s.checkmark}>✓</Text>}
      </View>
      <View style={s.itemInfo}>
        <Text style={[s.itemName, item.is_checked && s.itemNameChecked]}>
          {item.name}
        </Text>
        {item.quantity && (
          <Text style={s.itemQty}>
            {item.quantity} {item.unit}
          </Text>
        )}
      </View>
      <View style={[s.reasonBadge, { backgroundColor: REASON_COLORS[item.reason] + '22' }]}>
        <Text style={[s.reasonText, { color: REASON_COLORS[item.reason] }]}>
          {REASON_LABELS[item.reason]}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe}>
      {/* Header actions */}
      <View style={s.topRow}>
        <Text style={s.count}>{unchecked.length} items to buy</Text>
        {checked.length > 0 && (
          <TouchableOpacity onPress={handleClearCompleted}>
            <Text style={s.clearBtn}>Clear {checked.length} done</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={[...unchecked, ...checked]}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={autoPopulate} tintColor="#22c55e" />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🛒</Text>
            <Text style={s.emptyTitle}>Your list is empty</Text>
            <Text style={s.emptySubtitle}>
              Items appear here automatically when pantry stock runs low or food expires.
            </Text>
          </View>
        }
        contentContainerStyle={items.length === 0 ? { flex: 1 } : undefined}
      />

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add item modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} onPress={() => setShowAddModal(false)} activeOpacity={1}>
          <View style={s.modalSheet}>
            <Text style={s.modalTitle}>Add Item</Text>
            <TextInput
              style={s.input}
              placeholder="Item name…"
              placeholderTextColor="#6b7280"
              value={newItemName}
              onChangeText={setNewItemName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleAddItem}
            />
            <TouchableOpacity style={s.addBtn} onPress={handleAddItem}>
              <Text style={s.addBtnText}>Add to List</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  topRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  count: { fontSize: 14, fontWeight: '600', color: '#9ca3af' },
  clearBtn: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937', gap: 12,
  },
  itemRowChecked: { opacity: 0.5 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#374151',
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  checkmark: { fontSize: 14, color: '#0f1117', fontWeight: '700' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#f9fafb' },
  itemNameChecked: { textDecorationLine: 'line-through', color: '#6b7280' },
  itemQty: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  reasonBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  reasonText: { fontSize: 10, fontWeight: '700' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#f9fafb', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#22c55e', shadowOpacity: 0.5,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  fabText: { fontSize: 30, fontWeight: '300', color: '#0f1117', lineHeight: 34 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#1a1f2e', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#f9fafb', marginBottom: 16 },
  input: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    fontSize: 16, color: '#f9fafb', borderWidth: 1, borderColor: '#374151', marginBottom: 12,
  },
  addBtn: {
    backgroundColor: '#22c55e', borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  addBtnText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
});
