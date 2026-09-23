import React, { useMemo } from 'react';
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const PROBE_RANGES = [
  ['24h', 1, '24 horas'],
  ['7d', 7, '7 días'],
  ['30d', 30, '30 días'],
  ['90d', 90, '90 días'],
];

const COLORS = ['#2f80b9', '#eb6b4a', '#efb94f', '#246b4a', '#c9a91d', '#6c36a5', '#eb4774', '#225c7d', '#27bd3d', '#f28705', '#a30909', '#07b9bd'];
const fmtX = t => new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
const fmtTip = t => new Date(t).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
const fromFor = range => Date.now() - (PROBE_RANGES.find(r => r[0] === range)?.[1] || 30) * 86400000;

function useMoistureData(readings, channels, range, stacked = false) {
  return useMemo(() => {
    const from = fromFor(range);
    const sorted = [...(channels || [])].sort((a, b) => a.depth_cm - b.depth_cm);
    const depthByChannel = new Map(sorted.map(c => [c.id, c.depth_cm]));
    const byTs = new Map();
    (readings || []).forEach(r => {
      const depth = depthByChannel.get(r.probe_channel_id);
      const t = new Date(r.timestamp).getTime();
      if (depth == null || t < from) return;
      if (!byTs.has(t)) byTs.set(t, { t });
      byTs.get(t)[String(depth)] = Number(r.value);
    });
    const rows = [...byTs.values()].sort((a, b) => a.t - b.t);
    if (stacked) {
      sorted.forEach((channel, index) => {
        const key = String(channel.depth_cm);
        const values = rows.map(row => row[key]).filter(Number.isFinite);
        const baseline = values.length ? Math.min(...values) : 0;
        rows.forEach(row => {
          if (Number.isFinite(row[key])) row[`stack_${key}`] = row[key] - baseline + index * 12;
        });
      });
    }
    return { rows, channels: sorted };
  }, [readings, channels, range, stacked]);
}

const chartMargins = compact => compact
  ? { top: 10, right: 4, bottom: 0, left: -24 }
  : { top: 16, right: 20, bottom: 8, left: 0 };

export function MoistureLines({ readings, channels, events, range = '30d', height = 270, compact = false, stacked = false }) {
  const { rows, channels: sorted } = useMoistureData(readings, channels, range, stacked);
  const from = fromFor(range);
  const irrigation = [...new Set(events?.irrigation || [])]
    .map(d => new Date(`${d}T12:00:00`).getTime()).filter(t => t >= from);
  const rain = (events?.rain || []).filter(e => e.mm >= 1)
    .map(e => new Date(`${e.date}T12:00:00`).getTime()).filter(t => t >= from);

  if (!rows.length) return <EmptyChart message="Sin lecturas en este período" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={chartMargins(compact)}>
        <CartesianGrid stroke="#e5e9e5" vertical={!compact} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} tick={{ fontSize: compact ? 9 : 11 }} stroke="#8a938d" minTickGap={26} />
        <YAxis hide={stacked} width={compact ? 34 : 52} unit={stacked ? '' : '%'} tick={{ fontSize: compact ? 9 : 11 }} stroke="#8a938d" domain={['auto', 'auto']} />
        {!compact && <Tooltip labelFormatter={fmtTip} formatter={(value, name, item) => {
          if (!stacked) return [`${Number(value).toFixed(1)} %`, name];
          const depth = item.dataKey.replace('stack_', '');
          return [`${Number(item.payload[depth]).toFixed(1)} %`, `${depth} cm`];
        }} />}
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: compact ? 9 : 11, paddingTop: 8 }} />
        {sorted.map((channel, index) => {
          const depth = String(channel.depth_cm);
          return <Line key={depth} dataKey={stacked ? `stack_${depth}` : depth} name={`${depth} cm`} stroke={COLORS[index % COLORS.length]} strokeWidth={compact ? 1.4 : 1.8} dot={false} connectNulls isAnimationActive={false} />;
        })}
        {!stacked && irrigation.map(t => <ReferenceLine key={`i${t}`} x={t} stroke="#2563eb" strokeDasharray="4 3" />)}
        {!stacked && rain.map(t => <ReferenceLine key={`r${t}`} x={t} stroke="#38a9d3" strokeDasharray="2 4" />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WaterSumChart({ history, range = '30d', height = 270, compact = false, mode = 'profile', recharge, target, capacity }) {
  const data = useMemo(() => {
    const from = fromFor(range);
    return (history || []).filter(h => h.t >= from).map(h => ({ t: h.t, value: mode === 'root' ? h.mm : h.profile }));
  }, [history, range, mode]);
  const values = data.map(d => d.value).filter(Number.isFinite);
  const refs = [recharge, target, capacity].filter(Number.isFinite);
  const min = Math.min(...values, ...refs);
  const max = Math.max(...values, ...refs);
  const span = Number.isFinite(max - min) ? Math.max(max - min, 10) : 10;
  const domain = Number.isFinite(min) ? [Math.max(0, Math.floor(min - span * 0.12)), Math.ceil(max + span * 0.08)] : [0, 10];

  if (!data.length) return <EmptyChart message="Sin lecturas en este período" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={chartMargins(compact)}>
        <CartesianGrid stroke="#e5e9e5" vertical={!compact} />
        <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={fmtX} tick={{ fontSize: compact ? 9 : 11 }} stroke="#8a938d" minTickGap={28} />
        <YAxis domain={domain} width={compact ? 38 : 56} tick={{ fontSize: compact ? 9 : 11 }} stroke="#8a938d" unit=" mm" />
        {!compact && <Tooltip labelFormatter={fmtTip} formatter={v => [`${Number(v).toFixed(1)} mm`, mode === 'root' ? 'Agua útil' : 'Suma del perfil']} />}
        {Number.isFinite(recharge) && Number.isFinite(target) && <ReferenceArea y1={recharge} y2={target} fill="#7fcdb2" fillOpacity={0.17} strokeOpacity={0} />}
        {Number.isFinite(capacity) && <ReferenceLine y={capacity} stroke="#24a6d5" strokeDasharray="3 4" label={compact ? undefined : { value: 'Lleno', position: 'insideTopRight', fill: '#1683ad', fontSize: 10 }} />}
        {Number.isFinite(recharge) && <ReferenceLine y={recharge} stroke="#ed2f70" strokeDasharray="3 4" label={compact ? undefined : { value: 'Recarga', position: 'insideBottomRight', fill: '#c31b57', fontSize: 10 }} />}
        {Number.isFinite(target) && <ReferenceLine y={target} stroke="#438d62" strokeDasharray="5 4" label={compact ? undefined : { value: 'Objetivo', position: 'insideTopRight', fill: '#34704e', fontSize: 10 }} />}
        <Area dataKey="value" stroke="#151918" strokeWidth={compact ? 1.8 : 2.3} fill="#d9eee7" fillOpacity={0.55} dot={false} connectNulls isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function EmptyChart({ message }) {
  return (
    <div className="flex h-full min-h-[190px] items-center justify-center rounded-xl bg-slate-50/70 px-6 text-center">
      <div>
        <p className="text-sm font-bold text-charcoal">{message}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">El gráfico aparecerá automáticamente cuando Sentek entregue este tipo de medición.</p>
      </div>
    </div>
  );
}
