import { Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase.js';
import { AuthProvider, useAuth } from './auth/AuthProvider.jsx';
import { AccessPendingPage, FinishSetupPage, LoginPage, NotConfiguredPage, SetInitialsPage, SetNewPasswordPage } from './auth/AuthPages.jsx';
import Layout from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';
import TanksPage from './pages/Tanks.jsx';
import RacksPage from './pages/Racks.jsx';
import BoxesPage from './pages/Boxes.jsx';
import GridViewPage from './pages/GridView.jsx';
import ReportsPage from './pages/Reports.jsx';
import UsersPage from './pages/Users.jsx';
import SettingsPage from './pages/Settings.jsx';
import ActivityPage from './pages/Activity.jsx';

function Gate() {
  const { loading, session, profile, isActive, isAdmin, recovering } = useAuth();
  if (loading) return <Spinner label="Loading CryoManager…" className="min-h-screen" />;
  if (!session) return <LoginPage />;
  if (recovering) return <SetNewPasswordPage />;
  if (!profile || !isActive) return <AccessPendingPage />;
  if (profile.needs_password) return <FinishSetupPage />;
  if (!profile.initials) return <SetInitialsPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/tanks" replace />} />
        <Route path="tanks" element={<TanksPage />} />
        <Route path="racks" element={<RacksPage />} />
        <Route path="boxes" element={<BoxesPage />} />
        <Route path="grid" element={<GridViewPage />} />
        <Route path="grid/:boxId" element={<GridViewPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="users" element={isAdmin ? <UsersPage /> : <Navigate to="/tanks" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/tanks" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!isConfigured) return <NotConfiguredPage />;
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
