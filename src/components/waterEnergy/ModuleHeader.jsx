import React from 'react';
import { Droplets, Zap } from 'lucide-react';

export default function ModuleHeader({ energy = false }) {
  const Icon = energy ? Zap : Droplets;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 text-white shadow-[0_8px_24px_rgba(43,85,65,.18)]"><Icon size={20} /></span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-charcoal">{energy ? 'Energy' : 'Water'}</h1>
            <p className="text-xs text-slate-500">{energy ? 'Consumo energético y funcionamiento de los pozos' : 'Balance hídrico y sensores de humedad'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
