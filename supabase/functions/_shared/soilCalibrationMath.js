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

export function estimateCalibration(days, weather, irrigation, kcForDay) {
  const byDay = new Map(days.map(row => [row.day, row.mm]));
  const eventDays = new Set([...irrigation].filter(([, mm]) => mm > 0).map(([day]) => day));
  for (const [day, item] of weather) if (item.rain > 0) eventDays.add(day);
  const recharge = [];
  for (const [day, applied] of irrigation) {
    if (!(applied > 0) || !byDay.has(day) || (weather.get(day)?.rain || 0) > 0) continue;
    const previous = days.find(row => nextDay(row.day) === day);
    if (!previous) continue;
    const following = [day, nextDay(day), nextDay(nextDay(day))];
    if (following.slice(1).some(d => eventDays.has(d))) continue;
    const after = following.map(d => byDay.get(d)).filter(v => v != null);
    if (!after.length) continue;
    const rise = Math.max(...after) - previous.mm;
    if (rise > 0 && rise <= applied * 1.15) recharge.push(Math.min(1, rise / applied));
  }
  const depletion = [];
  const factors = [];
  for (let i = 1; i < days.length; i++) {
    const previous = days[i - 1].day;
    const day = days[i].day;
    if (nextDay(previous) !== day || eventDays.has(previous) || eventDays.has(day)) continue;
    const drop = days[i - 1].mm - days[i].mm;
    if (!(drop > 0 && drop < 10)) continue;
    depletion.push(drop);
    const eto = weather.get(day)?.eto;
    const kc = kcForDay?.(day);
    const ratio = eto > 0 && kc > 0 ? drop / (eto * kc) : null;
    if (ratio != null && ratio >= 0.3 && ratio <= 2) factors.push(ratio);
  }
  return {
    profile_days: days.length,
    recharge_sample_count: recharge.length,
    depletion_sample_count: depletion.length,
    etc_sample_count: factors.length,
    recharge_efficiency: recharge.length >= 3 ? round(median(recharge), 2) : null,
    depletion_rate_mm_day: depletion.length >= 5 ? round(median(depletion), 1) : null,
    etc_correction_factor: factors.length >= 5 ? round(Math.max(0.5, Math.min(1.5, median(factors))), 2) : null,
  };
}
