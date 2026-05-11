import { useEffect, useState } from 'react';
import { Plus, X, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { GroceryListItem } from '@preppal/types';

// ─── Section definitions ─────────────────────────────────────────────────────
type Reason = GroceryListItem['reason'];

const SECTIONS: Array<{ key: Reason; label: string; dot: string; nameColor?: string }> = [
  { key: 'low_stock',          label: 'Low Stock',           dot: '#f59e0b' },
  { key: 'expired',            label: 'Expired',             dot: '#ef4444', nameColor: '#f87171' },
  { key: 'missing_ingredient', label: 'Missing Ingredients', dot: '#06b6d4' },
  { key: 'manual',             label: 'Added Manually',      dot: '#a78bfa' },
];

// ─── Styles ──────────────────────────────────────────────────────────────────
const GLASS: React.CSSProperties = {
  background: 'rgba(14,14,22,0.62)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 4px 24px rgba(0,0,0,0.3)',
  borderRadius: 16,
  overflow: 'hidden',
};

function itemSubtitle(item: GroceryListItem): string {
  const parts: string[] = [];
  if (item.quantity != null) parts.push(String(item.quantity));
  if (item.unit) parts.push(item.unit);
  return parts.join(' ');
}

// ─── Checkbox ────────────────────────────────────────────────────────────────
function Checkbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: checked ? 'none' : '1.5px solid rgba(255,255,255,0.25)',
        background: checked ? 'var(--accent, #a3e635)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.15s ease',
      }}
    >
      {checked && <Check size={13} color="#000" strokeWidth={3} />}
    </button>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function SectionCard({
  label, dot, nameColor, items, onToggle,
}: {
  label: string;
  dot: string;
  nameColor?: string;
  items: GroceryListItem[];
  onToggle: (item: GroceryListItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div style={GLASS}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: dot,
          boxShadow: `0 0 8px ${dot}88`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary, #e4e4ef)', letterSpacing: '0.01em' }}>
          {label}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 600,
          color: 'var(--text-muted, #6b7280)',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 20, padding: '2px 9px',
        }}>
          {items.length}
        </span>
      </div>

      {/* Items */}
      {items.map((item, idx) => {
        const sub = itemSubtitle(item);
        return (
          <div key={item.id}>
            {idx > 0 && (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 18px' }} />
            )}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 18px', cursor: 'pointer',
                opacity: item.is_checked ? 0.45 : 1,
                transition: 'opacity 0.2s',
              }}
              onClick={() => onToggle(item)}
            >
              <Checkbox checked={item.is_checked} onClick={() => onToggle(item)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: 14, fontWeight: 600, margin: 0,
                  color: item.is_checked ? 'var(--text-muted, #6b7280)' : (nameColor ?? 'var(--text-primary, #e4e4ef)'),
                  textDecoration: item.is_checked ? 'line-through' : 'none',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.name}
                </p>
                {sub && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted, #6b7280)', margin: '2px 0 0', fontWeight: 500 }}>
                    {sub}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Add item modal ───────────────────────────────────────────────────────────
function AddModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim() || saving) return;
    const { session } = useAuthStore.getState();
    if (!session) return;
    setSaving(true);
    try {
      await supabase.from('grocery_list_items').insert({
        user_id: session.user.id,
        name: name.trim(),
        quantity: qty ? parseFloat(qty) : null,
        reason: 'manual',
      });
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{ ...GLASS, width: '100%', maxWidth: 400, padding: 24 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary, #e4e4ef)' }}>
            Add Item
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted, #6b7280)', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <input
          autoFocus
          placeholder="Item name"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && save()}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '11px 14px',
            fontSize: 14, color: 'var(--text-primary, #e4e4ef)',
            outline: 'none', marginBottom: 10,
          }}
        />
        <input
          placeholder="Quantity (optional)"
          value={qty}
          onChange={e => setQty(e.target.value)}
          type="number"
          min="0"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '11px 14px',
            fontSize: 14, color: 'var(--text-primary, #e4e4ef)',
            outline: 'none', marginBottom: 18,
          }}
        />

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-secondary, #9ca3af)',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            style={{
              flex: 1, padding: '11px 0', borderRadius: 10,
              background: !name.trim() ? 'rgba(163,230,53,0.3)' : '#a3e635',
              border: 'none',
              color: '#000',
              fontSize: 14, fontWeight: 700, cursor: !name.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function GroceryPage() {
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('grocery_list_items')
      .select('*')
      .order('added_at', { ascending: false });
    setItems((data as GroceryListItem[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (item: GroceryListItem) => {
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_checked: !i.is_checked } : i));
    await supabase
      .from('grocery_list_items')
      .update({ is_checked: !item.is_checked })
      .eq('id', item.id);
  };

  const uncheckedCount = items.filter(i => !i.is_checked).length;

  // Group by reason (unchecked first within each group, then checked)
  const byReason = (key: Reason) =>
    items.filter(i => i.reason === key).sort((a, b) => Number(a.is_checked) - Number(b.is_checked));

  const hasAny = items.length > 0;

  return (
    <div className="pageWrapper">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #6b7280)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
            Shop · Plan · Restock
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary, #e4e4ef)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
            Grocery List
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
            {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} to pick up
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: '#a3e635',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(163,230,53,0.35)',
            flexShrink: 0, marginTop: 4,
          }}
        >
          <Plus size={20} color="#000" strokeWidth={2.5} />
        </button>
      </div>

      {/* Empty state */}
      {!hasAny && (
        <div style={{ ...GLASS, padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛒</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #e4e4ef)', margin: '0 0 6px' }}>
            Your list is empty
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #6b7280)', margin: 0 }}>
            Add items manually or generate meal suggestions to auto-populate
          </p>
        </div>
      )}

      {/* Sections */}
      {hasAny && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {SECTIONS.map(({ key, label, dot, nameColor }) => (
            <SectionCard
              key={key}
              label={label}
              dot={dot}
              nameColor={nameColor}
              items={byReason(key)}
              onToggle={toggle}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddModal onClose={() => setShowAdd(false)} onAdded={load} />
      )}
    </div>
  );
}
