import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PantryPage } from './pages/PantryPage';
import { MealsPage } from './pages/MealsPage';
import { GroceryPage } from './pages/GroceryPage';
import { ProfilePage } from './pages/ProfilePage';
import { NutritionPage } from './pages/NutritionPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuthStore();
  if (!initialized) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          border: '2px solid var(--border-2)',
          borderTopColor: 'transparent',
        }} className="animate-spin" />
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading PrepPAL…</span>
      </div>
    </div>
  );
}

export default function App() {
  const { initialize, initialized } = useAuthStore();

  useEffect(() => {
    initialize();
  }, []);

  if (!initialized) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="pantry" element={<PantryPage />} />
        <Route path="meals" element={<MealsPage />} />
        <Route path="grocery" element={<GroceryPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="nutrition" element={<NutritionPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
