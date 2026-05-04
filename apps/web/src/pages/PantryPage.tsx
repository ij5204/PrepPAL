import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getExpiryStatus } from '@preppal/utils';
import type { PantryItem, Unit, Category } from '@preppal/types';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp'];
const CATEGORIES: Category[] = ['produce', 'dairy', 'protein', 'pantry', 'spice', 'other'];
const CATEGORY_ICONS: Record<Category, string> = {
  produce: '🥦', dairy: '🥛', protein: '🍗', pantry: '🫙', spice: '🌶️', other: '📦',
};
const EXPIRY_COLORS = { ok: '#22c55e', warning: '#f59e0b', danger: '#ef4444', expired: '#6b7280' };

interface FormState {
  name: string; quantity: string; unit: Unit; expiry_date: string; category: Category; notes: string;
}
const EMPTY_FORM: FormState = { name: '', quantity: '', unit: 'pieces', expiry_date: '', category: 'other', notes: '' };

const inputStyle: React.CSSProperties = {
  width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 10,
  padding: '10px 14px', fontSize: 14, color: '#f9fafb', outline: 'none', boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' };
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.5px', display: 'block', marginBottom: 6,
};

// ── Modal ─────────────────────────────────────────────────────────────────────

interface PantryModalProps {
  item: PantryItem | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function PantryModal({ item, onClose, onSaved }: PantryModalProps) {
  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(
    item
      ? { name: item.name, quantity: String(item.quantity), unit: item.unit, expiry_date: item.expiry_date ?? '', category: item.category, notes: item.notes ?? '' }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) return setError('Name is required.');
    const qty = parseFloat(form.quantity);
    if (isNaN(qty) || qty <= 0) return setError('Quantity must be greater than 0.');

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim().replace(/\b\w/g, c => c.toUpperCase()),
        quantity: qty,
        unit: form.unit,
        expiry_date: form.expiry_date || null,
        category: form.category,
        notes: form.notes.trim() || null,
      };

      if (isEdit) {
        const { error: err } = await supabase.from('pantry_items').update(payload).eq('id', item.id);
        if (err) throw err;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated. Please refresh and try again.');
        const { error: err } = await supabase.from('pantry_items').insert({ ...payload, user_id: session.user.id });
        if (err) throw err;
      }

      await onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div style={{ background: '#1a1f2e', borderRadius: 18, border: '1px solid #1f2937', width: '100%', maxWidth: 480, padding: 28, boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#f9fafb' }}>{isEdit ? 'Edit Item' : 'Add Item'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 4 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input style={inputStyle} placeholder="e.g. Chicken Breast" value={form.name} onChange={set('name')} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Quantity *</label>
              <input style={inputStyle} type="number" min="0" step="any" placeholder="e.g. 500" value={form.quantity} onChange={set('quantity')} />
            </div>
            <div>
              <label style={labelStyle}>Unit *</label>
              <select style={selectStyle} value={form.unit} onChange={set('unit')}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Category *</label>
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

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 } as React.CSSProperties} placeholder="e.g. lactose free, organic…" value={form.notes} onChange={set('notes')} />
          </div>

