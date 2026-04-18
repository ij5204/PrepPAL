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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, initialized } = useAuthStore();
  if (!initialized) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-[#0f1117]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        <span className="text-[#6b7280] text-sm">Loading PrepPAL…</span>
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
