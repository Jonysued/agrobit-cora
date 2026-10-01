import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/backendClient';
import { useAuth } from '@/lib/AuthContext';

const roles = [['admin', 'Administrador'], ['user', 'Usuario'], ['regador', 'Regador']];
export default function UserProfiles() {
  const { user } = useAuth(), client = useQueryClient();
  const [drafts, setDrafts] = useState({}), [busy, setBusy] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const query = useQuery({ queryKey: ['user-profiles', user.id], queryFn: async () => {
    const { data, error } = await supabase.from('profiles').select('id,email,full_name,role').order('full_name');
    if (error) throw error;
    return data;
  }});
  const save = async profile => {
    setBusy(profile.id); setError(''); setNotice('');
    try {
      const { error } = await supabase.rpc('set_user_profile_role', { p_user_id: profile.id, p_role: drafts[profile.id] });
      if (error) throw error;
      setDrafts(d => { const next = { ...d }; delete next[profile.id]; return next; });
      await client.invalidateQueries({ queryKey: ['user-profiles'] });
      setNotice(`Perfil actualizado para ${profile.full_name || profile.email}.`);
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };
  return <section className="rounded-2xl border bg-white p-5 shadow-sm">
    <h2 className="text-xl font-bold">Usuarios y perfiles</h2>
    <p className="mt-2 text-sm text-slate-500">Asigná un perfil a cada usuario registrado.</p>
    <div className="my-4 grid gap-2 text-sm text-slate-600"><p><b>Administrador:</b> acceso completo y gestión de usuarios.</p><p><b>Usuario:</b> acceso habitual a la app, sin gestión de perfiles.</p><p><b>Regador:</b> solo escanear QR y cambiar el estado del pozo o la válvula escaneada. Sin mapa, listados, historial, cronogramas ni otros datos.</p></div>
    {(error || query.error) && <p role="alert" className="my-3 text-sm text-red-700">{error || query.error.message}</p>}
    {notice && <p role="status" className="my-3 text-sm text-emerald-800">{notice}</p>}
    {query.isLoading && <p className="py-4 text-sm">Cargando usuarios…</p>}
    <div className="divide-y">{query.data?.map(profile => <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0"><b className="block text-sm">{profile.full_name || 'Sin nombre'}{profile.id === user.id ? ' · Vos' : ''}</b><p className="break-all text-xs text-slate-500">{profile.email}</p></div>
      <div className="flex gap-2"><select aria-label={`Perfil de ${profile.email}`} disabled={!!busy || profile.id === user.id} value={drafts[profile.id] ?? profile.role} onChange={e => setDrafts(d => ({ ...d, [profile.id]: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button disabled={!!busy || !drafts[profile.id] || drafts[profile.id] === profile.role || profile.id === user.id} onClick={() => save(profile)} className="rounded-lg bg-emerald-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{busy === profile.id ? 'Guardando…' : 'Guardar'}</button></div>
    </div>)}</div>
    <p className="mt-3 text-xs text-slate-500">Tu propio perfil se conserva para evitar perder el acceso a Configuración. Los permisos se aplican al guardar; una sesión abierta actualiza su navegación automáticamente.</p>
  </section>;
}
