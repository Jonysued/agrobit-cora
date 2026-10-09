import OfflineStatus from '@/components/OfflineStatus';
import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChartNoAxesCombined, Table2, Settings, Droplets, Zap, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { backend } from '@/api/backendClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const links = [['/dashboard', 'Dashboard', ChartNoAxesCombined], ['/lotes', 'Lotes', Table2], ['/riego', 'Riego', Droplets], ['/water-energy', 'Water & Energy', Zap], ['/configuracion', 'Configuración', Settings]];

export default function AppLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const regador = user?.role === 'regador';
  const [accountOpen, setAccountOpen] = useState(false);
  const navClass = isActive => `flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-1 text-sm font-semibold transition-all sm:shrink-0 sm:px-3 ${isActive ? 'bg-white text-emerald-950 shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`;
  return <div className={`lucient-shell text-slate-900 ${Capacitor.getPlatform() === 'ios' ? 'lucient-native-ios' : ''}`}>
    <header className="lucient-header sticky top-0 z-40 shrink-0 border-b border-white/10 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 shadow-[0_10px_30px_rgba(11,37,38,.16)]">
      <div className="mx-auto flex min-h-14 max-w-[1700px] flex-nowrap items-center gap-1 px-2 sm:min-h-[4.5rem] sm:gap-4 sm:px-5">
        <NavLink to={regador ? '/riego?tab=monitoreo' : '/dashboard'} className="flex h-14 w-[clamp(56px,20vw,84px)] shrink-0 items-center sm:w-auto"><img src="/brand/lucient-logo-white.svg" alt="Lucient" className="h-auto w-full sm:h-10 sm:w-auto" /></NavLink>
        <nav aria-label="Secciones de Lucient" className={`grid min-w-0 flex-1 gap-0.5 ${regador ? 'grid-cols-2' : 'grid-cols-5'} sm:flex sm:overflow-x-auto [scrollbar-width:none]`}>
          {links.filter(([to]) => !regador || to === '/riego' || to === '/configuracion').map(([to, label, Icon]) => regador && to === '/configuracion' ?
            <button key={to} type="button" aria-label={label} title={label} onClick={() => setAccountOpen(true)} className={navClass(accountOpen)}><Icon size={19} /><span className="hidden xl:inline">{label}</span></button> :
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={label} className={({ isActive }) => navClass(isActive || (to === '/dashboard' && location.pathname === '/mapa'))}><Icon size={19} /><span className="hidden xl:inline">{label}</span></NavLink>)}
        </nav>
      </div>
    </header>
    {regador && <Dialog open={accountOpen} onOpenChange={setAccountOpen}><DialogContent><DialogHeader><DialogTitle>Configuración</DialogTitle></DialogHeader><button type="button" onClick={() => backend.auth.logout()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-3 font-semibold"><LogOut size={19} />Cerrar sesión</button></DialogContent></Dialog>}
    <main className="relative isolate z-0"><OfflineStatus /><Outlet /></main>
  </div>;
}
