import React from 'react';

// BLOQUE 1 — ESTADO HÍDRICO: AGUA EN EL PERFIL (mm de agua total
// almacenada). Barra simple de llenado (0 → capacidad de campo),
// sin zonas de recarga/óptimo/lleno. Solo monitoreo.
const STATUS_BADGE = {
  RECARGAR: 'bg-red-100 text-red-700',
  ÓPTIMO: 'bg-emerald-100 text-emerald-800',
  LLENO: 'bg-cyan-100 text-cyan-800',
};
const clamp = n => Math.max(0, Math.min(100, n));
const round1 = n => Math.round(n * 10) / 10;

// Perfil completo de agua de la sonda: agrupa el desglose
// segmento × capa por profundidad de sensor (mm de agua almacenada
// en el segmento que representa cada sensor).
function depthRows(breakdown) {
  const rows = [];
  for (const part of breakdown || []) {
    let row = rows.find(r => r.sensor_depth_cm === part.sensor_depth_cm);
    if (!row) {
      row = { sensor_depth_cm: part.sensor_depth_cm, top: part.depth_top_cm, bottom: part.depth_bottom_cm, water: 0, fcWater: 0 };
      rows.push(row);
    }
    row.top = Math.min(row.top, part.depth_top_cm);
    row.bottom = Math.max(row.bottom, part.depth_bottom_cm);
    row.water += part.profile_water_mm || 0;
    row.fcWater += part.field_capacity_vwc * (part.depth_bottom_cm - part.depth_top_cm) * 10;
  }
  return rows.sort((a, b) => a.sensor_depth_cm - b.sensor_depth_cm);
}

export default function StatusCard({ status, totalProfileMm, depthLabel, fcStorageMm, layerBreakdown, dailyChangeMm }) {
  const scale = fcStorageMm > 0 ? fcStorageMm : null;
  const rows = depthRows(layerBreakdown);
  const pos = scale && totalProfileMm != null ? clamp(Math.round((totalProfileMm / scale) * 100)) : 0;
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold text-charcoal">Estado hídrico</h3>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[status] || 'bg-slate-100 text-slate-600'}`}>{status || 'Sin configurar'}</span>
      </div>
      <div className="mt-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agua en el perfil{depthLabel ? ` · ${depthLabel}` : ''}</p>
        <p className="mt-1 text-5xl font-bold tracking-tight text-charcoal">
          {totalProfileMm == null ? '—' : totalProfileMm}<span className="ml-1.5 text-lg font-semibold text-slate-400">mm</span>
        </p>
        {dailyChangeMm != null && (
          <p className={`mt-1.5 text-xs font-bold ${dailyChangeMm > 0 ? 'text-emerald-700' : dailyChangeMm < 0 ? 'text-amber-700' : 'text-slate-500'}`}>
            {dailyChangeMm > 0 ? `▲ +${dailyChangeMm} mm` : dailyChangeMm < 0 ? `▼ ${dailyChangeMm} mm` : 'Sin variación'} en las últimas 24 h
          </p>
        )}
      </div>
      <div className="mt-6">
        <div className="relative">
          <div className="h-5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pos}%` }} />
          </div>
          <div className="absolute -top-1.5 h-8 w-[3px] rounded-full bg-charcoal shadow-md" style={{ left: `calc(${pos}% - 1.5px)` }} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Llenado relativo a la capacidad de campo del perfil ({scale ? `${scale} mm` : '—'}).</p>
      </div>
      {rows.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agua por profundidad · perfil completo de la sonda</p>
          <div className="mt-2 space-y-2">
            {rows.map(r => {
              const pct = r.fcWater > 0 ? clamp(Math.round((r.water / r.fcWater) * 100)) : 0;
              return (
                <div key={r.sensor_depth_cm} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs font-bold text-charcoal">{r.sensor_depth_cm} cm</span>
                  <span className="w-20 shrink-0 text-[11px] text-slate-400">{r.top}–{r.bottom} cm</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs font-semibold text-slate-600">
                    {round1(r.water)} de {round1(r.fcWater)} mm
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            mm de agua almacenada por segmento ({rows.reduce((s, r) => s + round1(r.water), 0)} mm en total) · barra = llenado relativo a la capacidad de campo del segmento.
          </p>
        </div>
      )}
    </section>
  );
}