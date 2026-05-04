import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getExpiryStatus } from '@preppal/utils';
import type { PantryItem, Unit, Category } from '@preppal/types';

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'cups', 'pieces', 'tsp', 'tbsp'];
const CATEGORIES: Category[] = ['produce', 'dairy', 'protein', 'pantry', 'spice', 'other'];

const CATEGORY_ICONS: Record<Category, string> = {
  produce: '🥦',
  dairy: '🥛',
  protein: '🥩',
  pantry: '🫙',
  spice: '🧂',
  other: '📦',
};

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
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };
const labelStyle: React.CSSProperties = {
  fontSize: 11.5, fontWeight: 750, color: 'var(--text-muted)', textTransform: 'uppercase',
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
    if (preset) { setForm({ ...EMPTY_FORM, ...preset }); return; }
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
          <h2 className="modalTitle">
            {CATEGORY_ICONS[form.category]} {isEdit ? 'Edit Item' : 'Add Item'}
          </h2>
          <button type="button" className="modalClose" onClick={onClose}>×</button>
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

          {error && <div className="calloutDanger" style={{ marginBottom: 0 }}>{error}</div>}

          <div className="flexActions">
            <button type="button" onClick={onClose} className="btn" style={{ flex: 1 }}>Cancel</button>
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

function DeleteConfirm({ item, onCancel, onConfirm, deleting }: {
  item: PantryItem; onCancel: () => void; onConfirm: () => void; deleting: boolean;
}) {
  return (
    <div className="modalOverlay" style={{ zIndex: 1001 }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modalPanel modalPanelSm" onClick={e => e.stopPropagation()}>
        <h3 className="modalTitle" style={{ fontSize: 18, marginBottom: 10 }}>Delete "{item.name}"?</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          This will remove it from your pantry. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={onCancel} className="btn" style={{ flex: 1 }}>Cancel</button>
          <button
            type="button" onClick={onConfirm} disabled={deleting}
            style={{ flex: 1, background: 'var(--danger)', border: 'none', borderRadius: 'var(--radius-sm)', padding: 11, fontSize: 14, fontWeight: 700, color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pantry Card ───────────────────────────────────────────────────────────────

function PantryItemCard({ item, onEdit, onDelete }: { item: PantryItem; onEdit: () => void; onDelete: () => void }) {
  const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date) as { status: ExpiryStatus; daysUntilExpiry: number };
  const color = EXPIRY_COLORS[status];

  const expiryLabel = !item.expiry_date ? null
    : status === 'expired' ? 'Expired'
    : daysUntilExpiry === 0 ? 'Today'
    : daysUntilExpiry === 1 ? '1 day'
    : `${daysUntilExpiry}d`;

  const expiryBg = {
    ok: 'rgba(34,197,94,0.09)',
    warning: 'rgba(245,158,11,0.10)',
    danger: 'rgba(239,68,68,0.10)',
    expired: 'rgba(107,114,128,0.10)',
  }[status];

  return (
    <div className="pantryCard animate-fade-in">
      <div className="pantryCardHeader">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span className="categoryIcon">{CATEGORY_ICONS[item.category]}</span>
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25 }}>{item.name}</div>
            {item.notes && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{item.notes}</div>}
          </div>
        </div>
      </div>

      <div className="pantryCardBody">
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {item.quantity}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginLeft: 4 }}>{item.unit}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="pillMuted" style={{ fontSize: 11 }}>
            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
          </span>
          {expiryLabel && (
            <span style={{
              fontSize: 11, fontWeight: 750, color,
              background: expiryBg,
              border: `1px solid ${color}33`,
              borderRadius: 999, padding: '2px 9px',
            }}>
              {status === 'expired' ? '⚠️ ' : status === 'danger' ? '⚠️ ' : ''}{expiryLabel}
            </span>
          )}
        </div>
      </div>

      <div className="pantryCardFooter">
        <button type="button" className="btnGhostSm" onClick={onEdit} style={{ flex: 1, textAlign: 'center' }}>Edit</button>
        <button type="button" className="btnDangerSm" onClick={onDelete} style={{ flex: 1, textAlign: 'center' }}>Delete</button>
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
  const modalOpenRef = useRef(false);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

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
        if (!modalOpenRef.current) fetchItems();
      })
      .subscribe();

    const onVisible = () => { if (document.visibilityState === 'visible' && !modalOpenRef.current) fetchItems(); };
    const onFocus = () => { if (!modalOpenRef.current) fetchItems(); };

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
    { key: 'protein', label: '🥩 Protein' },
    { key: 'pantry', label: '🫙 Pantry' },
    { key: 'spice', label: '🧂 Spice' },
    { key: 'other', label: '📦 Other' },
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
          + Add item
        </button>
      </div>

      {/* Search */}
      <input
        className="iosSearch"
        placeholder="Search items…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Common suggestions */}
      {search.trim() === '' && commonSuggestions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <div className="sectionEyebrow">Quick add</div>
            <div className="sectionEyebrowHint">Tap + to add</div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {commonSuggestions.map(s => (
              <div key={s.name} className="suggestionChip">
                <div className="suggestionChipLabel">{CATEGORY_ICONS[s.category]} {s.name}</div>
                <button
                  type="button"
                  className="chipIconBtn"
                  onClick={() => { setModalItem(null); setModalPreset({ name: s.name, category: s.category, unit: s.unit }); setModalOpen(true); }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="filterPills">
        {filterTabs.map(({ key, label }) => {
          const count = counts[key] ?? 0;
          return (
            <button
              type="button"
              key={key}
              className={`filterPill ${activeCategory === key ? 'filterPillActive' : ''}`}
              onClick={() => setActiveCategory(key)}
            >
              {label}{count > 0 && <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Card grid */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '32px 0', color: 'var(--text-muted)' }}>
          <div className="animate-spin" style={{ width: 18, height: 18, border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)', borderRadius: '50%' }} />
          Loading items…
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>{activeCategory !== 'all' ? CATEGORY_ICONS[activeCategory as Category] : '🫙'}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            {search || activeCategory !== 'all' ? 'No items match your filter' : 'Your pantry is empty'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            {search || activeCategory !== 'all' ? 'Try a different search or category' : 'Add your first item to get started'}
          </div>
          {!search && activeCategory === 'all' && (
            <button className="btn btnPrimary" onClick={() => { setModalItem(null); setModalOpen(true); }}>
              + Add first item
            </button>
          )}
        </div>
      ) : (
        <div className="pantryGrid">
          {filtered.map(item => (
            <PantryItemCard
              key={item.id}
              item={item}
              onEdit={() => { setModalItem(item); setModalOpen(true); }}
              onDelete={() => setDeleteTarget(item)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <PantryModal
          item={modalItem}
          preset={modalItem ? null : modalPreset}
          onClose={() => { setModalOpen(false); setModalPreset(null); }}
          onSaved={fetchItems}
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
