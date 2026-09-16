import React from 'react';
import { Waves, Timer, Zap, CircleDollarSign, Droplets, CalendarClock } from 'lucide-react';

const STATUS = {
  ok: { label: 'Confortable', cls: 'bg-emerald-100 text-emerald-800' },
  alerta: { label: 'Vigilar', cls: 'bg-amber-100 text-amber-800' },
  'crítico': { label: 'Riesgo', cls: 'bg-red-100 text-red-700' },
};
const fmt = (n, d = 1) => n.toLocaleString('es-AR', { maximumFractionDigits: d });

export default function LotWaterCard({ result, onOpen }) {
  const r = result;
  const s = STATUS[r.status];
  const pct = Math.round(r.currentPct * 100);
  const tiles = [
    ['Lámina', `${fmt(r.needMm)} mm`, Waves],
    ['Volumen', `${fmt(r.volumeM3, 0)} m³`, Droplets],
    ['Bomba', `${fmt(r.pumpHours)} h`, Timer],
    ['Energía', `${fmt(r.kwh, 0)} kWh`, Zap],
    ['Costo', `$ ${fmt(r.cost, 0)}`, CircleDollarSign],
    ['Programados', `${r.scheduledCount}`, CalendarClock],
  ];
  return (
    <button onClick={onOpen} className="group flex w-full flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-charcoal">{r.lot.name}</p>
          <p className="text-xs text-slate-500">{r.lot.farm} · {r.lot.crop}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-500">
          <span>Agua disponible</span>
          <b className="text-slate-700">{fmt(r.currentMm)} / {r.useful} mm</b>
        </div>
        <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${r.status === 'crítico' ? 'bg-red-500' : r.status === 'alerta' ? 'bg-amber-500' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Umbral mínimo: {r.threshold} mm · {r.daysToThreshold != null ? `se alcanza en ${r.daysToThreshold} día${r.daysToThreshold > 1 ? 's' : ''}` : 'no se alcanza en 7 días'}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
        {tiles.map(([label, value, Icon]) => (
          <div key={label}>
            <Icon size={14} className="mx-auto text-emerald-700" />
            <p className="mt-1 text-[10px] font-bold uppercase text-slate-400">{label}</p>
            <p className="text-sm font-bold text-slate-700">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xs font-semibold text-emerald-800 group-hover:underline">Ver detalle y forecast 7 días</p>
    </button>
  );
}