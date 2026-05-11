import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { ThreeBackground } from '../ui/ThreeBackground';

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/pantry',    label: 'Pantry' },
  { to: '/meals',     label: 'Meals' },
  { to: '/nutrition', label: 'Nutrition' },
  { to: '/grocery',   label: 'Grocery' },
];

interface NotifItem { icon: string; bg: string; text: string; time: string; unread: boolean; }

export function AppShell() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  useEffect(() => {
    const fetchBadges = async () => {
      const { count: groceryCount } = await supabase
        .from('grocery_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('is_checked', false);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const in3Days = new Date(today);
      in3Days.setDate(in3Days.getDate() + 3);

      const { data: expiringItems } = await supabase
        .from('pantry_items')
        .select('name, expiry_date')
        .lte('expiry_date', in3Days.toISOString().split('T')[0])
        .gte('expiry_date', today.toISOString().split('T')[0])
        .order('expiry_date')
        .limit(3);

      const { data: lowStockItems } = await supabase
        .from('grocery_list_items')
        .select('name')
        .eq('reason', 'low_stock')
        .eq('is_checked', false)
        .limit(1);

      const built: NotifItem[] = [];

      (expiringItems ?? []).forEach(item => {
        const expDate = new Date(item.expiry_date + 'T00:00:00');
        const diffDays = Math.round((expDate.getTime() - today.getTime()) / 86400000);
        const timeLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;
        built.push({
          icon: '⚠',
          bg: 'rgba(255,77,0,.15)',
          text: `${item.name} expires ${timeLabel.toLowerCase()}. Use it in today's meal.`,
          time: 'Pantry alert',
          unread: true,
        });
      });

      if (groceryCount && groceryCount > 0) {
        built.push({
          icon: '🛒',
          bg: 'rgba(0,212,255,.12)',
          text: `${groceryCount} item${groceryCount > 1 ? 's' : ''} pending on your grocery list.`,
          time: 'Grocery',
          unread: true,
        });
      }

      if (lowStockItems && lowStockItems.length > 0) {
        built.push({
          icon: '📦',
          bg: 'rgba(0,212,255,.12)',
          text: `${lowStockItems[0].name} is low on stock.`,
          time: 'Stock alert',
          unread: true,
        });
      }

      if (built.length === 0) {
        built.push({
          icon: '✅',
          bg: 'rgba(34,197,94,.12)',
          text: 'All good! No expiring items or low stock alerts.',
          time: 'Just now',
          unread: false,
        });
      }

      setNotifItems(built);
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const hasUnread = notifItems.some(n => n.unread);

  return (
    <div className="appShell">
      <ThreeBackground />

      {/* ── TOPBAR ── */}
      <header className="appTopbar">
        {/* Brand */}
        <div className="appBrand" onClick={() => navigate('/dashboard')}>PREPPAL</div>

        {/* Nav links */}
        <nav className="topbarNav">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `topbarNavLink${isActive ? ' topbarNavLinkActive' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
          <button className="tbBtn" onClick={() => navigate('/meals')}>
            🍴 SUGGEST MEAL
          </button>

          <div className="tbNotif" onClick={() => setNotifOpen(o => !o)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {hasUnread && <div className="notifDot pulse" />}
          </div>

          <div className="avatar" onClick={() => navigate('/profile')}>{initials}</div>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="appMain">
        <Outlet />
      </main>

      {/* ── NOTIF DROPDOWN ── */}
      {notifOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          onClick={() => setNotifOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 62, right: 20,
              width: 340,
              background: 'rgba(8,8,18,0.92)',
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 'var(--rad-lg)',
              overflow: 'hidden',
              animation: 'slideUp .2s ease',
              boxShadow: '0 16px 48px rgba(0,0,0,0.60)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Notifications</span>
              <span style={{ fontSize: 11, color: 'var(--acc)', cursor: 'pointer' }} onClick={() => setNotifOpen(false)}>Mark all read</span>
            </div>
            {notifItems.map((n, i) => (
              <div key={i} style={{ padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: n.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{n.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>{n.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{n.time}</div>
                </div>
                {n.unread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', marginTop: 4, flexShrink: 0 }} />}
              </div>
            ))}
            <div
              style={{ padding: '12px 18px', textAlign: 'center', fontSize: 12, color: 'var(--txt2)', cursor: 'pointer' }}
              onClick={() => { setNotifOpen(false); navigate('/profile'); }}
            >
              {profile?.name ?? 'Account'} · <span style={{ color: 'var(--acc2)' }} onClick={e => { e.stopPropagation(); handleSignOut(); }}>Sign out</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
