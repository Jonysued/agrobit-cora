import React from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// BLOQUE 3 — AGUA EN LA ZONA RADICULAR (mm): histórico real, HOY y
// forecast a 7 días en dos escenarios (sin riego / con riego recomendado).
// El forecast representa el agua TOTAL de la zona radicular.
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });
const dayMs = d => new Date(`${d}T12:00:00`).getTime();

export default function RootZoneChart({ history, forecastA, forecastB, thresholds }) {
  const { fcMm, tMinMm, tMaxMm } = thresholds;
  const nowMs = Date.now();
  const data = [
    ...(history || []).map(h => ({ t: h.t, hist: h.mm })),
    ...(forecastA || []).map((f, i) => ({ t: dayMs(f.date), sin: f.mm, con: forecastB?.[i]?.mm })),
  ];
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-charcoal">Agua en la zona radicular</h3>
      <p className="text-xs text-slate-500">Histórico real → HOY → forecast 7 días · banda verde = zona objetivo</p>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={6} />
            <YAxis domain={[Math.max(0, Math.round(tMinMm - 50)), Math.round(fcMm + 40)]} unit=" mm" stroke="#94a3b8" />
            <Tooltip labelFormatter={fmtTip} formatter={v => [`${Math.round(v)} mm`]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceArea y1={tMinMm} y2={tMaxMm} fill="#059669" fillOpacity={0.08} strokeOpacity={0} ifOverflow="visible" />
            <ReferenceLine y={fcMm} stroke="#1d4ed8" strokeDasharray="4 4" label={{ value: 'Capacidad máxima', position: 'insideTopRight', fontSize: 10, fill: '#1d4ed8' }} />
            <ReferenceLine y={tMinMm} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Umbral de recarga', position: 'insideBottomRight', fontSize: 10, fill: '#dc2626' }} />
            <ReferenceLine x={nowMs} stroke="#334155" label={{ value: 'HOY', position: 'top', fontSize: 10, fill: '#334155' }} />
            <Area dataKey="hist" name="Histórico" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} dot={false} connectNulls />
            <Line dataKey="sin" name="Sin riego" stroke="#dc2626" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
            <Line dataKey="con" name="Con riego recomendado" stroke="#059669" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}