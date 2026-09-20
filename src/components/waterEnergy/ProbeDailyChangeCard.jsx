import React from 'react';

// Tarjeta del dashboard: variación del agua del PERFIL COMPLETO de
// cada SONDA de la finca en las últimas 24 h (escala Suma de perfil,
// mm). Un cuadrado por sonda: verde ▲ subió, ámbar ▲ bajó, gris — sin
// dato calculable.
export default function ProbeDailyChangeCard({ probes, onOpen }) {
  if (!probes.length) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-charcoal">Variación de sondas · últimas 24 h</h3>
      <p className="text-xs text-slate-400">Agua del perfil medido por cada sonda (mm de agua almacenada).</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map(p => {
          const mm = p.daily_change_mm;
          const up = mm != null && mm > 0;
          const down = mm != null && mm < 0;
          return (
            <div
              key={p.probeId}
              onClick={() => onOpen?.(p.probeId)}
              className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50/60 p-4 transition hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <p className="truncate text-sm font-bold text-charcoal">{p.probe?.name || 'Sonda'}</p>
              <p className="truncate text-xs text-slate-400">{p.lotName}</p>
              <p className={`mt-2 text-2xl font-bold ${up ? 'text-emerald-700' : down ? 'text-amber-700' : 'text-slate-400'}`}>
                {mm == null ? '—' : up ? `▲ +${mm}` : down ? `▼ ${mm}` : '0.0'}
                <span className="ml-1 text-sm font-semibold text-slate-400">mm</span>
              </p>
              {mm == null && <p className="text-[11px] text-slate-400">Sin lecturas suficientes</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}