// Parámetros relativos de la sonda vinculada. No se copia su humedad
// ni se sustituye ET0 × Kc propio del lote por una tasa absoluta.
function learned(model) {
  const data = model?.calibration_diagnostics;
  return data?.method === 'probe_history_rise_and_fall' ? data : null;
}

export function drydownFactor(model, date = null) {
  const data = learned(model);
  if (date && Array.isArray(data?.daily_drydown_factors)) {
    const daily = data.daily_drydown_factors.find(d => d.day === date);
    if (daily && Number.isFinite(daily.factor) && daily.factor >= 0.7 && daily.factor <= 3) return daily.factor;
  }
  if (!date && data?.depletion_sample_count > 0 && Number.isFinite(data?.recent_24h_factor)
      && data.recent_24h_factor >= 0.7 && data.recent_24h_factor <= 3) return data.recent_24h_factor;
  const value = data?.trend_factor;
  return data?.depletion_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}

export function forecastDrydownFactor(model, dayIndex) {
  const baseline = learned(model)?.trend_factor ?? 1;
  const current = drydownFactor(model);
  // Una bajada intensa tras una recarga reciente no se extrapola
  // durante los quince días: vuelve gradualmente a la tendencia larga.
  return Math.round((baseline + (current - baseline) * Math.max(0, 1 - dayIndex / 5)) * 100) / 100;
}

export function afterRiseFactor(model) {
  const data = learned(model);
  const value = data?.post_rise_factor;
  return data?.recharge_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}
