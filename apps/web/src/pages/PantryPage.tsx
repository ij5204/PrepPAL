import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { getExpiryStatus } from '@preppal/utils';
import type { PantryItem, Unit, Category } from '@preppal/types';
import { ScanReceiptModal } from '../components/ScanReceiptModal';

// Module-level cache — survives React Router navigation
let _cache: PantryItem[] = [];
let _cacheReady = false;

const UNITS: Unit[] = [
  // Weight
  'g', 'kg', 'oz', 'lbs',
  // Volume
  'ml', 'l', 'fl oz', 'pt', 'qt', 'gal',
  // Cooking
  'tsp', 'tbsp', 'cups',
  // Count
  'pieces', 'dozen', 'bunch', 'head', 'clove',
  // Package
  'can', 'bottle', 'box', 'bag', 'jar', 'pack', 'slice', 'serving',
];
const CATEGORIES: Category[] = ['produce', 'dairy', 'protein', 'pantry', 'spice', 'other'];

const CATEGORY_ICONS: Record<Category, string> = {
  produce: '🥦',
  dairy: '🥛',
  protein: '🥩',
  pantry: '🫙',
  spice: '🧂',
  other: '📦',
};

const CATEGORY_SVG: Record<Category, React.ReactNode> = {
  produce: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12M12 12C12 7 7 4 3 6c4-1 9 1 9 6zM12 12c0-5 5-8 9-6-4-1-9 1-9 6z"/>
    </svg>
  ),
  dairy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a8 8 0 000 16 8 8 0 000-16zM12 18v4M8 20h8"/>
    </svg>
  ),
  protein: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  pantry: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="5" r="1.5"/><circle cx="12" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/>
      <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
      <circle cx="5" cy="19" r="1.5"/><circle cx="12" cy="19" r="1.5"/><circle cx="19" cy="19" r="1.5"/>
    </svg>
  ),
  spice: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L8 8h8L12 2zM8 8v10a4 4 0 008 0V8"/>
    </svg>
  ),
  other: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10H3M21 10V19a2 2 0 01-2 2H5a2 2 0 01-2-2V10M21 10l-2-7H5L3 10"/>
    </svg>
  ),
};

interface FormState {
  name: string; quantity: string; unit: Unit; expiry_date: string; category: Category; notes: string;
  package_size: string; package_unit: string;
}
const EMPTY_FORM: FormState = {
  name: '', quantity: '', unit: 'pieces', expiry_date: '', category: 'other', notes: '',
  package_size: '', package_unit: '',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surf2)',
  border: '1px solid var(--bdr2)',
  borderRadius: 9,
  padding: '10px 13px',
  fontSize: 13,
  color: 'var(--txt)',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'var(--fb)',
  transition: 'border-color .15s',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' as any };
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: 'var(--txt2)', textTransform: 'uppercase' as any,
  letterSpacing: '1px', display: 'block', marginBottom: 5,
};

// ── Modal ─────────────────────────────────────────────────────────────────────

