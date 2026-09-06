import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/AppLayout';
import { FarmProvider } from '@/lib/FarmContext';
import MapPage from '@/pages/MapPage';
import Dashboard from '@/pages/Dashboard';
import Lots from '@/pages/Lots';
import LotDetail from '@/pages/LotDetail';
import Production from '@/pages/Production';
import Health from '@/pages/Health';
import Irrigation from '@/pages/Irrigation';
import Documents from '@/pages/Documents';
import Settings from '@/pages/Settings';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Keep the local authentication screens reachable while the app is protected.
  if (authError) {
    const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
    const isAuthScreen = authPaths.includes(window.location.pathname);
    if (authError.type === 'user_not_registered' && !isAuthScreen) {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !isAuthScreen) {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<FarmProvider><AppLayout /></FarmProvider>}>
          <Route path="/" element={<MapPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/lotes" element={<Lots />} />
          <Route path="/lotes/:id" element={<LotDetail />} />
          <Route path="/produccion" element={<Production />} />
          <Route path="/sanidad" element={<Health />} />
          <Route path="/riego" element={<Irrigation />} />
          <Route path="/documentos" element={<Documents />} />
          <Route path="/configuracion" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App