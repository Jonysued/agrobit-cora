import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine } from 'recharts';

const shortDate = d => new Date(`${d}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const pctTick = v => `${Math.round(v * 100)}%`;

export default function MoistureChart({ detail }) {
  const { profile, currentVwc, scenarioA, scenarioB, history, recommendation } = detail;
  const hasRec = recommendation != null;
  const data = [
    ...history.map(h => ({ label: shortDate(h.date), histórico: h.vwc })),
    { label: 'HOY', histórico: currentVwc, 'Sin riego': currentVwc, ...(hasRec ? { 'Riego recomendado': currentVwc } : {}) },
    ...scenarioA.map((p, i) => ({
      label: shortDate(p.date),
      'Sin riego': p.vwc,
      ...(hasRec ? { 'Riego recomendado': scenarioB[i].vwc } : {}),
    })),
  ];
  const yMin = Math.max(0.02, profile.wilting_point_vwc - 0.03);
  const yMax = Math.min(0.55, profile.field_capacity_vwc + 0.05);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-charcoal">Humedad del suelo · histórico y forecast a 7 días</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Banda verde: zona objetivo · líneas: capacidad de campo y umbral de riego{detail.probeLinked ? ' · histórico medido por la sonda vinculada' : ''}
      </p>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={pctTick} domain={[yMin, yMax]} />
            <Tooltip formatter={v => `${Math.round(v * 1000) / 10}% VWC`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceArea y1={profile.target_min_vwc} y2={profile.target_max_vwc} fill="#a7f3d0" fillOpacity={0.35} />
            <ReferenceLine y={profile.field_capacity_vwc} stroke="#0284c7" strokeDasharray="2 2" label={{ value: 'Capacidad de campo', fontSize: 10, fill: '#0284c7', position: 'insideTopRight' }} />
            <ReferenceLine y={profile.target_min_vwc} stroke="#dc2626" strokeDasharray="6 3" label={{ value: 'Umbral de riego', fontSize: 10, fill: '#dc2626', position: 'insideBottomRight' }} />
            <Line type="monotone" dataKey="histórico" stroke="#94a3b8" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line type="monotone" dataKey="Sin riego" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />
            {hasRec && <Line type="monotone" dataKey="Riego recomendado" stroke="#047857" strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}