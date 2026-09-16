import React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from 'recharts';

// AGUA EN LA ZONA RADICULAR (mm de agua útil): histórico medido por
// la sonda + HOY + forecast a 7 días sin riego y con riego
// recomendado. Todo expresado en mm de agua útil.
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });
const dayT = d => new Date(`${d}T12:00:00`).getTime();

export default function MoistureChart({ detail }) {
  const { state, scenarioWithoutIrrigation, scenarioWithIrrigation, history, recommendation, probeLinked, initial_source, profile } = detail;
  const hasRec = recommendation != null;
  // HOY ancla en el estado inicial efectivo: valor manual si está
  // configurado, o el medido por la sonda — mismo punto de partida
  // que la proyección.
  const currentMm = initial_source === 'manual' && profile?.manual_initial_water_mm != null
    ? profile.manual_initial_water_mm
    : state.current_available_water_mm;
  const data = [
    ...(history || []).map(h => ({ t: h.t, Histórico: h.mm })),
    { t: Date.now(), Histórico: currentMm, 'Sin riego': currentMm, ...(hasRec ? { 'Riego recomendado': currentMm } : {}) },
    ...(scenarioWithoutIrrigation || []).map((p, i) => ({
      t: dayT(p.date),
      'Sin riego': p.available_water_mm,
      ...(hasRec ? { 'Riego recomendado': scenarioWithIrrigation?.[i]?.available_water_mm } : {}),
    })),
  ];
  const taw = state.total_available_water_capacity_mm;
  const rechargeMm = state.recharge_threshold_mm;
  const targetMm = state.target_water_mm;
  const yMax = Math.round(Math.max(taw || 0, currentMm || 0, ...data.map(d => d['Sin riego'] || 0), 10) * 1.1);
  const hasRefs = rechargeMm != null && targetMm != null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-charcoal">Agua en la zona radicular · histórico y forecast a 7 días</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        Milímetros de agua útil (por encima del punto de marchitez){hasRefs ? ' · banda verde = zona objetivo' : ''}{probeLinked ? ' · histórico medido por la sonda vinculada' : ''}
      </p>
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={6} />
            <YAxis domain={[0, yMax]} unit=" mm" stroke="#94a3b8" />
            <Tooltip labelFormatter={fmtTip} formatter={v => [`${v} mm`]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {hasRefs && <ReferenceArea y1={rechargeMm} y2={targetMm} fill="#a7f3d0" fillOpacity={0.35} strokeOpacity={0} ifOverflow="visible" />}
            {targetMm != null && <ReferenceLine y={targetMm} stroke="#1d4ed8" strokeDasharray="2 2" label={{ value: 'Objetivo de recarga', fontSize: 10, fill: '#1d4ed8', position: 'insideTopRight' }} />}
            {rechargeMm != null && <ReferenceLine y={rechargeMm} stroke="#dc2626" strokeDasharray="6 3" label={{ value: 'Umbral de recarga', fontSize: 10, fill: '#dc2626', position: 'insideBottomRight' }} />}
            <Area dataKey="Histórico" stroke="#94a3b8" strokeWidth={2} fillOpacity={0} dot={false} connectNulls />
            <Area dataKey="Sin riego" stroke="#dc2626" strokeWidth={2.5} fill="#dc2626" fillOpacity={0.06} dot={{ r: 2.5 }} connectNulls />
            {hasRec && <Area dataKey="Riego recomendado" stroke="#047857" strokeWidth={2.5} fill="#047857" fillOpacity={0.06} dot={{ r: 2.5 }} connectNulls />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}