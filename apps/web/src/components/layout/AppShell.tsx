import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';

/* ── Icons ─────────────────────────────────────────────────────────────────── */

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
    <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.5"/>
    <line x1="11" y1="11" x2="14" y2="14" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"
      stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/* ── Nav config ─────────────────────────────────────────────────────────────── */

const NAV_BASE = [
  {
    section: 'Overview',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: '◎' },
      { to: '/nutrition',  label: 'Nutrition',  icon: '◈' },
    ],
  },
  {
    section: 'Food',
    items: [
      { to: '/pantry',  label: 'Pantry',          icon: '▣' },
      { to: '/meals',   label: 'Meal Suggestions', icon: '⚡', badgeKey: 'meals', green: true },
      { to: '/grocery', label: 'Grocery List',     icon: '☑', badgeKey: 'grocery' },
    ],
  },
  {
    section: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: '👤' },
    ],
  },
];

/* ── Component ──────────────────────────────────────────────────────────────── */

interface NotifItem { icon: string; bg: string; text: string; time: string; unread: boolean; }

export function AppShell() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [groceryBadge, setGroceryBadge] = useState<number>(0);
  const [mealsBadge, setMealsBadge] = useState<number>(0);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // Fetch live badge counts and notification data
  useEffect(() => {
    const fetchBadges = async () => {
      // Grocery: unchecked items count
      const { count: groceryCount } = await supabase
        .from('grocery_list_items')
        .select('*', { count: 'exact', head: true })
        .eq('is_checked', false);
      setGroceryBadge(groceryCount ?? 0);

      // Meals: count of today's cached suggestions
      const { data: session } = await supabase.auth.getSession();
      if (session?.session?.user) {
        const { count: cacheCount } = await supabase
          .from('meal_suggestion_cache')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', session.session.user.id)
          .gt('expires_at', new Date().toISOString());
        setMealsBadge(cacheCount ? 3 : 0); // each cache row = 3 suggestions
      }

      // Notifications: build from real pantry expiry data
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

      const builtNotifs: NotifItem[] = [];

      (expiringItems ?? []).forEach(item => {
        const expDate = new Date(item.expiry_date + 'T00:00:00');
        const diffDays = Math.round((expDate.getTime() - today.getTime()) / 86400000);
        const timeLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : `In ${diffDays} days`;
        builtNotifs.push({
          icon: '⚠',
          bg: 'rgba(255,77,0,.15)',
          text: `${item.name} expires ${timeLabel.toLowerCase()}. Use it in today's meal.`,
          time: 'Pantry alert',
          unread: true,
        });
      });

      if (groceryCount && groceryCount > 0) {
        builtNotifs.push({
          icon: '🛒',
          bg: 'rgba(0,212,255,.12)',
          text: `${groceryCount} item${groceryCount > 1 ? 's' : ''} pending on your grocery list.`,
          time: 'Grocery',
          unread: groceryCount > 0,
        });
      }

      if (lowStockItems && lowStockItems.length > 0) {
        builtNotifs.push({
          icon: '📦',
          bg: 'rgba(0,212,255,.12)',
          text: `${lowStockItems[0].name} is low on stock. Check your grocery list.`,
          time: 'Stock alert',
          unread: true,
        });
      }

      if (builtNotifs.length === 0) {
        builtNotifs.push({
          icon: '✅',
          bg: 'rgba(34,197,94,.12)',
          text: 'All good! No expiring items or low stock alerts.',
          time: 'Just now',
          unread: false,
        });
      }

      setNotifItems(builtNotifs);
    };

    fetchBadges();
    // Refresh every 60s
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, []);

  const getBadge = (key?: string) => {
    if (key === 'grocery') return groceryBadge;
    if (key === 'meals') return mealsBadge;
    return 0;
  };

  return (
    <div className="appShell">
      {/* ── TOPBAR ── */}
      <header className="appTopbar">
        <div className="appBrand" onClick={() => navigate('/dashboard')}>PREPPAL</div>

        <div className="tbSearch">
          <SearchIcon />
          Search pantry, meals…
        </div>

        <button className="tbBtn" onClick={() => navigate('/meals')}>+ SUGGEST MEAL</button>

        {/* Notif bell */}
        <div className="tbNotif" onClick={() => setNotifOpen(o => !o)}>
          <BellIcon />
          <div className="notifDot pulse" />
        </div>

        {/* Avatar */}
        <div className="avatar" onClick={() => navigate('/profile')}>{initials}</div>
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="appSidebar">
        {NAV_BASE.map(({ section, items }) => (
          <div key={section}>
            <div className="navSectionLabel">{section}</div>
            {items.map(({ to, label, icon, badgeKey, green }: any) => {
              const badgeCount = getBadge(badgeKey);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `navItem${isActive ? ' navItemActive' : ''}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className="navIcon">{icon}</span>
                      <span style={{ flex: 1 }}>{label}</span>
                      {badgeCount > 0 && <span className={`navBadge${green ? ' green' : ''}`}>{badgeCount}</span>}
                      {isActive && false /* suppress unused var warning */}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}

        {/* Footer user card */}
        <div className="sidebarFooter">
          <div className="sidebarUser" onClick={() => navigate('/profile')}>
            <div className="avatar" style={{ flexShrink: 0 }}>{initials}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)' }}>
                {profile?.name ?? 'User'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--acc)', letterSpacing: '.5px', marginTop: 1 }}>
                {profile?.fitness_goal ?? 'Bulking'} · {profile?.daily_calorie_goal ?? 2800} kcal
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); handleSignOut(); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12 }}
            >
              ⎋
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="appMain">
        <Outlet />
      </main>

      {/* ── NOTIF PANEL (simple dropdown) ── */}
      {notifOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          onClick={() => setNotifOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 62, right: 20,
              width: 340, background: 'var(--surf)',
              border: '1px solid var(--bdr2)', borderRadius: 'var(--rad-lg)',
              overflow: 'hidden', animation: 'slideUp .2s ease',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Notifications</span>
              <span style={{ fontSize: 11, color: 'var(--acc)', cursor: 'pointer' }} onClick={() => setNotifOpen(false)}>Mark all read</span>
            </div>
            {notifItems.map((n, i) => (
              <div key={i} style={{ padding: '13px 18px', borderBottom: '1px solid var(--bdr)', display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: n.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>{n.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>{n.text}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{n.time}</div>
                </div>
                {n.unread && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', marginTop: 4, flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
