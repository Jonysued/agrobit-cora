import React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from 'recharts';

// SUMA DE PERFIL (mm de agua física almacenada en el perfil del suelo):
// histórico medido por la sonda + HOY + forecast a 7 días sin riego y
// con riego recomendado, todos en la misma escala de almacenamiento.
// Los umbrales (recarga, objetivo, capacidad de campo) se muestran en
// esa misma escala.
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });
const dayT = d => new Date(`${d}T12:00:00`).getTime();

export default function MoistureChart({ detail }) {
  const { state, scenarioWithoutIrrigation, scenarioWithIrrigation, history, recommendation, probeLinked, initial_source, profile } = detail;
  const hasRec = recommendation != null;
  // Escala de almacenamiento: agua útil del balance + agua del punto
  // de marchitez (se mantiene por debajo de la medición de la sonda).
  const wiltingMm = state.wilting_storage_mm ?? 0;
  const storage = mm => wiltingMm + mm;
  const manualStart = initial_source === 'manual' && profile?.manual_initial_water_mm != null ? profile.manual_initial_water_mm : null;
  const todayMm = manualStart != null ? storage(manualStart) : (state.total_profile_water_mm ?? 0);
  const data = [
    ...(history || []).map(h => ({ t: h.t, 'Histórico': h.profile })),
    { t: Date.now(), 'Histórico': todayMm, 'Sin riego': todayMm, ...(hasRec ? { 'Riego recomendado': todayMm } : {}) },
    ...(scenarioWithoutIrrigation || []).map((p, i) => ({
      t: dayT(p.date),
      'Sin riego': storage(p.available_water_mm),
      ...(hasRec ? { 'Riego recomendado': storage(scenarioWithIrrigation?.[i]?.available_water_mm) } : {}),
    })),
  ];
  const fcMm = state.field_capacity_storage_mm;
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const yMax = Math.ceil(Math.max(fcMm || 0, todayMm || 0, ...data.map(d => d['Sin riego'] || 0), 10) * 1.08);
  const hasRefs = rechargeMm != null && targetMm != null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-charcoal">Suma de perfil</h3>
        <p className="text-xs text-slate-500">
          mm de agua almacenada en el perfil{hasRefs ? ' · banda verde = zona objetivo' : ''}{probeLinked ? ' · histórico medido por la sonda vinculada' : ''}
        </p>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 18, bottom: 4, left: -4 }}>
            <defs>
              <linearGradient id="gNoIrr" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#047857" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#047857" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={8} tick={{ fontSize: 11 }} />
            <YAxis domain={[0, yMax]} unit=" mm" stroke="#94a3b8" tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={fmtTip}
              formatter={(v, name) => [v != null ? `${Math.round(v * 10) / 10} mm` : '—', name]}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 6 }} iconType="plainline" />
            {hasRefs && <ReferenceArea y1={rechargeMm} y2={targetMm} fill="#a7f3d0" fillOpacity={0.35} strokeOpacity={0} ifOverflow="visible" />}
            {fcMm != null && <ReferenceLine y={fcMm} stroke="#0369a1" strokeDasharray="4 4" label={{ value: 'Capacidad de campo', fontSize: 10, fill: '#0369a1', position: 'insideTopLeft' }} ifOverflow="visible" />}
            {targetMm != null && <ReferenceLine y={targetMm} stroke="#1d4ed8" strokeDasharray="2 2" label={{ value: 'Objetivo de recarga', fontSize: 10, fill: '#1d4ed8', position: 'insideTopRight' }} ifOverflow="visible" />}
            {rechargeMm != null && <ReferenceLine y={rechargeMm} stroke="#dc2626" strokeDasharray="6 3" label={{ value: 'Umbral de recarga', fontSize: 10, fill: '#dc2626', position: 'insideBottomRight' }} ifOverflow="visible" />}
            <Area dataKey="Histórico" stroke="#94a3b8" strokeWidth={1.5} fillOpacity={0} dot={false} connectNulls />
            <Area dataKey="Sin riego" stroke="#dc2626" strokeWidth={2.5} fill="url(#gNoIrr)" dot={{ r: 2.5 }} connectNulls activeDot={{ r: 4 }} />
            {hasRec && <Area dataKey="Riego recomendado" stroke="#047857" strokeWidth={2.5} fill="url(#gRec)" dot={{ r: 2.5 }} connectNulls activeDot={{ r: 4 }} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Histórico y estado actual medidos por sonda · proyección a 7 días del modelo de balance hídrico{initial_source === 'manual' ? ' · inicio manual configurado' : ''}
      </p>
    </section>
  );
}