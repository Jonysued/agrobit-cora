// Parámetros relativos de la sonda vinculada. No se copia su humedad
// ni se sustituye ET0 × Kc propio del lote por una tasa absoluta.
function learned(model) {
  const data = model?.calibration_diagnostics;
  return data?.method === 'probe_history_rise_and_fall' ? data : null;
}

export function drydownFactor(model) {
  const data = learned(model);
  const value = data?.trend_factor;
  return data?.depletion_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}

export function afterRiseFactor(model) {
  const data = learned(model);
  const value = data?.post_rise_factor;
  return data?.recharge_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}
