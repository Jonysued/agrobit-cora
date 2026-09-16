import React from 'react';

// BLOQUE 4 — RECOMENDACIÓN: la tarjeta de decisión de riego.
// DATOS → INTERPRETACIÓN → DECISIÓN, sin variables técnicas.
const fmtDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function DecisionCard({ lot, recommendation, energy, nextIrrigation }) {
  if (!recommendation) {
    return (
      <section className="rounded-2xl bg-emerald-950 p-6 text-white shadow-sm">
        <h3 className="text-lg font-bold">Recomendación</h3>
        <p className="mt-2 text-sm text-white/80">No se requiere riego en los próximos 7 días: el modelo estima que el agua del perfil se mantiene sobre el umbral de recarga.</p>
      </section>
    );
  }
  const days = recommendation.days_to_threshold ?? nextIrrigation?.days;
  const rows = [
    ['Próximo riego', `En ${days} día${days > 1 ? 's' : ''} · ${fmtDate(recommendation.recommended_start_date)}`],
    ['Volumen', `${recommendation.recommended_irrigation_m3.toLocaleString('es-AR')} m³`],
    ['Tiempo de bombeo', energy ? `${energy.hours} h` : 'Sin bomba asociada'],
    ['Energía estimada', energy ? `${energy.kwh.toLocaleString('es-AR')} kWh` : '—'],
    ['Costo energético', energy ? `$ ${energy.cost.toLocaleString('es-AR')}` : '—'],
  ];
  return (
    <section className="rounded-2xl bg-emerald-950 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Recomendación · {lot.name}</h3>
        <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Estimación experimental</span>
      </div>
      <div className="mt-4 grid items-center gap-5 md:grid-cols-[auto_1fr]">
        <div className="text-center">
          <p className="text-4xl font-bold tracking-tight">{recommendation.recommended_irrigation_mm}<span className="ml-1 text-base font-semibold text-white/60">mm</span></p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-white/50">aplicar</p>
        </div>
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-white/10 pb-1.5"><span className="text-white/60">{k}</span><b>{v}</b></div>
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm text-white/80">
        Sin riego, el modelo estima que el lote llegará al umbral mínimo dentro de {days} día{days > 1 ? 's' : ''}.
      </p>
    </section>
  );
}