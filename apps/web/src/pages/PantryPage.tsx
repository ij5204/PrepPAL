import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getExpiryStatus } from '@preppal/utils';
import type { PantryItem } from '@preppal/types';

export function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetch = async () => {
    setLoading(true);
    const { data } = await supabase.from('pantry_items').select('*').order('category').order('name');
    setItems((data as PantryItem[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

  const expiryColors = { ok: '#22c55e', warning: '#f59e0b', danger: '#ef4444', expired: '#6b7280' };

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f9fafb', marginBottom: 4 }}>Pantry</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24, fontSize: 14 }}>{items.length} items in your kitchen</p>

      <input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', background: '#1a1f2e', border: '1px solid #374151', borderRadius: 12, padding: '12px 16px', fontSize: 15, color: '#f9fafb', marginBottom: 16, outline: 'none' }} />

      {loading ? <p style={{ color: '#6b7280' }}>Loading…</p> : (
        <div style={{ background: '#1a1f2e', borderRadius: 14, border: '1px solid #1f2937', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1f2937' }}>
                {['Name', 'Quantity', 'Category', 'Expires'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No items found</td></tr>
                : filtered.map(item => {
                  const { status, daysUntilExpiry } = getExpiryStatus(item.expiry_date);
                  const color = expiryColors[status];
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{item.name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 14, color: '#9ca3af' }}>{item.quantity} {item.unit}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ background: '#1f2937', borderRadius: 8, padding: '3px 8px', fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{item.category}</span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {item.expiry_date
                          ? <span style={{ color, fontSize: 13, fontWeight: 600 }}>
                              {status === 'expired' ? 'Expired' : daysUntilExpiry === 0 ? 'Today' : `${daysUntilExpiry}d`}
                            </span>
                          : <span style={{ color: '#4b5563', fontSize: 13 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}