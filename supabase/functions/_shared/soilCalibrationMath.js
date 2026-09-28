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
export function probeProfileSnapshots(channels, readings) {
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
  const snapshots = [];
  for (const [ms, values] of byTime) {
    if (!depths.every(depth => values.has(depth))) continue;
    const day = dayKey(ms);
    const profile = round(depths.reduce((total, depth) => total + values.get(depth) * thickness.get(depth), 0), 1);
    snapshots.push({ day, time: ms, mm: profile });
  }
  return snapshots.sort((a, b) => a.time - b.time);
}

export function dailyProbeProfile(channels, readings) {
  const byDay = new Map();
  for (const snapshot of probeProfileSnapshots(channels, readings)) {
    byDay.set(snapshot.day, snapshot);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Toda transición entre perfiles completos participa. Las subidas revelan
// recargas observadas, y las bajadas muestran cómo evoluciona la extracción.
// Sin conocer la lámina aplicada en la sonda, solo se transfieren razones
// relativas a los lotes; nunca sus mm absolutos ni un Kc supuesto.
export function estimateProbeDynamics(days, weather, snapshots = []) {
  const valid = days.filter(d => Number.isFinite(d.mm)).sort((a, b) => a.day.localeCompare(b.day));
  const falls = [];
  const rises = [];
  const postRiseFalls = [];
  let stableDays = 0;
  let riseWithRain = 0;
  let riseWithoutObservedRain = 0;
  let riseWithoutWeather = 0;
  let previousDirection = null;
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1];
    const current = valid[i];
    if (nextDay(previous.day) !== current.day) { previousDirection = null; continue; }
    const change = round(current.mm - previous.mm, 1);
    if (change > 0) {
      rises.push(change);
      const rain = weather?.get(current.day)?.rain;
      const previousRain = weather?.get(previous.day)?.rain;
      if (rain > 0 || previousRain > 0) riseWithRain++;
      else if (rain == null || previousRain == null) riseWithoutWeather++;
      else riseWithoutObservedRain++;
      previousDirection = 'rise';
    } else if (change < 0) {
      const drop = -change;
      falls.push(drop);
      if (previousDirection === 'rise') postRiseFalls.push(drop);
      previousDirection = 'fall';
    } else {
      stableDays++;
      previousDirection = 'stable';
    }
  }
  const typicalFall = falls.length ? median(falls) : null;
  // El comportamiento reciente se compara contra el de ESA MISMA sonda.
  // El peso crece gradualmente; no existe una barrera arbitraria de 20 días.
  const recentFalls = falls.slice(-7);
  const trend = falls.length && recentFalls.length
    ? median(recentFalls) / typicalFall : null;
  const trendWeight = Math.min(1, falls.length / 10);
  const postRise = postRiseFalls.length && typicalFall
    ? median(postRiseFalls) / typicalFall : null;
  const postWeight = Math.min(1, postRiseFalls.length / 3);
  const clamp = ratio => round(Math.max(0.7, Math.min(1.15, ratio)), 2);
  // Una lectura de cierre puede esconder una recarga seguida de drenaje
  // durante ese mismo día. Comparar horas equivalentes separadas 24 h
  // permite aprender la bajada actual del perfil completo sin copiar
  // su humedad absoluta al lote. El historial diario entero sigue siendo
  // la referencia para la tasa habitual.
  const trailing = [];
  if (typicalFall && snapshots.length) {
    const ordered = [...snapshots].sort((a, b) => a.time - b.time);
    const latestByDay = new Map();
    for (const snapshot of ordered) latestByDay.set(snapshot.day, snapshot);
    for (const snapshot of latestByDay.values()) {
      const desired = snapshot.time - 86400000;
      let lo = 0, hi = ordered.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ordered[mid].time < desired) lo = mid + 1;
        else hi = mid;
      }
      const candidates = [ordered[lo - 1], ordered[lo]].filter(Boolean);
      const prior = candidates.reduce((best, item) =>
        !best || Math.abs(item.time - desired) < Math.abs(best.time - desired) ? item : best, null);
      if (prior && Math.abs(prior.time - desired) > 3600000) continue;
      if (!prior) continue;
      const fall = round(prior.mm - snapshot.mm, 1);
      trailing.push({ day: snapshot.day, fall_mm: fall, factor: fall > 0
        ? round(Math.max(0.7, Math.min(3, fall / typicalFall)), 2) : 1 });
    }
  }
  const latest = trailing.at(-1);
  return {
    profile_days: valid.length,
    depletion_sample_count: falls.length,
    recharge_sample_count: rises.length,
    stable_day_count: stableDays,
    rise_with_garita_rain: riseWithRain,
    rise_without_observed_rain: riseWithoutObservedRain,
    rise_without_weather: riseWithoutWeather,
    depletion_rate_mm_day: typicalFall == null ? null : round(typicalFall, 1),
    rise_rate_mm_day: rises.length ? round(median(rises), 1) : null,
    trend_factor: Number.isFinite(trend) ? clamp(1 + (trend - 1) * trendWeight) : null,
    post_rise_factor: Number.isFinite(postRise) ? clamp(1 + (postRise - 1) * postWeight) : null,
    recent_24h_fall_mm: latest?.fall_mm ?? null,
    recent_24h_factor: latest?.factor ?? null,
    daily_drydown_factors: trailing,
  };
}
