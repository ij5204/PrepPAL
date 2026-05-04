import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

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

const NAV = [
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
      { to: '/meals',   label: 'Meal Suggestions', icon: '⚡', badge: '3', green: true },
      { to: '/grocery', label: 'Grocery List',     icon: '☑', badge: '7' },
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

export function AppShell() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);

  const initials = profile?.name
    ? profile.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
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
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="navSectionLabel">{section}</div>
            {items.map(({ to, label, icon, badge, green }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `navItem${isActive ? ' navItemActive' : ''}`}
              >
                <span className="navIcon">{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                {badge && <span className={`navBadge${green ? ' green' : ''}`}>{badge}</span>}
              </NavLink>
            ))}
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
            {[
              { icon: '⚠', bg: 'rgba(255,77,0,.15)', text: 'Chicken Breast expires today. Use it in today\'s meal.', time: 'Just now', unread: true },
              { icon: '⚡', bg: 'rgba(200,255,0,.12)', text: '3 new meal suggestions ready. Tap to view.', time: '2 min ago', unread: true },
              { icon: '📦', bg: 'rgba(0,212,255,.12)', text: 'Brown Rice is out of stock. Added to grocery list.', time: '1 hr ago', unread: true },
            ].map((n, i) => (
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
