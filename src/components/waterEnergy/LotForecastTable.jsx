import React from 'react';

// Tabla de forecast por lote — agua útil en mm (V1).
// Estado actual medido por la sonda, proyección a +3/+7 días sin
// riego, próximo riego (cruce del umbral de recarga) y lámina
// recomendada.
const DOT = { RECARGAR: 'bg-red-500', LLENO: 'bg-emerald-500', 'ÓPTIMO': 'bg-emerald-500' };
const fmtDate = s => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—');
const stateText = r => {
  if (!r.state) return 'Sin sonda';
  if (r.state.missing) return 'Sin lecturas';
  if (r.state.configuration_status === 'incomplete') return 'Config. incompleta';
  return `${r.state.current_available_water_mm} mm · ${r.state.available_water_percent}% útil`;
};

export default function LotForecastTable({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        No hay lotes con perfil de suelo configurado. Cargalos en Water & Energy → Configuración.
      </section>
    );
  }
  const cellMm = (r, i) => {
    const p = r.scenarioWithoutIrrigation?.[i];
    return p ? `${p.available_water_mm} mm` : '—';
  };
  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            {['Lote', 'Agua útil actual', '+3 días', '+7 días', 'Próximo riego', 'MM recomendados', 'Energía estimada'].map(h => <th key={h} className="px-4 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.lot.id} onClick={() => onOpen(r.lot.id)} className="cursor-pointer border-b border-slate-100 transition hover:bg-emerald-50/60">
              <td className="px-4 py-3"><b className="text-charcoal">{r.lot.name}</b><p className="text-xs text-slate-400">{r.lot.farm} · {r.lot.area_ha} ha</p></td>
              <td className="px-4 py-3">
                {r.forecast_status !== 'ok' ? (
                  <span className="text-xs font-semibold text-amber-600">{stateText(r)}</span>
                ) : (
                  <><span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${DOT[r.state.status] || 'bg-slate-300'}`} />{r.state.current_available_water_mm} mm <span className="text-xs text-slate-400">· {r.state.available_water_percent}% útil</span></>
                )}
              </td>
              <td className="px-4 py-3">{cellMm(r, 2)}</td>
              <td className="px-4 py-3">{cellMm(r, 6)}</td>
              <td className="px-4 py-3">{r.recommendation ? fmtDate(r.recommendation.recommended_start_date) : (r.kc_missing ? <span className="text-xs font-semibold text-amber-600">Falta Kc</span> : '—')}</td>
              <td className="px-4 py-3 font-semibold text-slate-700">{r.recommendation ? `${r.recommendation.recommended_irrigation_mm} mm` : '—'}</td>
              <td className="px-4 py-3 text-slate-600">{r.energy ? `${r.energy.kwh.toLocaleString('es-AR')} kWh` : r.recommendation ? 'Sin bomba asociada' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}