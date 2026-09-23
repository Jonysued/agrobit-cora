import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/backendClient';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const finish = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      const returnTo = sessionStorage.getItem('auth_return_to') || '/';
      sessionStorage.removeItem('auth_return_to');
      navigate(data.session ? returnTo : '/login', { replace: true });
    };
    finish();
    return () => { active = false; };
  }, [navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-700" />
    </div>
  );
}

