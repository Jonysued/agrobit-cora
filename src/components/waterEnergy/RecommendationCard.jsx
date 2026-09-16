import React from 'react';

const fmtDate = s => new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function RecommendationCard({ detail }) {
  const { lot, recommendation, energy } = detail;
  if (!recommendation) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <h3 className="font-bold text-emerald-900">Recomendación</h3>
        <p className="mt-1 text-sm text-emerald-800">No se requiere riego en los próximos 7 días: el modelo estima que la humedad se mantiene sobre el umbral mínimo.</p>
      </section>
    );
  }
  const rows = [
    ['Volumen', `${recommendation.recommended_irrigation_m3.toLocaleString('es-AR')} m³`],
    ['Ventana recomendada', fmtDate(recommendation.recommended_start_date)],
    ['Tiempo estimado de bombeo', energy ? `${energy.hours} h` : 'Sin bomba asociada'],
    ['Consumo estimado', energy ? `${energy.kwh.toLocaleString('es-AR')} kWh` : '—'],
    ['Costo energético estimado', energy ? `$ ${energy.cost.toLocaleString('es-AR')}` : '—'],
  ];
  return (
    <section className="rounded-2xl bg-emerald-950 p-6 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold">Recomendación · Regar {lot.name}</h3>
        <span className="rounded-full bg-amber-400/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Estimación · modelo experimental</span>
      </div>
      <div className="mt-4 grid items-center gap-5 md:grid-cols-[auto_1fr]">
        <div className="text-center">
          <p className="text-4xl font-bold tracking-tight">{recommendation.recommended_irrigation_mm}<span className="ml-1 text-base font-semibold text-white/60">mm</span></p>
          <p className="mt-1 text-xs uppercase tracking-wider text-white/50">lámina recomendada</p>
        </div>
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-white/10 pb-1.5"><span className="text-white/60">{k}</span><b>{v}</b></div>
          ))}
        </div>
      </div>
      <p className="mt-4 rounded-xl bg-white/10 p-3 text-sm text-white/80">{recommendation.reason}</p>
    </section>
  );
}