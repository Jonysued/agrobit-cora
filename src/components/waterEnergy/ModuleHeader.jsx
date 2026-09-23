import React from 'react';
import { NavLink } from 'react-router-dom';
import { Droplets } from 'lucide-react';

const TABS = [
  ['/water-energy', 'Dashboard'],
  ['/water-energy/riegos', 'Riegos'],
  ['/water-energy/energia', 'Energía'],
  ['/water-energy/sensores', 'Sensores'],
  ['/water-energy/configuracion', 'Configuración'],
];

export default function ModuleHeader() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 text-white shadow-[0_8px_24px_rgba(43,85,65,.18)]"><Droplets size={20} /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-charcoal">Water &amp; Energy</h1>
            <p className="text-xs text-slate-500">Estado hídrico, forecast y consumo energético</p>
          </div>
        </div>
      </div>
      <nav className="flex max-w-full gap-1 self-start overflow-x-auto rounded-2xl border border-emerald-900/10 bg-white/90 p-1.5 shadow-[0_8px_24px_rgba(11,37,38,.05)]">
        {TABS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/water-energy'} className={({ isActive }) => `rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-emerald-900 text-white shadow-sm' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-900'}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  );
}
