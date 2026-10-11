// Transferencia causal: nunca aprende con lecturas posteriores al día calculado.
const DAY = 86400000;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = n => Math.round(n * 10) / 10;
const localDay = time => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(time));

// El último dato de hoy sigue visible en el gráfico, pero no representa
// una jornada completa de secado. Tampoco usar cierres interrumpidos.
export function closedProbeDays(days, asOf = Date.now()) {
  const today = localDay(asOf);
  return days.filter(d => Number.isFinite(d.mm) && d.day < today
    && (d.time == null || (Number.isFinite(d.time)
      && d.time >= Date.parse(`${d.day}T21:00:00-03:00`)
      && d.time < Date.parse(`${d.day}T23:59:59.999-03:00`))))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function estimateTransferDynamics(days, snapshots = [], weather = new Map(), { asOf = Date.now() } = {}) {
  const ordered = [...snapshots].sort((a, b) => a.time - b.time);
  const rechargeDays = new Set();
  // Detectar recargas aunque el cierre diario oculte una subida intradiaria.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].time - ordered[i - 1].time <= 6 * 3600000
        && ordered[i].mm - ordered[i - 1].mm > 0.5) rechargeDays.add(ordered[i].day);
  }
  const valid = closedProbeDays(days, asOf);
  const clean = [];
  const daily = [];
  let quarantine = false, sinceRise = 0, settled = 0;
  let settlingFalls = [];
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1], current = valid[i];
    const elapsed = current.time != null && previous.time != null ? current.time - previous.time : DAY;
    const gap = elapsed >= 21 * 3600000 && elapsed <= 27 * 3600000
      ? (Date.parse(current.day) - Date.parse(previous.day)) / DAY : 0;
    const fall = round(previous.mm - current.mm);
    const rise = fall < -0.5 || rechargeDays.has(current.day);
    if (gap !== 1) { quarantine = true; sinceRise = 0; settled = 0; settlingFalls = []; }
    if (rise) { quarantine = true; sinceRise = 0; settled = 0; settlingFalls = []; }
    // Una referencia antigua (incluido un secado cero) no debe bloquear
    // para siempre el aprendizaje de un nuevo ciclo.
    const recent = clean.filter(d => (Date.parse(current.day) - Date.parse(d.day)) / DAY <= 14).slice(-7);
    const baseline = median(recent.map(d => d.loss_mm));
    const ratePerEto = median(recent.filter(d => d.eto > 0).map(d => d.loss_mm / d.eto));
    const eto = weather.get(current.day)?.eto;
    let reason = gap !== 1 ? 'missing_readings' : rise ? 'probe_recharge' : null;
    if (quarantine && !rise && gap === 1) {
      sinceRise++;
      // Dos días de exclusión como mínimo; después, dos caídas consecutivas
      // compatibles con el secado previo. Si el historial inicia húmedo,
      // exigir cuatro jornadas cerradas sin recarga. La estabilización
      // compara las dos últimas pérdidas por ET0 (si ambas tienen clima),
      // para no confundir un cambio de demanda con drenaje persistente.
      // Es un filtro heurístico; no constituye una medición de drenaje.
      settlingFalls.push({ fall: Math.max(0, fall), eto });
      const window = settlingFalls.slice(-2);
      const normalized = window.every(d => d.eto > 0);
      const losses = window.map(d => normalized ? d.fall / d.eto : d.fall);
      const bootstrap = baseline == null && sinceRise >= 4 && window.length === 2
        && fall >= -0.5 && Math.max(...losses) <= Math.max(normalized ? 0.15 : 0.5, Math.min(...losses) * 2);
      const expected = ratePerEto != null && eto > 0 ? ratePerEto * eto : baseline;
      const compatible = baseline != null && fall >= -0.5
        && fall <= Math.max(0.5, expected * 1.5);
      settled = compatible ? settled + 1 : 0;
      if (bootstrap || (sinceRise >= 2 && settled >= 2)) quarantine = false;
      else reason = 'post_recharge_drainage';
    }
    let loss = null;
    if (!reason && !quarantine) {
      loss = Math.max(0, fall);
      clean.push({ day: current.day, loss_mm: loss, eto: eto ?? null });
    } else if (baseline != null) {
      loss = eto != null && ratePerEto != null ? ratePerEto * eto : baseline;
    }
    daily.push({ day: current.day, observed_fall_mm: fall, loss_mm: loss == null ? null : round(loss),
      source: reason ? 'estimated' : 'observed', excluded_reason: reason });
  }
  const lastCompletedDay = valid.at(-1)?.day;
  const recent = clean.filter(d => (Date.parse(lastCompletedDay) - Date.parse(d.day)) / DAY <= 14).slice(-7);
  return { version: 1, daily, clean_sample_count: clean.length,
    recent_clean_sample_count: recent.length,
    recent_loss_mm_day: median(recent.map(d => d.loss_mm)),
    loss_per_eto: median(recent.filter(d => d.eto > 0).map(d => d.loss_mm / d.eto)),
    last_clean_day: clean.at(-1)?.day ?? null,
    excluded_days: daily.filter(d => d.excluded_reason).length,
    daily_profile: days.filter(d => Number.isFinite(d.mm)).sort((a, b) => a.day.localeCompare(b.day))
      .map(d => ({ day: d.day, mm: d.mm })),
    last_completed_day: valid.at(-1)?.day ?? null,
    incomplete_days: days.filter(d => Number.isFinite(d.mm)).length - valid.length,
  };
}
