import OfflineStatus from '@/components/OfflineStatus';
import React from 'react';
import { Capacitor } from '@capacitor/core';
import { NavLink, Outlet } from 'react-router-dom';
import { Map, ChartNoAxesCombined, Table2, Settings, Droplets, Zap, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { backend } from '@/api/backendClient';

const links = [['/', 'Mapa', Map], ['/dashboard', 'Dashboard', ChartNoAxesCombined], ['/lotes', 'Lotes', Table2], ['/riego', 'Riego', Droplets], ['/water-energy', 'Water & Energy', Zap], ['/configuracion', 'Configuración', Settings]];

export default function AppLayout() {
  const { user } = useAuth();
  const regador = user?.role === 'regador';
  return <div className={`lucient-shell text-slate-900 ${Capacitor.getPlatform() === 'ios' ? 'lucient-native-ios' : ''}`}>
    <header className="lucient-header sticky top-0 z-40 shrink-0 border-b border-white/10 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 shadow-[0_10px_30px_rgba(11,37,38,.16)]">
      <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-x-2 px-3 sm:min-h-[4.5rem] sm:flex-nowrap sm:gap-4 sm:px-5">
        <NavLink to={regador ? '/riego?tab=monitoreo' : '/'} className="flex h-12 shrink-0 items-center sm:h-14"><img src="/brand/lucient-logo-white.svg" alt="Lucient" className="h-7 w-auto sm:h-10" /></NavLink>
        <nav aria-label="Secciones de Lucient" className="order-3 grid w-full grid-cols-6 gap-1 pb-1 sm:order-none sm:flex sm:min-w-0 sm:flex-1 sm:overflow-x-auto sm:pb-0 [scrollbar-width:none]">
          {links.filter(([to]) => !regador || to === '/riego').map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={label} className={({ isActive }) => `flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-sm font-semibold transition-all sm:shrink-0 sm:px-3 ${isActive ? 'bg-white text-emerald-950 shadow-sm' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}><Icon size={19} /><span className="hidden xl:inline">{label}</span></NavLink>)}
        </nav>
        <button onClick={() => backend.auth.logout()} aria-label="Cerrar sesión" title="Cerrar sesión" className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"><LogOut size={19} /><span className="hidden xl:inline">Salir</span></button>
      </div>
    </header>
    <main className="relative isolate z-0"><OfflineStatus /><Outlet /></main>
  </div>;
}
