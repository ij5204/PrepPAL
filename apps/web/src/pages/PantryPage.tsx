import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
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

interface FormState {
  name: string; quantity: string; unit: Unit; expiry_date: string; category: Category; notes: string;
}
const EMPTY_FORM: FormState = { name: '', quantity: '', unit: 'pieces', expiry_date: '', category: 'other', notes: '' };

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

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, resize: 'vertical', minHeight: 64 } as React.CSSProperties}
              placeholder="e.g. lactose free, organic…" value={form.notes} onChange={set('notes')} />
          </div>

          {error && <div style={{ background: 'rgba(255,77,0,.08)', border: '1px solid rgba(255,77,0,.2)', borderRadius: 9, padding: '10px 14px', fontSize: 13, color: '#FF7A50' }}>{error}</div>}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [modalItem, setModalItem] = useState<PantryItem | null>(null);
  const [modalPreset, setModalPreset] = useState<Partial<FormState> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PantryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const modalOpenRef = useRef(false);
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { modalOpenRef.current = modalOpen; }, [modalOpen]);

  // isBackground=true → silent refresh, no spinner (tab focus, realtime).
  // isBackground=false → initial load, shows spinner.
  const fetchItems = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setFetchError('');

    // Hard timeout — guarantees loading is cleared even if the query hangs
    // (e.g. Supabase token refresh blocking getSession on tab focus).
    const timeoutId = setTimeout(() => {
      console.warn('[Pantry] fetch timed out after 8s');
      setLoading(false);
      setFetchError('Request timed out. Please try again.');
    }, 8000);

    try {
      // Sync read from Zustand — never blocks, no async token-refresh wait.
      const session = useAuthStore.getState().session;
      console.log('[Pantry] fetch start — session exists:', !!session);
      if (!session) throw new Error('No active session — please refresh the page.');

      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .order('category')
        .order('name');

      if (error) throw error;

      setItems((data as PantryItem[]) ?? []);
      setFetchError('');
      console.log('[Pantry] fetch success —', data?.length ?? 0, 'items');
    } catch (err: any) {
      console.error('[Pantry] fetch error:', err);
      setFetchError(err.message ?? 'Failed to load pantry items');
      setItems([]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial load — shows spinner
    fetchItems(false);

    // Unique name per mount prevents stale channels from React Strict Mode
    // double-invoke (mount → unmount → mount) from conflicting.
    const channel = supabase
      .channel(`pantry_rt_${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items' }, () => {
        console.log('[Pantry] realtime change — silent refresh');
        if (!modalOpenRef.current) fetchItems(true);
      })
      .subscribe((status) => {
        console.log('[Pantry] realtime status:', status);
      });

    // Tab-focus refresh — silent, no spinner
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !modalOpenRef.current) {
        if (visibilityTimerRef.current) clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = setTimeout(() => {
          console.log('[Pantry] tab visible — silent refresh');
          fetchItems(true);
        }, 800);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      console.log('[Pantry] cleanup');
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
    { name: 'Olive Oil', category: 'pantry', unit: 'ml' },
    { name: 'Vegetable Oil', category: 'pantry', unit: 'ml' },
    { name: 'White Rice', category: 'pantry', unit: 'g' },
    { name: 'Brown Rice', category: 'pantry', unit: 'g' },
    { name: 'Pasta', category: 'pantry', unit: 'g' },
    { name: 'Bread', category: 'pantry', unit: 'pieces' },
    { name: 'Flour', category: 'pantry', unit: 'g' },
    { name: 'Sugar', category: 'pantry', unit: 'g' },
    { name: 'Honey', category: 'pantry', unit: 'g' },
    { name: 'Canned Tomatoes', category: 'pantry', unit: 'pieces' },
    { name: 'Canned Chickpeas', category: 'pantry', unit: 'pieces' },
    { name: 'Canned Black Beans', category: 'pantry', unit: 'pieces' },
    { name: 'Canned Lentils', category: 'pantry', unit: 'pieces' },
    { name: 'Canned Tuna', category: 'pantry', unit: 'pieces' },
    { name: 'Soy Sauce', category: 'pantry', unit: 'ml' },
    { name: 'Tomato Paste', category: 'pantry', unit: 'g' },
    { name: 'Chicken Broth', category: 'pantry', unit: 'ml' },
    { name: 'Oats', category: 'pantry', unit: 'g' },
    { name: 'Peanut Butter', category: 'pantry', unit: 'g' },
    { name: 'Apple Cider Vinegar', category: 'pantry', unit: 'ml' },
    { name: 'Salt', category: 'spice', unit: 'g' },
    { name: 'Black Pepper', category: 'spice', unit: 'g' },
    { name: 'Garlic Powder', category: 'spice', unit: 'g' },
    { name: 'Onion Powder', category: 'spice', unit: 'g' },
    { name: 'Cumin', category: 'spice', unit: 'g' },
    { name: 'Paprika', category: 'spice', unit: 'g' },
    { name: 'Turmeric', category: 'spice', unit: 'g' },
    { name: 'Oregano', category: 'spice', unit: 'g' },
    { name: 'Chili Flakes', category: 'spice', unit: 'g' },
    { name: 'Cinnamon', category: 'spice', unit: 'g' },
    { name: 'Garlic', category: 'produce', unit: 'pieces' },
    { name: 'Onion', category: 'produce', unit: 'pieces' },
    { name: 'Tomatoes', category: 'produce', unit: 'pieces' },
    { name: 'Lemon', category: 'produce', unit: 'pieces' },
    { name: 'Potatoes', category: 'produce', unit: 'g' },
    { name: 'Carrots', category: 'produce', unit: 'pieces' },
    { name: 'Spinach', category: 'produce', unit: 'g' },
    { name: 'Bell Pepper', category: 'produce', unit: 'pieces' },
    { name: 'Broccoli', category: 'produce', unit: 'g' },
    { name: 'Avocado', category: 'produce', unit: 'pieces' },
    { name: 'Eggs', category: 'dairy', unit: 'pieces' },
    { name: 'Milk', category: 'dairy', unit: 'ml' },
    { name: 'Butter', category: 'dairy', unit: 'g' },
    { name: 'Cheddar Cheese', category: 'dairy', unit: 'g' },
    { name: 'Greek Yogurt', category: 'dairy', unit: 'g' },
    { name: 'Parmesan', category: 'dairy', unit: 'g' },
    { name: 'Chicken Breast', category: 'protein', unit: 'g' },
    { name: 'Ground Beef', category: 'protein', unit: 'g' },
    { name: 'Salmon', category: 'protein', unit: 'g' },
    { name: 'Tofu', category: 'protein', unit: 'g' },
    { name: 'Shrimp', category: 'protein', unit: 'g' },
  ];

  const existingNames = new Set(items.map(i => i.name.trim().toLowerCase()));
  const commonSuggestions = COMMON_ITEMS
    .filter(s => !existingNames.has(s.name.toLowerCase()))
    .filter(s => activeCategory === 'all' || s.category === activeCategory)
    .slice(0, 10);

  const getCatClass = (cat: string) => ({
    protein: 'cbProtein', produce: 'cbProduce', dairy: 'cbDairy',
    pantry: 'cbPantry', spice: 'cbSpice', other: 'cbOther',
  }[cat] ?? 'cbOther');

  const getExpiryPill = (item: PantryItem) => {
    const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date) as any;
    if (!item.expiry_date) return { label: '—', cls: '' };
    if (status === 'expired') return { label: 'Expired', cls: 'pillR' };
    if (daysUntilExpiry === 0) return { label: 'Today', cls: 'pillR' };
    if (daysUntilExpiry <= 2) return { label: `${daysUntilExpiry}d`, cls: 'pillO' };
    if (daysUntilExpiry <= 5) return { label: `${daysUntilExpiry} days`, cls: 'pillO' };
    return { label: `${daysUntilExpiry} days`, cls: 'pillG' };
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderTableBody = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: 'var(--txt2)' }}>
          <div className="animate-spin" style={{ width: 18, height: 18, border: '2px solid var(--surf3)', borderTopColor: 'var(--acc)', borderRadius: '50%' }} />
          Loading items…
        </div>
      );
    }

    if (fetchError) {
      return (
        <div style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)', marginBottom: 6 }}>Failed to load pantry</div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 16 }}>{fetchError}</div>
          <button className="tbBtn" onClick={() => fetchItems()}>Retry</button>
        </div>
      );
    }

    if (filtered.length === 0) {
      return (
        <div style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>{activeCategory !== 'all' ? CATEGORY_ICONS[activeCategory as Category] : '🫙'}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>
            {search || activeCategory !== 'all' ? 'No items match your filter' : 'Your pantry is empty'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 20 }}>
            {search || activeCategory !== 'all' ? 'Try a different search or category' : 'Add your first item to get started'}
          </div>
          {!search && activeCategory === 'all' && (
            <button className="tbBtn" onClick={() => { setModalItem(null); setModalOpen(true); }}>+ Add First Item</button>
          )}
        </div>
      );
    }

    return (
      <table className="ptable">
        <thead>
          <tr>
            <th>Item</th><th>Category</th><th>Quantity</th><th>Unit</th><th>Expiry</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(item => {
            const pill = getExpiryPill(item);
            return (
              <tr key={item.id}>
                <td style={{ fontWeight: 500 }}>{CATEGORY_ICONS[item.category]} {item.name}</td>
                <td><span className={`catBadge ${getCatClass(item.category)}`}>{item.category}</span></td>
                <td><input className="qtyInput" type="number" defaultValue={item.quantity} /></td>
                <td style={{ color: 'var(--txt2)' }}>{item.unit}</td>
                <td style={{ color: pill.cls === 'pillR' ? '#FF6040' : 'var(--txt2)' }}>{item.expiry_date ?? '—'}</td>
                <td>
                  {pill.label !== '—'
                    ? <span className={`expPill ${pill.cls}`} style={{ margin: 0 }}>{pill.label}</span>
                    : <span style={{ color: 'var(--txt3)', fontSize: 12 }}>—</span>}
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="trDel" style={{ color: 'var(--txt2)', fontSize: 12, padding: '4px 10px' }}
                    onClick={() => { setModalItem(item); setModalOpen(true); }}>Edit</button>
                  <button className="trDel" onClick={() => setDeleteTarget(item)}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  };

  return (
    <div className="pageWrapper">
      {/* Header */}
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Pantry</h1>
          <p className="pageSub">
            {loading ? 'Loading…' : `${items.length} items · ${items.filter(i => { const { status } = getExpiryStatus(i.expiry_date) as any; return status === 'danger' || status === 'expired'; }).length} expiring soon`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="filterBar">
            {filterTabs.map(({ key, label }) => (
              <button
                type="button" key={key}
                className={`fchip${activeCategory === key ? ' active' : ''}`}
                onClick={() => setActiveCategory(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={() => { setModalItem(null); setModalOpen(true); }} className="tbBtn">+ Add Item</button>
        </div>
      </div>

      {/* Search */}
      <input
        style={{ background: 'var(--surf2)', border: '1px solid var(--bdr2)', borderRadius: 8, padding: '7px 14px', fontSize: 13, color: 'var(--txt2)', width: '100%', outline: 'none', fontFamily: 'var(--fb)' }}
        placeholder="Search items…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {renderTableBody()}
        <button
          style={{ width: '100%', border: 'none', borderTop: '1px dashed var(--bdr2)', padding: 11, borderRadius: 0, color: 'var(--txt3)', background: 'none', cursor: 'pointer', fontSize: 12 }}
          onClick={() => { setModalItem(null); setModalOpen(true); }}
        >+ Add pantry item</button>
      </div>

      {/* Common pantry suggestions */}
      {!loading && !fetchError && commonSuggestions.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="cardHd" style={{ marginBottom: 10 }}>
            <div className="cardTitle">💡 Common Household Items</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)' }}>
              Quick-add items typically found in most homes
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {commonSuggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setModalItem(null);
                  setModalPreset({ name: s.name, category: s.category, unit: s.unit });
                  setModalOpen(true);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--surf2)', border: '1px solid var(--bdr2)',
                  borderRadius: 20, padding: '6px 13px', fontSize: 12,
                  color: 'var(--txt2)', cursor: 'pointer', fontFamily: 'var(--fb)',
                  transition: 'border-color .15s, color .15s',
                }}
                onMouseOver={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--acc)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt)';
                }}
                onMouseOut={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--bdr2)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt2)';
                }}
              >
                <span>{CATEGORY_ICONS[s.category]}</span>
                <span>+ {s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <PantryModal
          item={modalItem}
          preset={modalItem ? null : modalPreset}
          onClose={() => { setModalOpen(false); setModalPreset(null); }}
          onSaved={() => fetchItems()}
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
