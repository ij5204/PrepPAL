import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { GroceryListItem } from '@preppal/types';

const reasonConfig: Record<string, { label: string; color: string; bg: string }> = {
  low_stock:           { label: 'Low stock',   color: '#ef4444', bg: 'rgba(239,68,68,0.10)' },
  expired:             { label: 'Expired',      color: '#6b7280', bg: 'rgba(107,114,128,0.10)' },
  missing_ingredient:  { label: 'Missing',      color: '#f59e0b', bg: 'rgba(245,158,11,0.10)' },
  manual:              { label: 'Manual',       color: '#3b82f6', bg: 'rgba(59,130,246,0.10)' },
};

export function GroceryPage() {
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);

  const fetch = async () => {
    const { data } = await supabase.from('grocery_list_items').select('*').order('reason').order('name');
    setItems((data as GroceryListItem[]) ?? []);
  };

  useEffect(() => { fetch(); }, []);

  const toggle = async (item: GroceryListItem) => {
    await supabase.from('grocery_list_items').update({ is_checked: !item.is_checked }).eq('id', item.id);
    fetch();
  };

  const addItem = async () => {
    if (!newItem.trim() || adding) return;
    const { session } = useAuthStore.getState();
    if (!session) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('grocery_list_items').insert({
        user_id: session.user.id,
        name: newItem.trim(),
        reason: 'manual',
      });
      if (error) throw error;
      setNewItem('');
      fetch();
    } catch (err: any) {
      console.error('[Grocery] addItem error:', err);
    } finally {
      setAdding(false);
    }
  };

  const clearCompleted = async () => {
    await supabase.from('grocery_list_items').delete().eq('is_checked', true);
    fetch();
  };

  const unchecked = items.filter(i => !i.is_checked);
  const checked = items.filter(i => i.is_checked);
  const pct = items.length ? Math.round((checked.length / items.length) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 className="pageTitle" style={{ margin: 0 }}>Grocery List</h1>
          <p className="pageSubtitle" style={{ marginTop: 4, marginBottom: 0 }}>
            {unchecked.length} item{unchecked.length !== 1 ? 's' : ''} to buy
          </p>
        </div>
        {checked.length > 0 && (
          <button onClick={clearCompleted} className="btn" style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.20)', fontSize: 13 }}>
            Clear {checked.length} done
          </button>
        )}
      </div>

      {/* Progress */}
      {items.length > 0 && (
        <div className="groceryProgress animate-fade-in">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 64 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: pct === 100 ? 'var(--success)' : 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {pct}%
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
              {checked.length}/{items.length} done
            </span>
          </div>
          <div className="groceryProgressBar">
            <div className="groceryProgressFill" style={{ width: `${pct}%` }} />
          </div>
          {pct === 100 && (
            <span style={{ fontSize: 20 }}>🎉</span>
          )}
        </div>
      )}

      {/* Add input */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          placeholder="Add an item…"
          value={newItem}
          onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{
            flex: 1,
            background: 'var(--surface)',
            border: '1px solid var(--field-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 16px',
            fontSize: 15,
            color: 'var(--text-primary)',
            outline: 'none',
            boxShadow: 'var(--shadow)',
          }}
        />
        <button
          onClick={addItem}
          disabled={adding || !newItem.trim()}
          className="btn btnPrimary"
          style={{ padding: '12px 20px', fontSize: 14, fontWeight: 750 }}
        >
          {adding ? '…' : 'Add'}
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🛒</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Your list is empty</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Add items above or generate meal suggestions to auto-populate</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {/* Unchecked */}
          {unchecked.map(item => {
            const rc = reasonConfig[item.reason] ?? reasonConfig.manual;
            return (
              <div key={item.id} className="groceryItem" onClick={() => toggle(item)}>
                <div className="groceryCheckbox">
                  <span style={{ color: 'transparent', fontSize: 12, fontWeight: 800 }}>✓</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)' }}>{item.name}</div>
                  {item.quantity && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{item.quantity} {item.unit}</div>
                  )}
                </div>
                <span style={{
                  background: rc.bg, color: rc.color,
                  border: `1px solid ${rc.color}33`,
                  fontSize: 11, fontWeight: 750,
                  padding: '3px 10px', borderRadius: 10,
                  flexShrink: 0,
                }}>
                  {rc.label}
                </span>
              </div>
            );
          })}

          {/* Divider */}
          {checked.length > 0 && unchecked.length > 0 && (
            <div style={{ padding: '8px 18px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 750, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Completed ({checked.length})
              </span>
            </div>
          )}

          {/* Checked */}
          {checked.map(item => {
            const rc = reasonConfig[item.reason] ?? reasonConfig.manual;
            return (
              <div key={item.id} className="groceryItem" onClick={() => toggle(item)} style={{ opacity: 0.5 }}>
                <div className="groceryCheckbox groceryCheckboxChecked">
                  <span style={{ color: '#fff', fontSize: 12, fontWeight: 900, lineHeight: 1 }}>✓</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', textDecoration: 'line-through' }}>{item.name}</div>
                  {item.quantity && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{item.quantity} {item.unit}</div>
                  )}
                </div>
                <span style={{
                  background: rc.bg, color: rc.color,
                  border: `1px solid ${rc.color}33`,
                  fontSize: 11, fontWeight: 750,
                  padding: '3px 10px', borderRadius: 10,
                  flexShrink: 0,
                }}>
                  {rc.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
