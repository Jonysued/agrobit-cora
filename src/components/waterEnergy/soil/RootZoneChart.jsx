import React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// BLOQUE 3 — AGUA EN EL PERFIL (mm): histórico de la SUMA del agua
// almacenada del perfil medida por la sonda (sin promedios de VWC,
// sin extrapolar por debajo de la profundidad medida). Todas las
// referencias están en la misma escala de almacenamiento en mm:
// umbral de recarga, objetivo y capacidad de campo.
// Solo monitoreo: sin pronósticos ni recomendaciones.
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleDateString('es-AR', { dateStyle: 'medium' });

export default function RootZoneChart({ history, rechargeStorageMm, targetStorageMm, fcStorageMm, depthLabel }) {
  const data = (history || []).map(h => ({ t: h.t, hist: h.profile }));
  const yMax = Math.round(Math.max(fcStorageMm || 0, ...data.map(d => d.hist || 0), 10) * 1.1);
  const hasRefs = rechargeStorageMm != null && targetStorageMm != null;
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-charcoal">Agua en el perfil</h3>
      <p className="text-xs text-slate-500">Milímetros de agua almacenada en el perfil{depthLabel ? ` · ${depthLabel}` : ''}{hasRefs ? ' · banda verde = zona objetivo' : ''} — sin extrapolar por debajo de la profundidad medida.</p>
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={6} />
            <YAxis domain={[0, yMax]} unit=" mm" stroke="#94a3b8" />
            <Tooltip labelFormatter={fmtTip} formatter={v => [`${Math.round(v)} mm`]} />
            {hasRefs && <ReferenceArea y1={rechargeStorageMm} y2={targetStorageMm} fill="#059669" fillOpacity={0.08} strokeOpacity={0} ifOverflow="visible" />}
            {fcStorageMm != null && <ReferenceLine y={fcStorageMm} stroke="#0891b2" strokeDasharray="4 4" label={{ value: 'Capacidad de campo', position: 'insideTopRight', fontSize: 10, fill: '#0891b2' }} />}
            {targetStorageMm != null && <ReferenceLine y={targetStorageMm} stroke="#1d4ed8" strokeDasharray="4 4" label={{ value: 'Objetivo', position: 'insideTopRight', fontSize: 10, fill: '#1d4ed8' }} />}
            {rechargeStorageMm != null && <ReferenceLine y={rechargeStorageMm} stroke="#dc2626" strokeDasharray="4 4" label={{ value: 'Umbral de recarga', position: 'insideBottomRight', fontSize: 10, fill: '#dc2626' }} />}
            <Area dataKey="hist" name="Agua en el perfil" stroke="#059669" strokeWidth={2} fill="#059669" fillOpacity={0.12} dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}