// Transferencia causal: nunca aprende con lecturas posteriores al día calculado.
const DAY = 86400000;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round = n => Math.round(n * 10) / 10;

export function estimateTransferDynamics(days, snapshots = [], weather = new Map()) {
  const ordered = [...snapshots].sort((a, b) => a.time - b.time);
  const rechargeDays = new Set();
  // Detectar recargas aunque el cierre diario oculte una subida intradiaria.
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].time - ordered[i - 1].time <= 6 * 3600000
        && ordered[i].mm - ordered[i - 1].mm > 0.5) rechargeDays.add(ordered[i].day);
  }
  const valid = days.filter(d => Number.isFinite(d.mm)).sort((a, b) => a.day.localeCompare(b.day));
  const clean = [];
  const daily = [];
  let quarantine = false, sinceRise = 0, settled = 0;
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1], current = valid[i];
    const gap = (Date.parse(current.day) - Date.parse(previous.day)) / DAY;
    const fall = round(previous.mm - current.mm);
    const rise = fall < -0.5 || rechargeDays.has(current.day);
    if (gap !== 1) { quarantine = true; sinceRise = 0; settled = 0; }
    if (rise) { quarantine = true; sinceRise = 0; settled = 0; }
    const recent = clean.slice(-7);
    const baseline = median(recent.map(d => d.loss_mm));
    const ratePerEto = median(recent.filter(d => d.eto > 0).map(d => d.loss_mm / d.eto));
    const eto = weather.get(current.day)?.eto;
    let reason = gap !== 1 ? 'missing_readings' : rise ? 'probe_recharge' : null;
    if (quarantine && !rise && gap === 1) {
      sinceRise++;
      // Dos días de exclusión como mínimo; después, dos caídas consecutivas
      // compatibles con el secado previo. Sin referencia, no inventar secado.
      const compatible = baseline != null && fall >= -0.5
        && fall <= Math.max(0.5, baseline * 1.5);
      settled = compatible ? settled + 1 : 0;
      if (sinceRise >= 2 && settled >= 2) quarantine = false;
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
  const recent = clean.slice(-7);
  return { version: 1, daily, clean_sample_count: clean.length,
    recent_loss_mm_day: median(recent.map(d => d.loss_mm)),
    loss_per_eto: median(recent.filter(d => d.eto > 0).map(d => d.loss_mm / d.eto)),
    last_clean_day: clean.at(-1)?.day ?? null,
    excluded_days: daily.filter(d => d.excluded_reason).length,
    daily_profile: valid.map(d => ({ day: d.day, mm: d.mm })),
  };
}
