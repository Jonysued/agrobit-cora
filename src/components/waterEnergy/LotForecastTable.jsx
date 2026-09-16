import React from 'react';
import { statusForVwc } from '@/services/waterEnergy';

const vwcPct = v => `${Math.round(v * 100)}%`;
const DOT = { verde: 'bg-emerald-500', amarillo: 'bg-amber-500', rojo: 'bg-red-500' };
const TONE = { verde: 'text-emerald-700', amarillo: 'text-amber-600', rojo: 'text-red-600 font-bold' };
const fmtDate = s => (s ? new Date(`${s}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—');

export default function LotForecastTable({ rows, onOpen }) {
  if (!rows.length) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        No hay lotes con perfil de suelo configurado. Cargalos en Water & Energy → Configuración.
      </section>
    );
  }
  const cell = (r, p) => (p ? <span className={TONE[statusForVwc(r.profile, p.vwc)]}>{vwcPct(p.vwc)}</span> : '—');
  return (
    <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            {['Lote', 'Estado actual', '+3 días', '+7 días', 'Próximo riego', 'MM recomendados', 'Energía estimada'].map(h => <th key={h} className="px-4 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.lot.id} onClick={() => onOpen(r.lot.id)} className="cursor-pointer border-b border-slate-100 transition hover:bg-emerald-50/60">
              <td className="px-4 py-3"><b className="text-charcoal">{r.lot.name}</b><p className="text-xs text-slate-400">{r.lot.farm} · {r.lot.area_ha} ha</p></td>
              <td className="px-4 py-3"><span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle ${DOT[r.status]}`} />{vwcPct(r.currentVwc)} <span className="text-xs text-slate-400">· {r.currentPct}% disp.</span></td>
              <td className="px-4 py-3">{cell(r, r.scenarioA[2])}</td>
              <td className="px-4 py-3">{cell(r, r.scenarioA[6])}</td>
              <td className="px-4 py-3">{r.recommendation ? fmtDate(r.recommendation.recommended_start_date) : '—'}</td>
              <td className="px-4 py-3 font-semibold text-slate-700">{r.recommendation ? `${r.recommendation.recommended_irrigation_mm} mm` : '—'}</td>
              <td className="px-4 py-3 text-slate-600">{r.energy ? `${r.energy.kwh.toLocaleString('es-AR')} kWh` : r.recommendation ? 'Sin bomba asociada' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}