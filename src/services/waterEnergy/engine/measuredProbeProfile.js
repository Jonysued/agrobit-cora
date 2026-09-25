// Suma medida del perfil de una sonda, independiente del lote y sus umbrales.
export function measuredProbeProfile(channels, readings) {
  const moisture = channels.filter(c => c.sensor_type === 'soil_moisture');
  const depths = [...new Set(moisture.map(c => c.depth_cm))].sort((a, b) => a - b);
  const segments = depths.map((depth, i) => {
    const top = i === 0 ? 0 : (depths[i - 1] + depth) / 2;
    const bottom = i < depths.length - 1 ? (depth + depths[i + 1]) / 2 : depth + (depth - top);
    return { depth, thicknessMm: (bottom - top) * 10 };
  });
  const depthByChannel = new Map(moisture.map(c => [c.id, c.depth_cm]));
  const byTime = new Map();
  for (const reading of readings) {
    const depth = depthByChannel.get(reading.probe_channel_id);
    const time = new Date(reading.timestamp).getTime();
    if (depth == null || !Number.isFinite(time) || !Number.isFinite(reading.value)) continue;
    if (!byTime.has(time)) byTime.set(time, new Map());
    byTime.get(time).set(depth, reading.value / 100);
  }
  const history = [...byTime.entries()].filter(([, values]) => depths.every(d => values.has(d)))
    .map(([t, values]) => ({
      t,
      profile: Math.round(segments.reduce((sum, seg) => sum + values.get(seg.depth) * seg.thicknessMm, 0) * 10) / 10,
      mm: null,
    })).sort((a, b) => a.t - b.t);
  return { history, measuredDepth: segments.length ? segments.reduce((sum, seg) => sum + seg.thicknessMm, 0) / 10 : null };
}