interface PantryModalProps {
  item: PantryItem | null;
  preset?: Partial<FormState> | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function PantryModal({ item, preset, onClose, onSaved }: PantryModalProps) {
  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(
    item
      ? { name: item.name, quantity: String(item.quantity), unit: item.unit, expiry_date: item.expiry_date ?? '', category: item.category, notes: item.notes ?? '', package_size: item.package_size != null ? String(item.package_size) : '', package_unit: item.package_unit ?? '' }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isSavingRef = useRef(false);

  useEffect(() => {
    setSaving(false);
    isSavingRef.current = false;
    setError('');
    if (item) {
      setForm({ name: item.name, quantity: String(item.quantity), unit: item.unit, expiry_date: item.expiry_date ?? '', category: item.category, notes: item.notes ?? '', package_size: item.package_size != null ? String(item.package_size) : '', package_unit: item.package_unit ?? '' });
      return;
    }
    if (preset) { setForm({ ...EMPTY_FORM, ...preset }); return; }
    setForm(EMPTY_FORM);
  }, [item, preset]);

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    if (isSavingRef.current) return;
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    const qty = Number(form.quantity);
    if (isNaN(qty) || qty <= 0) return setError('Quantity must be greater than 0.');

    const { session } = useAuthStore.getState();
    if (!session) { setError('Not authenticated. Please refresh and try again.'); return; }

    isSavingRef.current = true;
    setSaving(true);

    try {
      const pkgSize = form.package_size !== '' ? Number(form.package_size) : null;
      const payload = {
        name: form.name.trim().replace(/\b\w/g, c => c.toUpperCase()),
        quantity: qty,
        unit: form.unit as Unit,
        expiry_date: form.expiry_date || null,
        category: form.category as Category,
        notes: form.notes.trim() || null,
        package_size: pkgSize != null && !isNaN(pkgSize) ? pkgSize : null,
        package_unit: form.package_unit.trim() || null,
      };

      if (isEdit) {
        const { error: err } = await supabase.from('pantry_items').update(payload).eq('id', item.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('pantry_items').insert({ ...payload, user_id: session.user.id });
        if (err) throw err;
      }

      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      isSavingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modalPanel" style={{ width: 480, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="modalTitle">
            {CATEGORY_ICONS[form.category]} {isEdit ? 'EDIT ITEM' : 'ADD PANTRY ITEM'}
          </div>
          <button type="button" className="modalClose" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Item Name</label>
            <input style={inputStyle} placeholder="e.g. Chicken Breast" value={form.name} onChange={set('name')} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input style={inputStyle} type="number" min="0" step="any" placeholder="e.g. 500" value={form.quantity} onChange={set('quantity')} />
            </div>
            <div>
              <label style={labelStyle}>Unit</label>
              <select style={selectStyle} value={form.unit} onChange={set('unit')}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={selectStyle} value={form.category} onChange={set('category')}>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{CATEGORY_ICONS[c]} {c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expiry Date</label>
              <input style={inputStyle} type="date" value={form.expiry_date} onChange={set('expiry_date')} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Package Size</label>
              <input style={inputStyle} type="number" min="0" step="any" placeholder="e.g. 18.5" value={form.package_size} onChange={set('package_size')} />
            </div>
            <div>
              <label style={labelStyle}>Package Unit</label>
              <input style={inputStyle} placeholder="oz, fl oz, gal, lb…" value={form.package_unit} onChange={set('package_unit')} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 } as React.CSSProperties}
              placeholder="e.g. lactose free, organic…" value={form.notes} onChange={set('notes')} />
          </div>

          {error && (
            <div style={{ background: 'rgba(255,77,0,.08)', border: '1px solid rgba(255,77,0,.2)', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#FF7A50' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--bdr)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn" style={{ flex: 1 }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="tbBtn" style={{ flex: 2, borderRadius: 9, fontSize: 15 }}>
            {saving ? 'Saving…' : isEdit ? 'SAVE CHANGES' : 'SAVE ITEM'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirm({ item, onCancel, onConfirm, deleting }: {
  item: PantryItem; onCancel: () => void; onConfirm: () => void; deleting: boolean;
}) {
  return (
    <div className="modalOverlay" style={{ zIndex: 1001 }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modalPanel" style={{ width: 380, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '20px 24px' }}>
          <div className="modalTitle" style={{ fontSize: 20, marginBottom: 10 }}>Delete "{item.name}"?</div>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>
            This will remove it from your pantry. This cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onCancel} className="btn" style={{ flex: 1 }}>Cancel</button>
            <button
              type="button" onClick={onConfirm} disabled={deleting}
              style={{ flex: 1, background: 'var(--acc2)', border: 'none', borderRadius: 'var(--rad)', padding: 11, fontSize: 13, fontWeight: 700, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status badge helper ───────────────────────────────────────────────────────

function getStatusBadge(item: PantryItem): { label: string; dot: string; bg: string; color: string; filled: boolean } {
  if (!item.expiry_date) {
    return { label: 'FRESH', dot: '#22c55e', bg: 'rgba(34,197,94,0.12)', color: '#22c55e', filled: false };
  }
  const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date) as any;
  if (status === 'expired') {
    return { label: 'EXPIRED', dot: '#ef4444', bg: 'rgba(239,68,68,0.18)', color: '#ef4444', filled: true };
  }
  if (daysUntilExpiry === 0) {
    return { label: 'EXP TODAY', dot: '#f97316', bg: 'rgba(249,115,22,0.14)', color: '#f97316', filled: false };
  }
  if (daysUntilExpiry <= 5) {
    return { label: `EXP IN ${daysUntilExpiry}D`, dot: '#f97316', bg: 'rgba(249,115,22,0.12)', color: '#f97316', filled: false };
  }
  return { label: 'FRESH', dot: '#22c55e', bg: 'rgba(34,197,94,0.12)', color: '#22c55e', filled: false };
}

// ── Stepper step size ─────────────────────────────────────────────────────────

function stepFor(unit: Unit): number {
  switch (unit) {
    // metric weight
    case 'g':     return 50;
    case 'kg':    return 0.5;
    // imperial weight
    case 'oz':    return 1;
    case 'lbs':   return 0.5;
    // metric volume
    case 'ml':    return 50;
    case 'l':     return 0.25;
    // imperial volume
    case 'fl oz': return 1;
    case 'pt':    return 0.5;
    case 'qt':    return 0.5;
    case 'gal':   return 0.25;
    // cooking
    case 'tsp':   return 0.5;
    case 'tbsp':  return 0.5;
    case 'cups':  return 0.25;
    // everything else is countable → integer steps
    default:      return 1;
  }
}

function fmtQty(qty: number, unit: Unit): string {
  // Show decimals only for units where fractions are meaningful
  const decimal = ['kg','lbs','l','pt','qt','gal','tsp','tbsp','cups','fl oz'].includes(unit);
  const n = decimal ? parseFloat(qty.toFixed(2)) : qty;
  return `${n} ${unit}`;
}

// ── Item Card ─────────────────────────────────────────────────────────────────

function ItemCard({ item, onEdit, onDelete, onQtyChange }: {
  item: PantryItem;
  onEdit: () => void;
  onDelete: () => void;
  onQtyChange: (newQty: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const badge = getStatusBadge(item);
  const isExpired = badge.label === 'EXPIRED';
  const step = stepFor(item.unit);

  const pkgLine = (() => {
    const catLabel = {
      produce: 'PRODUCE',
      dairy: 'DAIRY',
      protein: 'MEAT & SEAFOOD',
      pantry: 'PANTRY STAPLES',
      spice: 'SPICES',
      other: 'OTHER',
    }[item.category] ?? item.category.toUpperCase();

    if (item.package_size && item.package_unit) {
      return `${catLabel} · ${item.package_size} ${item.package_unit}`;
    }
    if (item.package_size) {
      return `${catLabel} · ${item.package_size} ${item.unit}`;
    }
    return catLabel;
  })();

  return (
    <div
      style={{
        background: isExpired ? 'rgba(239,68,68,0.06)' : 'rgba(14,14,22,0.62)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: isExpired ? '1px solid rgba(239,68,68,0.20)' : '1px solid rgba(255,255,255,0.09)',
        borderRadius: 16,
        padding: 20,
        position: 'relative',
        boxShadow: '0 4px 24px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Top row: badge + menu */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: badge.bg,
          borderRadius: 20,
          padding: badge.filled ? '4px 10px' : '4px 10px',
          border: `1px solid ${badge.color}22`,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: badge.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 10.5, fontWeight: 700, color: badge.color, letterSpacing: '0.6px' }}>
            {badge.label}
          </span>
        </div>

        {/* Three-dot menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', padding: '4px 6px', borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}
          >
            {[0,1,2].map(i => <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'currentColor' }} />)}
          </button>
          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuOpen(false)} />
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 51,
                background: 'rgba(8,8,18,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                overflow: 'hidden',
                minWidth: 130,
                boxShadow: '0 8px 32px rgba(0,0,0,0.50)',
              }}>
                <button
                  onClick={() => { setMenuOpen(false); onEdit(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: 'var(--txt)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--fb)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', fontSize: 13, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--fb)' }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'none')}
                >
                  🗑 Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Name */}
      <div style={{
        fontSize: 22, fontWeight: 700, color: isExpired ? 'var(--txt2)' : 'var(--txt)',
        textDecoration: isExpired ? 'line-through' : 'none',
        marginBottom: 4, lineHeight: 1.2,
      }}>
        {item.name}
      </div>

      {/* Category + package info */}
      <div style={{
        fontSize: 10.5, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '0.6px',
        marginBottom: 20, fontWeight: 500,
      }}>
        {pkgLine}
      </div>

      {/* Bottom row: stepper + icon */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Quantity stepper */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 24,
          overflow: 'hidden',
        }}>
          <button
            onClick={() => onQtyChange(Math.max(0, parseFloat((item.quantity - step).toFixed(4))))}
            style={{ width: 32, height: 34, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fb)' }}
          >
            −
          </button>
          <span style={{ padding: '0 6px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: 'var(--txt)', userSelect: 'none', whiteSpace: 'nowrap' }}>
            {fmtQty(item.quantity, item.unit)}
          </span>
          <button
            onClick={() => onQtyChange(parseFloat((item.quantity + step).toFixed(4)))}
            style={{ width: 32, height: 34, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--fb)' }}
          >
            +
          </button>
        </div>

        {/* Category icon */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.09)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--txt2)',
          flexShrink: 0,
        }}>
          {CATEGORY_SVG[item.category]}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const FILTER_TABS: Array<{ key: Category | 'all'; label: string }> = [
  { key: 'all',     label: 'All Items' },
  { key: 'produce', label: 'Produce' },
  { key: 'protein', label: 'Meat & Seafood' },
  { key: 'dairy',   label: 'Dairy' },
  { key: 'pantry',  label: 'Pantry Staples' },
  { key: 'spice',   label: 'Spices' },
  { key: 'other',   label: 'Other' },
];

export function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>(_cache);
  const [loading, setLoading] = useState(!_cacheReady);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [modalItem, setModalItem] = useState<PantryItem | null>(null);
  const [modalPreset, setModalPreset] = useState<Partial<FormState> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PantryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const modalOpenRef = useRef(false);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => { modalOpenRef.current = modalOpen || scanModalOpen; }, [modalOpen, scanModalOpen]);

  const fetchItems = useCallback(async (isBackground = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isBackground && !_cacheReady) { setLoading(true); setFetchError(''); }

    const { session } = useAuthStore.getState();
    if (!session) {
      isFetchingRef.current = false;
      if (!_cacheReady) { setFetchError('Please log in to view your pantry.'); setLoading(false); }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .order('category')
        .order('name');

      if (!isMountedRef.current) return;
      if (error) throw error;

      _cache = (data as PantryItem[]) ?? [];
      _cacheReady = true;
      setItems(_cache);
      setFetchError('');
    } catch (err: any) {
      if (!isMountedRef.current) return;
      if (!_cacheReady) setFetchError(err.message ?? 'Failed to load pantry items.');
    } finally {
      isFetchingRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems(_cacheReady);

    const channel = supabase
      .channel(`pantry_rt_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => {
        if (!modalOpenRef.current) fetchItems(true);
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !modalOpenRef.current) {
        if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = setTimeout(() => fetchItems(true), 800);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
    };
  }, [fetchItems]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from('pantry_items').delete().eq('id', deleteTarget.id);
      setDeleteTarget(null);
      await fetchItems(true);
    } finally {
      setDeleting(false);
    }
  };

  const handleQtyChange = async (item: PantryItem, newQty: number) => {
    if (newQty < 0) return;
    // Optimistic update
    const updated = items.map(i => i.id === item.id ? { ...i, quantity: newQty } : i);
    setItems(updated);
    _cache = updated;
    await supabase.from('pantry_items').update({ quantity: newQty }).eq('id', item.id);
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'all' || i.category === activeCategory;
    return matchSearch && matchCat;
  });

  const expiringCount = items.filter(i => {
    const { status, daysUntilExpiry } = getExpiryStatus(i.expiry_date) as any;
    return status === 'expired' || (i.expiry_date && daysUntilExpiry <= 3);
  }).length;

  return (
    <div className="pageWrapper" style={{ paddingTop: 32 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, color: 'var(--txt)', margin: '0 0 6px', letterSpacing: '-1px', lineHeight: 1 }}>
          Inventory
        </h1>
        <div style={{ fontSize: 13, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? 'Loading…' : (
            <>
              <span>{items.length} items total</span>
              {expiringCount > 0 && (
                <>
                  <span style={{ color: 'var(--txt3)' }}>·</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#f97316' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f97316', display: 'inline-block' }} />
                    {expiringCount} expiring soon
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Search + Action buttons ── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        {/* Search */}
        <div style={{ flex: 1, position: 'relative' }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt3)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 12,
              padding: '11px 16px 11px 40px',
              fontSize: 13.5, color: 'var(--txt)',
              outline: 'none', fontFamily: 'var(--fb)',
              backdropFilter: 'blur(12px)',
            }}
            placeholder="Search inventory…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Add Item button */}
        <button
          onClick={() => { setModalItem(null); setModalOpen(true); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 12,
            padding: '11px 20px',
            fontSize: 13.5, fontWeight: 600,
            color: 'var(--txt)', cursor: 'pointer',
            fontFamily: 'var(--fb)',
            backdropFilter: 'blur(12px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Item
        </button>

        {/* Scan Receipt button */}
        <button
          onClick={() => setScanModalOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--acc)',
            border: 'none',
            borderRadius: 12,
            padding: '11px 20px',
            fontSize: 13.5, fontWeight: 700,
            color: '#0a0a00', cursor: 'pointer',
            fontFamily: 'var(--fb)',
            whiteSpace: 'nowrap',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M7 7h10M7 11h10M7 15h6"/>
          </svg>
          Scan Receipt
        </button>
      </div>

      {/* ── Category filter tabs ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              style={{
                padding: '7px 16px',
                borderRadius: 24,
                border: isActive ? '1px solid rgba(255,255,255,0.20)' : '1px solid rgba(255,255,255,0.09)',
                background: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                color: isActive ? 'var(--txt)' : 'var(--txt2)',
                fontSize: 13, fontWeight: isActive ? 600 : 400,
                cursor: 'pointer', fontFamily: 'var(--fb)',
                backdropFilter: 'blur(8px)',
                transition: 'all .15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '48px 0', color: 'var(--txt2)', justifyContent: 'center' }}>
          <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.08)', borderTopColor: 'var(--acc)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          Loading inventory…
        </div>
      )}

      {!loading && fetchError && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>Failed to load pantry</div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 16 }}>{fetchError}</div>
          <button className="tbBtn" onClick={() => fetchItems()}>Retry</button>
        </div>
      )}

      {!loading && !fetchError && filtered.length === 0 && (
        <div style={{ padding: '64px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 42, marginBottom: 14 }}>
            {activeCategory !== 'all' ? CATEGORY_ICONS[activeCategory as Category] : '🫙'}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 8 }}>
            {search || activeCategory !== 'all' ? 'No items match your filter' : 'Your pantry is empty'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
            {search || activeCategory !== 'all' ? 'Try a different search or category' : 'Add your first item to get started'}
          </div>
          {!search && activeCategory === 'all' && (
            <button className="tbBtn" onClick={() => { setModalItem(null); setModalOpen(true); }}>+ Add First Item</button>
          )}
        </div>
      )}

      {!loading && !fetchError && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {filtered.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              onEdit={() => { setModalItem(item); setModalOpen(true); }}
              onDelete={() => setDeleteTarget(item)}
              onQtyChange={(newQty) => handleQtyChange(item, newQty)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ── */}
      {modalOpen && (
        <PantryModal
          item={modalItem}
          preset={modalItem ? null : modalPreset}
          onClose={() => { setModalOpen(false); setModalPreset(null); }}
          onSaved={() => fetchItems(true)}
        />
      )}

      {scanModalOpen && (
        <ScanReceiptModal
          existingItems={items}
          onClose={() => setScanModalOpen(false)}
          onSaved={() => fetchItems(true)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          item={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          deleting={deleting}
        />
      )}
    </div>
  );
}
