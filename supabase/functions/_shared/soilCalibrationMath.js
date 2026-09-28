// Cálculos puros compartidos por la calibración programada y sus pruebas.
const dayKey = timestamp => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(timestamp));
const nextDay = day => new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
const round = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Exactamente el mismo límite entre profundidades que usa
// measuredProbeProfile: cada sensor representa hasta los puntos medios.
export function dailyProbeProfile(channels, readings) {
  const depths = [...new Set(channels.filter(c => c.sensor_type === 'soil_moisture')
    .map(c => Number(c.depth_cm)).filter(Number.isFinite))].sort((a, b) => a - b);
  if (depths.length < 2) return [];
  const channelDepth = new Map(channels.filter(c => c.sensor_type === 'soil_moisture')
    .map(c => [c.id, Number(c.depth_cm)]));
  const thickness = new Map(depths.map((depth, i) => {
    const top = i === 0 ? 0 : (depths[i - 1] + depth) / 2;
    const bottom = i < depths.length - 1 ? (depth + depths[i + 1]) / 2 : depth + (depth - top);
    return [depth, (bottom - top) * 10];
  }));
  const byTime = new Map();
  for (const reading of readings) {
    const depth = channelDepth.get(reading.probe_channel_id);
    const value = Number(reading.value);
    const ms = Date.parse(reading.timestamp);
    if (depth == null || !Number.isFinite(ms) || !Number.isFinite(value) || value < 0 || value > 100) continue;
    if (!byTime.has(ms)) byTime.set(ms, new Map());
    byTime.get(ms).set(depth, value / 100);
  }
  const byDay = new Map();
  for (const [ms, values] of byTime) {
    if (!depths.every(depth => values.has(depth))) continue;
    const day = dayKey(ms);
    const profile = round(depths.reduce((total, depth) => total + values.get(depth) * thickness.get(depth), 0), 1);
    if (!byDay.has(day) || ms > byDay.get(day).time) byDay.set(day, { day, time: ms, mm: profile });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// La respuesta RELATIVA de un perfil húmedo frente a uno seco puede
// transferirse a lotes vinculados sin conocer la ubicación física ni el
// cultivo de la sonda. La tasa absoluta NO sustituye a ET0 × Kc del lote.
export function estimateProbeDynamics(days, weather) {
  const increases = new Set();
  const valid = days.filter(d => Number.isFinite(d.mm));
  const sorted = [...valid].sort((a, b) => a.mm - b.mm);
  const lowBoundary = sorted[Math.floor(sorted.length * 0.3)]?.mm;
  const highBoundary = sorted[Math.floor(sorted.length * 0.7)]?.mm;
  const low = [];
  const high = [];
  const drops = [];
  for (let i = 1; i < valid.length; i++) {
    if (nextDay(valid[i - 1].day) !== valid[i].day) continue;
    if (valid[i].mm - valid[i - 1].mm > 1) increases.add(valid[i].day);
  }
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1];
    const current = valid[i];
    if (nextDay(previous.day) !== current.day || increases.has(previous.day) || increases.has(current.day)) continue;
    // Si no hay observación de Garita, el día no se considera limpio:
    // podría haber llovido o la ET0 no ser comparable.
    const today = weather.get(current.day);
    const yesterday = weather.get(previous.day);
    if (!today || !yesterday || today.rain > 0 || yesterday.rain > 0 || !(today.eto > 0)) continue;
    const drop = previous.mm - current.mm;
    if (!(drop > 0 && drop < 10)) continue;
    drops.push(drop);
    const normalized = drop / today.eto;
    if (previous.mm <= lowBoundary) low.push(normalized);
    if (previous.mm >= highBoundary) high.push(normalized);
  }
  const enough = low.length >= 5 && high.length >= 5 && drops.length >= 20 && highBoundary > lowBoundary;
  const relative = enough ? median(low) / median(high) : null;
  return {
    profile_days: valid.length,
    depletion_sample_count: drops.length,
    low_storage_samples: low.length,
    high_storage_samples: high.length,
    depletion_rate_mm_day: drops.length >= 5 ? round(median(drops), 1) : null,
    // Acotado: jamás reemplaza el Kc ni la ET0 de cada lote.
    relative_drydown_factor: Number.isFinite(relative)
      ? round(Math.max(0.7, Math.min(1.15, relative)), 2) : null,
  };
}
