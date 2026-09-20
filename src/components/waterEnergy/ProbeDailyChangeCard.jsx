import React from 'react';

// Tarjeta del dashboard: variación del agua del PERFIL COMPLETO de
// cada SONDA de la finca en las últimas 24 h (escala Suma de perfil,
// mm). Un cuadrado por sonda: verde ▲ subió, ámbar ▲ bajó, gris — sin
// dato calculable.
// Motivo cuando no hay variación calculable: prioridad al mensaje de
// la sonda (sin lote vinculado / sin lecturas); si tiene señal vieja,
// se informa desde cuándo no emite.
const noDataReason = p => {
  if (p.missing) return p.missing;
  if (p.last_signal_ts) return `Sin señal desde ${new Date(p.last_signal_ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}`;
  return 'Sin lecturas suficientes';
};

export default function ProbeDailyChangeCard({ probes, onOpen }) {
  if (!probes.length) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-bold text-charcoal">Variación de sensores · últimas 24 h</h3>
      <p className="text-[11px] text-slate-400">Agua del perfil medido por cada sensor (mm de agua almacenada).</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {probes.map(p => {
          const mm = p.daily_change_mm;
          const up = mm != null && mm > 0;
          const down = mm != null && mm < 0;
          return (
            <div
              key={p.probeId}
              onClick={() => onOpen?.(p.probeId)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-slate-50/60 p-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <p className="truncate text-[13px] font-bold text-charcoal">{p.probe?.name || 'Sensor'}</p>
              <p className="truncate text-[11px] text-slate-400">{p.lotName}</p>
              <p className={`mt-1.5 text-xl font-bold ${up ? 'text-emerald-700' : down ? 'text-amber-700' : 'text-slate-400'}`}>
                {mm == null ? '—' : up ? `▲ +${mm}` : down ? `▼ ${mm}` : '0.0'}
                <span className="ml-1 text-xs font-semibold text-slate-400">mm</span>
              </p>
              {mm == null && <p className="text-[10px] text-slate-400">{noDataReason(p)}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}