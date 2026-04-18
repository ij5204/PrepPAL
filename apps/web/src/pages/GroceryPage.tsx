import React, { useEffect, useState } from 'react';
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
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb' }}>Grocery List</h1>
        {checked.length > 0 && (
          <button onClick={clearCompleted} style={{ background: 'none', border: '1px solid #374151', color: '#ef4444', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Clear {checked.length} done
          </button>
        )}
      </div>
      <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 14 }}>{unchecked.length} items to buy</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input placeholder="Add an item…" value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          style={{ flex: 1, background: '#1a1f2e', border: '1px solid #374151', borderRadius: 12, padding: '12px 16px', fontSize: 15, color: '#f9fafb', outline: 'none' }} />
        <button onClick={addItem} style={{ background: '#22c55e', color: '#0f1117', border: 'none', borderRadius: 12, padding: '12px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>Add</button>
      </div>

      <div style={{ background: '#1a1f2e', borderRadius: 14, border: '1px solid #1f2937', overflow: 'hidden' }}>
        {items.length === 0
          ? <div style={{ padding: 32, textAlign: 'center', color: '#6b7280' }}>Your list is empty</div>
          : [...unchecked, ...checked].map(item => (
            <div key={item.id} onClick={() => toggle(item)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderBottom: '1px solid #1f2937', cursor: 'pointer',
              opacity: item.is_checked ? 0.5 : 1,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 6, border: `2px solid ${item.is_checked ? '#22c55e' : '#374151'}`,
                background: item.is_checked ? '#22c55e' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {item.is_checked && <span style={{ color: '#0f1117', fontSize: 13, fontWeight: 700 }}>✓</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', textDecoration: item.is_checked ? 'line-through' : 'none' }}>{item.name}</div>
                {item.quantity && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{item.quantity} {item.unit}</div>}
              </div>
              <span style={{ background: reasonColors[item.reason] + '22', color: reasonColors[item.reason], fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                {item.reason.replace('_', ' ')}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}