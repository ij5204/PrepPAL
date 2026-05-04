// src/components/pantry/AddItemSheet.tsx
import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet,
  Modal, ScrollView, ActivityIndicator, Alert, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { usePantryStore } from '../../stores/pantryStore';
import type { PantryItem, Unit, Category } from '@preppal/types';
import { AddPantryItemSchema } from '@preppal/validation';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp'];
const CATEGORIES: Array<{ key: Category; label: string; emoji: string }> = [
  { key: 'produce', label: 'Produce', emoji: '🥦' },
  { key: 'dairy', label: 'Dairy', emoji: '🥛' },
  { key: 'protein', label: 'Protein', emoji: '🥩' },
  { key: 'pantry', label: 'Pantry', emoji: '🫙' },
  { key: 'spice', label: 'Spice', emoji: '🧂' },
  { key: 'other', label: 'Other', emoji: '📦' },
];

interface Props {
  visible: boolean;
  item: PantryItem | null; // null = add mode, non-null = edit mode
  onClose: () => void;
}

interface FormState {
  name: string;
  quantity: string;
  unit: Unit;
  category: Category;
  expiry_date: string;
  notes: string;
}

const defaultForm = (): FormState => ({
  name: '',
  quantity: '',
  unit: 'pieces',
  category: 'other',
  expiry_date: '',
  notes: '',
});

