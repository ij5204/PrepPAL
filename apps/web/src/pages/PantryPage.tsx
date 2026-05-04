import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getExpiryStatus } from '@preppal/utils';
import type { PantryItem, Unit, Category } from '@preppal/types';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp'];
const CATEGORIES: Category[] = ['produce', 'dairy', 'protein', 'pantry', 'spice', 'other'];
const EXPIRY_COLORS = { ok: '#22c55e', warning: '#f59e0b', danger: '#ef4444', expired: '#6b7280' };
type ExpiryStatus = keyof typeof EXPIRY_COLORS;

interface FormState {
  name: string; quantity: string; unit: Unit; expiry_date: string; category: Category; notes: string;
}
const EMPTY_FORM: FormState = { name: '', quantity: '', unit: 'pieces', expiry_date: '', category: 'other', notes: '' };

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--field-bg)',
  border: '1px solid var(--field-border)',
  borderRadius: 12,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
};
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', appearance: 'none' };
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.5px', display: 'block', marginBottom: 6,
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
      ? { name: item.name, quantity: String(item.quantity), unit: item.unit, expiry_date: item.expiry_date ?? '', category: item.category, notes: item.notes ?? '' }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) {
      setForm({ name: item.name, quantity: String(item.quantity), unit: item.unit, expiry_date: item.expiry_date ?? '', category: item.category, notes: item.notes ?? '' });
      return;
    }
    if (preset) {
      setForm({ ...EMPTY_FORM, ...preset });
      return;
    }
    setForm(EMPTY_FORM);
  }, [item, preset]);

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
    <div className="modalOverlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modalPanel" onClick={e => e.stopPropagation()}>
        <div className="modalHead">
          <h2 className="modalTitle">{isEdit ? 'Edit Item' : 'Add Item'}</h2>
          <button type="button" className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="stackSm">
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
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
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
            <div className="calloutDanger" style={{ marginBottom: 0 }}>
              {error}
            </div>
          )}

          <div className="flexActions">
            <button type="button" onClick={onClose} className="btn" style={{ flex: 1 }}>
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn btnPrimary" style={{ flex: 2 }}>
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
    <div className="modalOverlay" style={{ zIndex: 1001 }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modalPanel modalPanelSm" onClick={e => e.stopPropagation()}>
        <h3 className="modalTitle" style={{ fontSize: 18 }}>Delete "{item.name}"?</h3>
        <p style={{ margin: '8px 0 20px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          This will remove it from your pantry. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} className="btn" style={{ flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              flex: 1,
              background: 'var(--danger)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '11px',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
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
  const [modalPreset, setModalPreset] = useState<Partial<FormState> | null>(null);
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
    { key: 'produce', label: 'Produce' },
    { key: 'dairy', label: 'Dairy' },
    { key: 'protein', label: 'Protein' },
    { key: 'pantry', label: 'Pantry' },
    { key: 'spice', label: 'Spice' },
    { key: 'other', label: 'Other' },
  ];

  const COMMON_ITEMS: Array<{ name: string; category: Category; unit: Unit }> = [
    { name: 'Olive oil', category: 'pantry', unit: 'ml' },
    { name: 'Salt', category: 'spice', unit: 'g' },
    { name: 'Black pepper', category: 'spice', unit: 'g' },
    { name: 'Garlic', category: 'produce', unit: 'pieces' },
    { name: 'Onion', category: 'produce', unit: 'pieces' },
    { name: 'Rice', category: 'pantry', unit: 'g' },
    { name: 'Pasta', category: 'pantry', unit: 'g' },
    { name: 'Eggs', category: 'dairy', unit: 'pieces' },
    { name: 'Milk', category: 'dairy', unit: 'ml' },
    { name: 'Butter', category: 'dairy', unit: 'g' },
    { name: 'Flour', category: 'pantry', unit: 'g' },
    { name: 'Sugar', category: 'pantry', unit: 'g' },
    { name: 'Oats', category: 'pantry', unit: 'g' },
    { name: 'Chicken breast', category: 'protein', unit: 'g' },
    { name: 'Canned tomatoes', category: 'pantry', unit: 'pieces' },
  ];

  const existingNames = new Set(items.map(i => i.name.trim().toLowerCase()));
  const commonSuggestions = COMMON_ITEMS
    .filter(s => !existingNames.has(s.name.toLowerCase()))
    .filter(s => activeCategory === 'all' || s.category === activeCategory)
    .slice(0, 10);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 className="pageTitle" style={{ margin: 0 }}>Pantry</h1>
          <p className="pageSubtitle" style={{ marginTop: 4, marginBottom: 0 }}>
            {items.length} item{items.length !== 1 ? 's' : ''} in your kitchen
          </p>
        </div>
        <button onClick={() => { setModalItem(null); setModalOpen(true); }} className="btn btnPrimary">
          Add item
        </button>
      </div>

      {/* Search */}
      <input
        className="iosSearch"
        placeholder="Search items…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Search pantry items"
      />

      {/* Common suggestions */}
      {search.trim() === '' && commonSuggestions.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="sectionEyebrow">Common items</div>
            <div className="sectionEyebrowHint">
              Tap <span style={{ fontWeight: 800 }}>+</span> to add
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {commonSuggestions.map(s => (
              <div key={s.name} className="suggestionChip">
                <div className="suggestionChipLabel">{s.name}</div>
                <button
                  type="button"
                  className="chipIconBtn"
                  onClick={() => {
                    setModalItem(null);
                    setModalPreset({ name: s.name, category: s.category, unit: s.unit });
                    setModalOpen(true);
                  }}
                  aria-label={`Add ${s.name}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter tabs */}
      <div className="filterPills">
        {filterTabs.map(({ key, label }) => {
          const count = counts[key] ?? 0;
          const active = activeCategory === key;
          return (
            <button
              type="button"
              key={key}
              className={`filterPill ${active ? 'filterPillActive' : ''}`}
              onClick={() => setActiveCategory(key)}
            >
              {label}{count > 0 && <span style={{ opacity: 0.7, marginLeft: 3 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <p className="muted" style={{ padding: 24 }}>Loading…</p>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                {search || activeCategory !== 'all' ? 'No items match your filter' : 'Your pantry is empty'}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {search || activeCategory !== 'all' ? 'Try a different search or category' : 'Add your first item to get started'}
              </div>
            </div>
          ) : (
            <table className="iosTable">
              <thead>
                <tr>
                  {['Name', 'Quantity', 'Category', 'Expires', 'Actions'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date) as {
                    status: ExpiryStatus;
                    daysUntilExpiry: number;
                  };
                  const color = EXPIRY_COLORS[status];
                  return (
                    <tr key={item.id}>
                      <td>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{item.name}</div>
                        {item.notes && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{item.notes}</div>}
                      </td>
                      <td style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{item.quantity} {item.unit}</td>
                      <td>
                        <span className="pillMuted">
                          {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                        </span>
                      </td>
                      <td>
                        {item.expiry_date
                          ? <span style={{ color, fontSize: 13, fontWeight: 600 }}>{status === 'expired' ? 'Expired' : daysUntilExpiry === 0 ? 'Today' : `${daysUntilExpiry}d`}</span>
                          : <span className="muted" style={{ fontSize: 13 }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btnGhostSm"
                            onClick={() => { setModalItem(item); setModalOpen(true); }}
                          >
                            Edit
                          </button>
                          <button type="button" className="btnDangerSm" onClick={() => setDeleteTarget(item)}>
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
          preset={modalItem ? null : modalPreset}
          onClose={() => { setModalOpen(false); setModalPreset(null); }}
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