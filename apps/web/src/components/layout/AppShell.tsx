import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const HomeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const PantryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
    <line x1="12" y1="22.08" x2="12" y2="12"/>
  </svg>
);

const MealsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="1" x2="6" y2="4"/>
    <line x1="10" y1="1" x2="10" y2="4"/>
    <line x1="14" y1="1" x2="14" y2="4"/>
  </svg>
);

const GroceryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1"/>
    <circle cx="20" cy="21" r="1"/>
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
  </svg>
);

const ProfileIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const links = [
  { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
  { to: '/pantry',    label: 'Pantry',    Icon: PantryIcon },
  { to: '/meals',     label: 'Meals',     Icon: MealsIcon },
  { to: '/grocery',   label: 'Grocery',   Icon: GroceryIcon },
  { to: '/profile',   label: 'Profile',   Icon: ProfileIcon },
];

export function AppShell() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  });

  const activeLabel = useMemo(
    () => links.find(l => location.pathname.startsWith(l.to))?.label ?? 'PrepPAL',
    [location.pathname]
  );

  useEffect(() => {
    if (theme === 'system') {
      localStorage.setItem('theme', 'system');
      document.documentElement.removeAttribute('data-theme');
      return;
    }
    localStorage.setItem('theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const cycleTheme = () => setTheme(t => t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system');

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <div className="appShell">
      {sidebarOpen && <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`appSidebar ${sidebarOpen ? 'appSidebarOpen' : ''}`}>
        {/* Brand */}
        <div className="appBrand">
          <div className="brandRow">
            <div className="avatar" style={{ width: 36, height: 36, fontSize: 13 }}>{initials}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.15, letterSpacing: '-0.01em' }}>PrepPAL</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>{profile?.name ?? ''}</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="appNav" onClick={() => setSidebarOpen(false)}>
          {links.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}
            >
              <span className="navIcon"><Icon /></span>
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebarFooter" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={cycleTheme}
            className="btn"
            style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 13 }}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            {theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark'}
          </button>
          <button onClick={handleSignOut} className="btn" style={{ width: '100%', justifyContent: 'center', fontSize: 13, color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.20)' }}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="appMain">
        <div className="topbar">
          <div className="topbarRow">
            <button className="btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" style={{ padding: '8px 12px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>{activeLabel}</div>
            <button className="btn" onClick={cycleTheme} style={{ padding: '8px 12px' }}>
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </button>
          </div>
        </div>

        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