export function AddItemSheet({ visible, item, onClose }: Props) {
  const { add, update } = usePantryStore();
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [permission, requestPermission] = useCameraPermissions();

  const isEdit = !!item;

  // Populate form when editing
  useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        quantity: String(item.quantity),
        unit: item.unit,
        category: item.category,
        expiry_date: item.expiry_date ?? '',
        notes: item.notes ?? '',
      });
    } else {
      setForm(defaultForm());
    }
    setErrors({});
  }, [item, visible]);

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (lookingUp) return;
    setScanning(false);
    setLookingUp(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      // Per spec: Open Food Facts for name + category ONLY — never for nutrition
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v3/product/${data}.json?fields=product_name,categories_tags`
      );
      const json = await res.json();
      const product = json?.product;

      if (product?.product_name) {
        const rawCategory = product.categories_tags?.[0] ?? '';
        const category = mapOFFCategory(rawCategory);
        setForm((f) => ({
          ...f,
          name: product.product_name,
          category,
        }));
      } else {
        Alert.alert('Product not found', 'Barcode scanned but product not in database. Enter details manually.');
      }
    } catch {
      Alert.alert('Lookup failed', 'Could not fetch product info. Please enter details manually.');
    }

    setLookingUp(false);
  };

  const openCamera = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Camera permission required', 'Allow camera access in settings to scan barcodes.');
        return;
      }
    }
    setScanning(true);
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (!form.quantity || isNaN(Number(form.quantity)) || Number(form.quantity) <= 0) {
      newErrors.quantity = 'Enter a quantity greater than 0';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      quantity: parseFloat(form.quantity),
      unit: form.unit,
      category: form.category,
      expiry_date: form.expiry_date || null,
      notes: form.notes.trim() || null,
    };

    const result = isEdit
      ? await update(item!.id, payload)
      : await add(payload);

    if (result.error) {
      Alert.alert('Error', result.error.message);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    }

    setSaving(false);
  };

  return (
    <>
      {/* Barcode scanner modal */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={s.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={handleBarcodeScan}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'qr'] }}
          />
          <View style={s.scannerOverlay}>
            <View style={s.scannerFrame} />
            <Text style={s.scannerHint}>Point at the barcode on your food packaging</Text>
          </View>
          <TouchableOpacity style={s.scannerClose} onPress={() => setScanning(false)}>
            <Text style={s.scannerCloseText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Add/Edit sheet */}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <TouchableOpacity style={s.overlay} onPress={onClose} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Handle bar */}
              <View style={s.handle} />

              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{isEdit ? 'Edit Item' : 'Add Pantry Item'}</Text>
                <TouchableOpacity style={s.scanBtn} onPress={openCamera}>
                  {lookingUp ? (
                    <ActivityIndicator size="small" color="#22c55e" />
                  ) : (
                    <Text style={s.scanBtnText}>📷 Scan</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <View style={s.field}>
                <Text style={s.label}>Name *</Text>
                <TextInput
                  style={[s.input, errors.name ? s.inputError : undefined]}
                  placeholder="e.g. Chicken Breast"
                  placeholderTextColor="#6b7280"
                  value={form.name}
                  onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                  autoCapitalize="words"
                />
                {errors.name && <Text style={s.errorText}>{errors.name}</Text>}
              </View>

              {/* Quantity + Unit */}
              <View style={s.row}>
                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Quantity *</Text>
                  <TextInput
                    style={[s.input, errors.quantity ? s.inputError : undefined]}
                    placeholder="0"
                    placeholderTextColor="#6b7280"
                    value={form.quantity}
                    onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))}
                    keyboardType="decimal-pad"
                  />
                  {errors.quantity && <Text style={s.errorText}>{errors.quantity}</Text>}
                </View>

                <View style={[s.field, { flex: 1 }]}>
                  <Text style={s.label}>Unit *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.unitScroll}>
                    {UNITS.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[s.unitChip, form.unit === u && s.unitChipActive]}
                        onPress={() => setForm((f) => ({ ...f, unit: u }))}
                      >
                        <Text style={[s.unitChipText, form.unit === u && s.unitChipTextActive]}>{u}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </View>

              {/* Category */}
              <View style={s.field}>
                <Text style={s.label}>Category *</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={s.categoryRow}>
                    {CATEGORIES.map(({ key, label, emoji }) => (
                      <TouchableOpacity
                        key={key}
                        style={[s.categoryChip, form.category === key && s.categoryChipActive]}
                        onPress={() => setForm((f) => ({ ...f, category: key }))}
                      >
                        <Text style={s.categoryEmoji}>{emoji}</Text>
                        <Text style={[s.categoryLabel, form.category === key && s.categoryLabelActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Expiry date */}
              <View style={s.field}>
                <Text style={s.label}>Expiry Date (optional)</Text>
                <TextInput
                  style={s.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#6b7280"
                  value={form.expiry_date}
                  onChangeText={(v) => setForm((f) => ({ ...f, expiry_date: v }))}
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              {/* Notes */}
              <View style={s.field}>
                <Text style={s.label}>Notes (optional)</Text>
                <TextInput
                  style={[s.input, { minHeight: 72 }]}
                  placeholder="e.g. lactose free, opened"
                  placeholderTextColor="#6b7280"
                  value={form.notes}
                  onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
                  multiline
                />
              </View>

              {/* Actions */}
              <View style={s.actions}>
                <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
                  <Text style={s.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, saving && { opacity: 0.7 }]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#0f1117" size="small" />
                  ) : (
                    <Text style={s.saveText}>{isEdit ? 'Save Changes' : 'Add to Pantry'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={{ height: 40 }} />
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function mapOFFCategory(tag: string): Category {
  const t = tag.toLowerCase();
  if (t.includes('dairy') || t.includes('milk') || t.includes('cheese')) return 'dairy';
  if (t.includes('meat') || t.includes('fish') || t.includes('seafood') || t.includes('egg')) return 'protein';
  if (t.includes('vegetable') || t.includes('fruit') || t.includes('produce')) return 'produce';
  if (t.includes('spice') || t.includes('herb') || t.includes('condiment')) return 'spice';
  if (t.includes('cereal') || t.includes('bread') || t.includes('pasta') || t.includes('grain')) return 'pantry';
  return 'other';
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1a1f2e', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '92%', paddingHorizontal: 20,
  },
  handle: {
    width: 40, height: 4, backgroundColor: '#374151', borderRadius: 2,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 12,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#f9fafb' },
  scanBtn: {
    backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#374151',
  },
  scanBtnText: { fontSize: 14, fontWeight: '600', color: '#22c55e' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#111827', borderRadius: 12, padding: 14,
    fontSize: 16, color: '#f9fafb', borderWidth: 1, borderColor: '#374151',
  },
  inputError: { borderColor: '#ef4444' },
  errorText: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12 },
  unitScroll: { marginTop: 0 },
  unitChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#111827', marginRight: 6, borderWidth: 1, borderColor: '#374151',
  },
  unitChipActive: { backgroundColor: '#052e16', borderColor: '#22c55e' },
  unitChipText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  unitChipTextActive: { color: '#22c55e' },
  categoryRow: { flexDirection: 'row', gap: 8 },
  categoryChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#111827', borderRadius: 12, borderWidth: 1, borderColor: '#374151',
  },
  categoryChipActive: { backgroundColor: '#052e16', borderColor: '#22c55e' },
  categoryEmoji: { fontSize: 20, marginBottom: 4 },
  categoryLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  categoryLabelActive: { color: '#22c55e' },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: '#111827', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', borderWidth: 1, borderColor: '#374151',
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#9ca3af' },
  saveBtn: { flex: 2, backgroundColor: '#22c55e', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText: { fontSize: 16, fontWeight: '700', color: '#0f1117' },
  // Scanner
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center',
  },
  scannerFrame: {
    width: 260, height: 180, borderWidth: 2, borderColor: '#22c55e', borderRadius: 12,
    marginBottom: 20,
  },
  scannerHint: { color: '#fff', fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
  scannerClose: {
    position: 'absolute', bottom: 60, left: 0, right: 0, alignItems: 'center',
  },
  scannerCloseText: {
    color: '#fff', fontSize: 17, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 20,
  },
});
