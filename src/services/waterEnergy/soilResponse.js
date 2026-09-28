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

export function forecastDrydownFactor(model, dayIndex, rechargeAt = null) {
  const data = learned(model);
  const baseline = drydownFactor(model, 'outside-observed-history');
  const cycle = data?.drydown_cycle;
  const currentPhase = Number(data?.current_drydown_phase) || 0;
  const phase = rechargeAt != null && dayIndex >= rechargeAt
    ? dayIndex - rechargeAt + 1 : currentPhase + dayIndex + 1;
  const learnedPhase = cycle?.find(entry => entry.day === phase && entry.samples >= 2);
  if (learnedPhase && Number.isFinite(learnedPhase.factor)) return learnedPhase.factor;
  // Sin suficientes ciclos para esta fase se usa la tendencia de ESA
  // sonda, en vez de imponer una vuelta lineal arbitraria en cinco días.
  return baseline;
}

export function afterRiseFactor(model) {
  const data = learned(model);
  if (data?.drydown_cycle?.some(entry => entry.day === 1 && entry.samples >= 2)) return 1;
  const value = data?.post_rise_factor;
  return data?.recharge_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}
