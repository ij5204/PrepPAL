// src/screens/pantry/PantryScreen.tsx
import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { usePantryStore } from '../../stores/pantryStore';
import { getExpiryStatus, formatDate, formatQuantity } from '@preppal/utils';
import type { PantryItem, Category } from '@preppal/types';
import { AddItemSheet } from '../../components/pantry/AddItemSheet';

const CATEGORIES: Array<{ key: Category | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'produce', label: 'Produce' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'protein', label: 'Protein' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'spice', label: 'Spice' },
  { key: 'other', label: 'Other' },
];

const CATEGORY_ICONS: Record<string, string> = {
  produce: '🥦', dairy: '🥛', protein: '🥩',
  pantry: '🫙', spice: '🧂', other: '📦',
};

const EXPIRY_COLORS = {
  ok: '#22c55e', warning: '#f59e0b', danger: '#ef4444', expired: '#6b7280',
};

export function PantryScreen() {
  const { items, loading, selectedCategory, fetch, remove, setCategory } = usePantryStore();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [])
  );

  const filtered = selectedCategory === 'all'
    ? items
    : items.filter((i) => i.category === selectedCategory);

  const handleDelete = (item: PantryItem) => {
    Alert.alert(
      'Delete Item',
      `Remove "${item.name}" from your pantry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await remove(item.id);
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: PantryItem }) => {
    const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date);
    const expiryColor = EXPIRY_COLORS[status];

    return (
      <TouchableOpacity
        style={s.itemRow}
        onPress={() => { setEditingItem(item); setShowAddSheet(true); }}
        onLongPress={() => handleDelete(item)}
        delayLongPress={600}
      >
        <Text style={s.categoryIcon}>{CATEGORY_ICONS[item.category] ?? '📦'}</Text>
        <View style={s.itemInfo}>
          <Text style={s.itemName}>{item.name}</Text>
          <Text style={s.itemQty}>{formatQuantity(item.quantity, item.unit)}</Text>
        </View>
        {item.expiry_date && (
          <View style={[s.expiryBadge, { backgroundColor: expiryColor + '22', borderColor: expiryColor }]}>
            <Text style={[s.expiryText, { color: expiryColor }]}>
              {status === 'expired'
                ? 'Expired'
                : daysUntilExpiry === 0
                ? 'Today'
                : `${daysUntilExpiry}d`}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Category filter */}
      <View style={s.filterRow}>
        {CATEGORIES.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[s.filterChip, selectedCategory === key && s.filterChipActive]}
            onPress={() => setCategory(key)}
          >
            <Text style={[s.filterText, selectedCategory === key && s.filterTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetch} tintColor="#22c55e" />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyEmoji}>🧺</Text>
            <Text style={s.emptyTitle}>Your pantry is empty</Text>
            <Text style={s.emptySubtitle}>
              Tap + to add your first item. Add everything — even salt and oil.
            </Text>
          </View>
        }
        contentContainerStyle={filtered.length === 0 ? { flex: 1 } : undefined}
      />

      {/* FAB */}
      <TouchableOpacity
        style={s.fab}
        onPress={() => { setEditingItem(null); setShowAddSheet(true); }}
        activeOpacity={0.85}
      >
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* Add/Edit sheet */}
      <AddItemSheet
        visible={showAddSheet}
        item={editingItem}
        onClose={() => { setShowAddSheet(false); setEditingItem(null); }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f1117' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10,
    gap: 6, flexWrap: 'nowrap',
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#1a1f2e', borderRadius: 20,
    borderWidth: 1, borderColor: '#1f2937',
  },
  filterChipActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  filterTextActive: { color: '#0f1117' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1f2937',
    gap: 12,
  },
  categoryIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#f9fafb' },
  itemQty: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  expiryBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  expiryText: { fontSize: 11, fontWeight: '700' },
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
});
