import { useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/pantry', label: 'Pantry' },
  { to: '/meals', label: 'Meals' },
  { to: '/grocery', label: 'Grocery' },
  { to: '/profile', label: 'Profile' },
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

  const cycleTheme = () => {
    setTheme(t => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));
  };

  const themeLabel = theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';

  return (
    <div className="appShell">
      {sidebarOpen && <div className="sidebarOverlay" onClick={() => setSidebarOpen(false)} />}

      <aside className={`appSidebar ${sidebarOpen ? 'appSidebarOpen' : ''}`}>
        <div className="appBrand">
          <div className="brandRow">
            <div>
              <div style={{ fontSize: 15, fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1.1 }}>PrepPAL</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{profile?.name ?? ''}</div>
            </div>
          </div>
        </div>

        <nav className="appNav" onClick={() => setSidebarOpen(false)}>
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `navItem ${isActive ? 'navItemActive' : ''}`}
            >
              <span className="navDot" aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebarFooter">
          <button onClick={handleSignOut} className="btn" style={{ width: '100%' }}>Sign out</button>
        </div>
      </aside>

      <main className="appMain">
        <div className="topbar">
          <div className="topbarRow">
            <button className="btn" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <span aria-hidden>☰</span>
            </button>
            <div style={{ fontSize: 14, fontWeight: 750, color: 'var(--text-primary)' }}>{activeLabel}</div>
            <button className="btn" onClick={cycleTheme} aria-label="Toggle theme" style={{ minWidth: 84 }}>
              {themeLabel}
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