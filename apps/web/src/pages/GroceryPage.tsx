import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { GroceryListItem } from '@preppal/types';

export function GroceryPage() {
  const [items, setItems] = useState<GroceryListItem[]>([]);
  const [newItem, setNewItem] = useState('');

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
    if (!newItem.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('grocery_list_items').insert({ user_id: user.id, name: newItem.trim(), reason: 'manual' });
    setNewItem('');
    fetch();
  };

  const clearCompleted = async () => {
    await supabase.from('grocery_list_items').delete().eq('is_checked', true);
    fetch();
  };

  const unchecked = items.filter(i => !i.is_checked);
  const checked = items.filter(i => i.is_checked);

  const reasonColors: Record<string, string> = {
    low_stock: '#ef4444', expired: '#6b7280', missing_ingredient: '#f59e0b', manual: '#3b82f6',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h1 className="pageTitle" style={{ marginBottom: 0 }}>Grocery List</h1>
        {checked.length > 0 && (
          <button onClick={clearCompleted} className="btn" style={{ color: '#ef4444' }}>
            Clear {checked.length} done
          </button>
        )}
      </div>
      <p className="pageSubtitle" style={{ marginBottom: 18 }}>{unchecked.length} items to buy</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="Add an item…" value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1, background: 'var(--field-bg)', border: '1px solid var(--field-border)', borderRadius: 12, padding: '12px 16px', fontSize: 15, color: 'var(--text-primary)', outline: 'none' }} />
        <button onClick={addItem} className="btn btnPrimary" style={{ padding: '12px 20px', fontSize: 15, fontWeight: 750 }}>Add</button>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {items.length === 0
          ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Your list is empty</div>
          : [...unchecked, ...checked].map(item => (
            <div key={item.id} onClick={() => toggle(item)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderBottom: '1px solid var(--border)', cursor: 'pointer',
              opacity: item.is_checked ? 0.5 : 1,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, border: `2px solid ${item.is_checked ? '#22c55e' : '#374151'}`,
                background: item.is_checked ? 'var(--accent)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {item.is_checked && <span style={{ color: 'var(--accent-text)', fontSize: 13, fontWeight: 850 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-primary)', textDecoration: item.is_checked ? 'line-through' : 'none' }}>{item.name}</div>
                {item.quantity && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.quantity} {item.unit}</div>}
              </div>
              <span style={{ background: reasonColors[item.reason] + '1f', border: `1px solid ${reasonColors[item.reason]}33`, color: reasonColors[item.reason], fontSize: 11, fontWeight: 750, padding: '4px 10px', borderRadius: 10 }}>
                {item.reason.replace('_', ' ')}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}