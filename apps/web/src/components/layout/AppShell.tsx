import { Outlet, NavLink, useNavigate } from 'react-router-dom';
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

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.brandRow}>
            <div style={styles.logo} aria-hidden>PP</div>
            <div>
              <div style={styles.brandName}>PrepPAL</div>
              <div style={styles.brandMeta}>{profile?.name ?? ''}</div>
            </div>
          </div>
        </div>

        <nav style={styles.nav}>
          {links.map(({ to, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              ...styles.navItem,
              ...(isActive ? styles.navItemActive : null),
            })}>
              <span style={styles.navDot} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <button onClick={handleSignOut} style={styles.signOutBtn}>Sign out</button>
        </div>
      </div>

      {/* Main content */}
      <div style={styles.main}>
        <Outlet />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    height: '100vh',
    background: '#0b0f17',
    color: '#e5e7eb',
  },
  sidebar: {
    width: 248,
    background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)',
    borderRight: '1px solid rgba(148,163,184,0.12)',
    display: 'flex',
    flexDirection: 'column',
    padding: '18px 0',
  },
  brand: {
    padding: '0 18px 16px',
    borderBottom: '1px solid rgba(148,163,184,0.12)',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 34,
    height: 34,
    borderRadius: 10,
    background: 'rgba(99,102,241,0.16)',
    border: '1px solid rgba(99,102,241,0.35)',
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: '0.6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { fontSize: 15, fontWeight: 800, color: '#f8fafc', lineHeight: 1.1 },
  brandMeta: { fontSize: 12, color: 'rgba(148,163,184,0.8)', marginTop: 3 },
  nav: { flex: 1, padding: '14px 10px' },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 10,
    marginBottom: 4,
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(226,232,240,0.78)',
    border: '1px solid transparent',
  },
  navItemActive: {
    background: 'rgba(99,102,241,0.12)',
    border: '1px solid rgba(99,102,241,0.25)',
    color: '#e0e7ff',
  },
  navDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    background: 'rgba(148,163,184,0.6)',
  },
  sidebarFooter: {
    padding: '14px 18px 0',
    borderTop: '1px solid rgba(148,163,184,0.12)',
  },
  signOutBtn: {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    background: 'rgba(15,23,42,0.6)',
    border: '1px solid rgba(148,163,184,0.18)',
    color: 'rgba(226,232,240,0.78)',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 600,
  },
  main: {
    flex: 1,
    overflow: 'auto',
    padding: 32,
    background:
      'radial-gradient(1200px 600px at 20% -10%, rgba(99,102,241,0.14), transparent 55%), radial-gradient(900px 450px at 90% 0%, rgba(16,185,129,0.06), transparent 55%), #0b0f17',
  },
};