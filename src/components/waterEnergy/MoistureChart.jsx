import React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from 'recharts';

// SUMA DE PERFIL (mm de agua almacenada en el perfil del suelo) —
// CURVA CALCULADA del lote: reconstrucción diaria desde el estado
// inicial (riegos ejecutados, lluvia observada, ETc) + HOY +
// forecast a 7 días con riegos programados y, si corresponde, el
// riego recomendado. Los eventos de riego se marcan sobre la curva.
const dayTs = d => new Date(`${d}T12:00:00`).getTime();
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });

export default function MoistureChart({ detail }) {
  const { state, scenarioWithoutIrrigation, scenarioWithIrrigation, history, recommendation, scheduled_irrigation } = detail;
  const hasRec = recommendation != null;
  const scheduled = scheduled_irrigation || [];
  const hasScheduled = scheduled.length > 0;
  const baseKey = hasScheduled ? 'Con riego programado' : 'Sin riego';
  // Escala de almacenamiento: agua útil del balance + agua del punto
  // de marchitez (constante del perfil).
  const wiltingMm = state.wilting_storage_mm ?? 0;
  const storage = mm => wiltingMm + mm;
  const currentMm = state.current_available_water_mm;
  const data = [
    ...(history || []).map(h => ({ t: dayTs(h.date), 'Curva del lote': storage(h.mm) })),
    { t: Date.now(), 'Curva del lote': storage(currentMm), [baseKey]: storage(currentMm), ...(hasRec ? { 'Riego recomendado': storage(currentMm) } : {}) },
    ...(scenarioWithoutIrrigation || []).map((p, i) => ({
      t: dayTs(p.date),
      [baseKey]: storage(p.available_water_mm),
      ...(hasRec ? { 'Riego recomendado': storage(scenarioWithIrrigation?.[i]?.available_water_mm ?? p.available_water_mm) } : {}),
    })),
  ];
  const fcMm = state.field_capacity_storage_mm;
  const rechargeMm = state.recharge_storage_mm;
  const targetMm = state.target_storage_mm;
  const yMax = Math.ceil(Math.max(fcMm || 0, currentMm || 0, ...data.map(d => d[baseKey] || 0), 10) * 1.08);
  const hasRefs = rechargeMm != null && targetMm != null;
  // Eventos de riego sobre la curva: ejecutados (pasado, calculados)
  // y programados (futuro, aún no aplicados)
  const irrEvents = [
    ...(detail.events?.irrigation || []).map(e => ({ ...e, kind: 'ejecutado' })),
    ...scheduled.map(e => ({ ...e, kind: 'programado' })),
  ];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-bold text-charcoal">Suma de perfil</h3>
        <p className="text-xs text-slate-500">
          curva calculada del lote (mm de agua almacenada){hasRefs ? ' · banda verde = zona objetivo' : ''}
        </p>
      </div>
      <div className="mt-4 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 18, bottom: 4, left: -4 }}>
            <defs>
              <linearGradient id="gBase" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#047857" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#047857" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gLot" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#475569" stopOpacity={0.02} />
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
            {irrEvents.map((e, i) => (
              <ReferenceLine
                key={`${e.date}-${i}`}
                x={dayTs(e.date)}
                stroke={e.kind === 'ejecutado' ? '#059669' : '#0284c7'}
                strokeDasharray={e.kind === 'ejecutado' ? '' : '4 3'}
                label={{ value: `${e.kind === 'ejecutado' ? 'Riego' : 'Prog.'} ${e.mm}mm`, fontSize: 9, fill: e.kind === 'ejecutado' ? '#059669' : '#0284c7', position: 'top' }}
                ifOverflow="extendDomain"
              />
            ))}
            <Area dataKey="Curva del lote" stroke="#475569" strokeWidth={1.8} fill="url(#gLot)" dot={false} connectNulls />
            <Area dataKey={baseKey} stroke="#dc2626" strokeWidth={2.5} fill="url(#gBase)" dot={{ r: 2.5 }} connectNulls activeDot={{ r: 4 }} />
            {hasRec && <Area dataKey="Riego recomendado" stroke="#047857" strokeWidth={2.5} fill="url(#gRec)" dot={{ r: 2.5 }} connectNulls activeDot={{ r: 4 }} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Reconstrucción calculada con los riegos ejecutados, la lluvia observada y la demanda del cultivo · proyección a 7 días con el riego programado del lote · comportamiento del suelo según el modelo de referencia
      </p>
    </section>
  );
}