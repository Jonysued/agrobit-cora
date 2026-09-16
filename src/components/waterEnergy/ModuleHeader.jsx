import React from 'react';
import { NavLink } from 'react-router-dom';
import { Droplets } from 'lucide-react';

const TABS = [
  ['/water-energy', 'Dashboard'],
  ['/water-energy/energia', 'Energía'],
  ['/water-energy/configuracion', 'Configuración'],
];

export default function ModuleHeader() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-700 text-white"><Droplets size={20} /></span>
          <div>
            <h1 className="text-xl font-bold text-charcoal">Water & Energy</h1>
            <p className="text-xs text-slate-500">Estado hídrico, forecast y consumo energético</p>
          </div>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">Modelo experimental · datos simulados</span>
      </div>
      <nav className="flex gap-1 self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {TABS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/water-energy'} className={({ isActive }) => `rounded-lg px-4 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-emerald-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}