          {error && (
            <div style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #374151', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: '#22c55e', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: '#0f1117', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Pantry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

interface DeleteConfirmProps {
  item: PantryItem; onCancel: () => void; onConfirm: () => void; deleting: boolean;
}

function DeleteConfirm({ item, onCancel, onConfirm, deleting }: DeleteConfirmProps) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001, padding: 16 }}
    >
      <div style={{ background: '#1a1f2e', borderRadius: 16, border: '1px solid #1f2937', width: '100%', maxWidth: 360, padding: 24 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#f9fafb' }}>Delete "{item.name}"?</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#9ca3af', lineHeight: 1.5 }}>This will remove it from your pantry. This cannot be undone.</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: 'none', border: '1px solid #374151', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting} style={{ flex: 1, background: '#ef4444', border: 'none', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 700, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [modalItem, setModalItem] = useState<PantryItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PantryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const initialLoadDone = useRef(false);
  // Ref that always reflects current modalOpen — used inside event listeners
  // to avoid stale closure values
  const modalOpenRef = useRef(false);

  // Keep the ref in sync with state
  useEffect(() => {
    modalOpenRef.current = modalOpen;
  }, [modalOpen]);

  const fetchItems = useCallback(async () => {
    if (!initialLoadDone.current) setLoading(true);
    try {
      const { data } = await supabase.from('pantry_items').select('*').order('category').order('name');
      setItems((data as PantryItem[]) ?? []);
    } finally {
      setLoading(false);
      initialLoadDone.current = true;
    }
  }, []);

  useEffect(() => {
    fetchItems();

    const channel = supabase
      .channel('pantry_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => {
        // Don't refetch while the modal is open — it will cause save to loop
        if (!modalOpenRef.current) fetchItems();
      })
      .subscribe();

    // Only refetch on tab/window return if modal is NOT open
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !modalOpenRef.current) fetchItems();
    };
    const onFocus = () => {
      if (!modalOpenRef.current) fetchItems();
    };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchItems]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await supabase.from('pantry_items').delete().eq('id', deleteTarget.id);
      setDeleteTarget(null);
      await fetchItems();
    } finally {
      setDeleting(false);
    }
  };

  const filtered = items.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'all' || i.category === activeCategory;
    return matchSearch && matchCat;
  });

  const counts: Partial<Record<Category | 'all', number>> = { all: items.length };
  items.forEach(i => { counts[i.category] = (counts[i.category] ?? 0) + 1; });

  const filterTabs: Array<{ key: Category | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'produce', label: '🥦 Produce' },
    { key: 'dairy', label: '🥛 Dairy' },
    { key: 'protein', label: '🍗 Protein' },
    { key: 'pantry', label: '🫙 Pantry' },
    { key: 'spice', label: '🌶️ Spice' },
    { key: 'other', label: '📦 Other' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', margin: 0 }}>Pantry</h1>
          <p style={{ color: '#9ca3af', marginTop: 4, marginBottom: 0, fontSize: 14 }}>
            {items.length} item{items.length !== 1 ? 's' : ''} in your kitchen
          </p>
        </div>
        <button
          onClick={() => { setModalItem(null); setModalOpen(true); }}
          style={{ background: '#22c55e', color: '#0f1117', border: 'none', borderRadius: 12, padding: '11px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          + Add Item
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="Search items…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', background: '#1a1f2e', border: '1px solid #374151', borderRadius: 12, padding: '12px 16px', fontSize: 15, color: '#f9fafb', marginTop: 20, marginBottom: 14, outline: 'none', boxSizing: 'border-box' }}
      />

      {/* Category filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {filterTabs.map(({ key, label }) => {
          const count = counts[key] ?? 0;
          const active = activeCategory === key;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              style={{ background: active ? '#22c55e' : '#1a1f2e', color: active ? '#0f1117' : '#9ca3af', border: active ? 'none' : '1px solid #1f2937', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {label} {count > 0 && <span style={{ opacity: 0.7, marginLeft: 3 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <p style={{ color: '#6b7280', padding: 24 }}>Loading…</p>
      ) : (
        <div style={{ background: '#1a1f2e', borderRadius: 14, border: '1px solid #1f2937', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🫙</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 6 }}>
                {search || activeCategory !== 'all' ? 'No items match your filter' : 'Your pantry is empty'}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {search || activeCategory !== 'all' ? 'Try a different search or category' : 'Add your first item to get started'}
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1f2937' }}>
                  {['Name', 'Quantity', 'Category', 'Expires', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Actions' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date);
                  const color = EXPIRY_COLORS[status];
                  return (
                    <tr
                      key={item.id}
                      style={{ borderBottom: '1px solid #111827' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#111827')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{item.name}</div>
                        {item.notes && <div style={{ fontSize: 12, color: '#4b5563', marginTop: 2 }}>{item.notes}</div>}
                      </td>
                      <td style={{ padding: '13px 16px', fontSize: 14, color: '#9ca3af' }}>{item.quantity} {item.unit}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ background: '#111827', borderRadius: 8, padding: '3px 10px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>
                          {CATEGORY_ICONS[item.category]} {item.category}
                        </span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {item.expiry_date
                          ? <span style={{ color, fontSize: 13, fontWeight: 600 }}>{status === 'expired' ? 'Expired' : daysUntilExpiry === 0 ? 'Today' : `${daysUntilExpiry}d`}</span>
                          : <span style={{ color: '#374151', fontSize: 13 }}>—</span>}
                      </td>
                      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setModalItem(item); setModalOpen(true); }}
                            style={{ background: '#1f2937', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item)}
                            style={{ background: 'none', border: '1px solid #374151', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#ef4444', cursor: 'pointer' }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <PantryModal
          item={modalItem}
          onClose={() => setModalOpen(false)}
          onSaved={fetchItems}
        />
      )}

      {/* Delete Confirm */}
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