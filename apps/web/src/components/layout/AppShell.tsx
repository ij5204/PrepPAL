import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/pantry', label: 'Pantry', icon: '🥦' },
  { to: '/meals', label: 'Meals', icon: '🍳' },
  { to: '/grocery', label: 'Grocery', icon: '🛒' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function AppShell() {
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f1117' }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: '#1a1f2e', borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column', padding: '24px 0' }}>
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid #1f2937' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#f9fafb' }}>🥦 PrepPAL</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{profile?.name ?? ''}</div>
        </div>

        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {links.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 10, marginBottom: 4,
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              background: isActive ? '#052e16' : 'transparent',
              color: isActive ? '#22c55e' : '#9ca3af',
            })}>
              <span style={{ fontSize: 16 }}>{icon}</span>{label}
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: '16px 20px', borderTop: '1px solid #1f2937' }}>
          <button onClick={handleSignOut} style={{
            width: '100%', padding: '8px 12px', borderRadius: 8,
            background: 'transparent', border: '1px solid #374151',
            color: '#9ca3af', fontSize: 13, cursor: 'pointer', fontWeight: 600,
          }}>Sign out</button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 32 }}>
        <Outlet />
      </div>
    </div>
  );
}