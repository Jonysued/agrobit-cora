import React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// BLOQUE 3 — AGUA ÚTIL EN LA ZONA RADICULAR (mm): histórico del agua
// útil (por encima del punto de marchitez) con su zona objetivo
// (umbral de recarga → objetivo de recarga).
// Solo monitoreo: sin pronósticos ni recomendaciones.
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });

export default function RootZoneChart({ history, rechargeMm, targetMm, tawMm }) {
  const data = (history || []).map(h => ({ t: h.t, hist: h.mm }));
  const yMax = Math.round(Math.max(tawMm || 0, ...data.map(d => d.hist || 0), 10) * 1.1);
  const hasRefs = rechargeMm != null && targetMm != null;
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-charcoal">Agua útil en la zona radicular</h3>
      <p className="text-xs text-slate-500">Histórico del agua útil (por encima del punto de marchitez){hasRefs ? ' · banda verde = zona objetivo' : ''}</p>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={6} />
            <YAxis domain={[0, yMax]} unit=" mm" stroke="#94a3b8" />
            <Tooltip labelFormatter={fmtTip} formatter={v => [`${Math.round(v)} mm`]} />
            {hasRefs && <ReferenceArea y1={rechargeMm} y2={targetMm} fill="#059669" fillOpacity={0.08} strokeOpacity={0} ifOverflow="visible" />}
            {targetMm != null && <ReferenceLine y={targetMm} stroke="#1d4ed8" strokeDasharray="4 4" label={{ value: 'Objetivo', position: 'insideTopRight', fontSize: 10, fill: '#1d4ed8' }} />}
            {rechargeMm != null && <ReferenceLine y={rechargeMm} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Umbral de recarga', position: 'insideBottomRight', fontSize: 10, fill: '#dc2626' }} />}
            <Area dataKey="hist" name="Histórico" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}