import React from 'react';

// BLOQUE 1 — ESTADO HÍDRICO: barra RECARGAR → ÓPTIMO → LLENO con el
// marcador de estado actual. Solo monitoreo, sin recomendaciones.
const STATUS_BADGE = {
  RECARGAR: 'bg-red-100 text-red-700',
  ÓPTIMO: 'bg-emerald-100 text-emerald-800',
  LLENO: 'bg-cyan-100 text-cyan-800',
};

export default function StatusCard({ status, pct, thresholds, currentMm, deficitMm }) {
  const { wpMm, fcMm, tMinMm, tMaxMm } = thresholds;
  const span = fcMm - wpMm || 1;
  const zMin = Math.max(0, Math.min(100, Math.round(((tMinMm - wpMm) / span) * 100)));
  const zMax = Math.max(zMin, Math.min(100, Math.round(((tMaxMm - wpMm) / span) * 100)));
  const pos = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const metrics = [
    ['Agua disponible', pct == null ? '—' : `${pct}%`],
    ['Agua en zona radicular', `${Math.round(currentMm)} mm`],
    ['Déficit hasta objetivo', `${deficitMm} mm`],
  ];
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-charcoal">Estado hídrico</h3>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600'}`}>{status}</span>
      </div>
      <div className="mt-7">
        <div className="relative">
          <div className="flex h-5 overflow-hidden rounded-full">
            <div className="bg-red-300" style={{ width: `${zMin}%` }} />
            <div className="bg-emerald-300" style={{ width: `${zMax - zMin}%` }} />
            <div className="bg-cyan-300" style={{ width: `${100 - zMax}%` }} />
          </div>
          <div className="absolute -top-1.5 h-8 w-[3px] rounded-full bg-charcoal shadow-md" style={{ left: `calc(${pos}% - 1.5px)` }} />
        </div>
        <div className="mt-2 flex text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span style={{ width: `${zMin}%` }}>Recargar</span>
          <span style={{ width: `${zMax - zMin}%` }} className="text-center">Óptimo</span>
          <span style={{ width: `${100 - zMax}%` }} className="text-right">Lleno</span>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {metrics.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="mt-1 text-xl font-bold text-charcoal">{v}</p>
          </div>
        ))}
      </div>
    </section>
  );
}