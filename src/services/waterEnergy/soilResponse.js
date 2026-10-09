export function drydownFactor() { return 1; }

// Secado observado o estimado, sin recargas ni drenaje de la sonda.
export function probeProfileLoss(model, { date = null, eto, forecastFactor = null, meanEto = null, lotTaw = null }) {
  const data = model?.calibration_diagnostics?.transfer_dynamics;
  if (!data || data.version !== 1) return null;
  const sourceTaw = model.calibration_diagnostics.reference_taw_mm;
  const scale = lotTaw > 0 && sourceTaw > 0 ? lotTaw / sourceTaw : 1;
  let loss;
  if (date && forecastFactor == null) {
    loss = data.daily?.find(d => d.day === date)?.loss_mm;
  } else {
    const lastDay = data.last_clean_day;
    const asOf = date || model.calibration_diagnostics.last_probe_day;
    const age = lastDay && asOf ? (Date.parse(asOf) - Date.parse(lastDay)) / 86400000 : Infinity;
    if (age > 14 || age < 0) return null;
    loss = data.loss_per_eto != null && Number.isFinite(eto)
      ? data.loss_per_eto * eto
      : data.recent_loss_mm_day == null ? null : data.recent_loss_mm_day * (meanEto > 0 ? eto / meanEto : 1);
  }
  return loss == null || !Number.isFinite(loss) ? null : Math.round(Math.max(0, loss * scale) * 10) / 10;
}

// Las recargas propias suman agua; no reinician el drenaje de otra parcela.
export function forecastDrydownFactor() { return 1; }
export function afterRiseFactor() { return 1; }
