import { setOfflineUser } from '@/lib/offline';
import React, { createContext, useCallback, useContext, useEffect, useState, useRef } from 'react';
import { queryClientInstance } from '@/lib/query-client';
import { backend, supabase } from '@/api/backendClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const access = useRef(null);
  const applyUser = useCallback(nextUser => {
    const key = nextUser ? `${nextUser.id}:${nextUser.role}` : null;
    if (access.current !== key) { queryClientInstance.clear(); access.current = key; }
    setUser(nextUser);
  }, []);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const nextUser = await backend.auth.me();
      applyUser(nextUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return nextUser;
    } catch (error) {
      applyUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: error.message || 'Authentication required' });
      return null;
    } finally {
      setIsLoadingAuth(false);
    }
  }, [applyUser]);

  useEffect(() => {
    checkUserAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        void setOfflineUser(null);
        applyUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        queueMicrotask(checkUserAuth);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [checkUserAuth, applyUser]);


  useEffect(() => {
    if (!user?.id) return;
    let disposed = false;
    const refresh = async () => {
      try {
        const nextUser = await backend.auth.me();
        if (!disposed) applyUser(nextUser);
      } catch (error) { if (!disposed && error.status === 401) { applyUser(null); setIsAuthenticated(false); } }
    };
    const visible = () => { if (!document.hidden) refresh(); };
    const timer = setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('lucient:resume', refresh);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('lucient:resume', refresh); };
  }, [user?.id, applyUser]);

  const logout = async (shouldRedirect = true) => {
    applyUser(null);
    setIsAuthenticated(false);
    await backend.auth.logout(shouldRedirect ? '/login' : false);
  };

  const navigateToLogin = () => backend.auth.redirectToLogin(window.location.pathname + window.location.search);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError,
      appPublicSettings: { id: 'lucient', public_settings: {} },
      authChecked: !isLoadingAuth,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState: checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
