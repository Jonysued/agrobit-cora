import React, { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// BLOQUE 2 — HUMEDAD DEL PERFIL: una curva por cada profundidad REAL
// de la sonda (generada dinámicamente), con riegos y lluvias superpuestos.
const RANGES = [['24h', 1], ['7d', 7], ['30d', 30], ['90d', 90]];
const COLORS = ['#0891b2', '#059669', '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#7c3aed', '#2563eb', '#0d9488', '#4d7c0f', '#b45309', '#9333ea'];
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
const fmtTip = t => new Date(t).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const dayMs = d => new Date(`${d}T12:00:00`).getTime();

export default function ProfileChart({ readings, channels, events }) {
  const [range, setRange] = useState('30d');
  const days = RANGES.find(r => r[0] === range)[1];
  const from = Date.now() - days * 86400000;

  const depths = useMemo(() => [...channels].sort((a, b) => a.depth_cm - b.depth_cm).map(c => c.depth_cm), [channels]);
  const depthByChannel = useMemo(() => new Map(channels.map(c => [c.id, c.depth_cm])), [channels]);
  const data = useMemo(() => {
    const byTs = new Map();
    (readings || []).forEach(r => {
      const d = depthByChannel.get(r.probe_channel_id);
      if (d == null) return;
      const t = new Date(r.timestamp).getTime();
      if (t < from) return;
      if (!byTs.has(t)) byTs.set(t, { t });
      byTs.get(t)[String(d)] = r.value;
    });
    return [...byTs.values()].sort((a, b) => a.t - b.t);
  }, [readings, from, depthByChannel]);

  const irrLines = [...new Set(events?.irrigation || [])].map(dayMs).filter(ms => ms >= from);
  const rainLines = (events?.rain || []).filter(e => e.mm >= 1).map(e => dayMs(e.date)).filter(ms => ms >= from);

  return (
    <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-charcoal">Humedad del perfil</h3>
          <p className="text-xs text-slate-500">Una curva por profundidad real de la sonda · riegos y lluvias superpuestos</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {RANGES.map(([id, d]) => (
            <button key={id} type="button" onClick={() => setRange(id)} className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${range === id ? 'bg-emerald-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              {d === 1 ? '24 horas' : `${d} días`}
            </button>
          ))}
        </div>
      </div>
      {!data.length ? (
        <p className="mt-6 text-sm text-slate-400">Sin lecturas en este período.</p>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} stroke="#94a3b8" tickMargin={6} />
              <YAxis domain={['auto', 'auto']} unit="%" stroke="#94a3b8" />
              <Tooltip labelFormatter={fmtTip} formatter={v => [`${v} %`]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {depths.map((d, i) => (
                <Line key={d} dataKey={String(d)} name={`${d} cm`} stroke={COLORS[i % COLORS.length]} strokeWidth={1.8} dot={false} connectNulls />
              ))}
              {irrLines.map(ms => (
                <ReferenceLine key={`i${ms}`} x={ms} stroke="#1d4ed8" strokeDasharray="3 3" label={{ value: 'Riego', position: 'insideTopLeft', fontSize: 9, fill: '#1d4ed8' }} />
              ))}
              {rainLines.map(ms => (
                <ReferenceLine key={`r${ms}`} x={ms} stroke="#0891b2" strokeDasharray="2 4" label={{ value: 'Lluvia', position: 'insideTopRight', fontSize: 9, fill: '#0891b2' }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}