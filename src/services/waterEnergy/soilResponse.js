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

export function forecastDrydownFactor(model, dayIndex, rechargeAt = null, asOfDay = null) {
  const data = learned(model);
  const baseline = drydownFactor(model, 'outside-observed-history');
  const cycle = data?.drydown_cycle;
  const currentPhase = Number(data?.current_drydown_phase) || 0;
  const phase = rechargeAt != null && dayIndex >= rechargeAt
    ? dayIndex - rechargeAt + 1 : currentPhase + dayIndex + 1;
  const learnedPhase = cycle?.find(entry => entry.day === phase && entry.samples > 0);
  const sameCycle = rechargeAt == null && currentPhase > 0 && asOfDay === data?.last_probe_day;
  const current = cycle?.find(entry => entry.day === currentPhase && entry.samples > 0);
  const recent = data?.recent_24h_factor;
  if (learnedPhase && Number.isFinite(learnedPhase.factor)) {
    // Una sola repetición también aporta información, con menos peso
    // que una fase observada en varios ciclos de la misma sonda.
    const typical = learnedPhase.samples >= 2 ? learnedPhase.factor
      : (learnedPhase.factor + baseline) / 2;
    // La mediana describe la forma del ciclo, pero el episodio actual
    // puede ser mucho más intenso. Continuar su amplitud durante ese
    // mismo ciclo evita un salto artificial al comenzar el pronóstico.
    // Una recarga propia del lote inicia un ciclo nuevo de amplitud típica.
    if (sameCycle && current && Number.isFinite(recent) && current.factor > 0) {
      const intensity = Math.max(0.7, Math.min(2, recent / current.factor));
      return Math.round(Math.max(0.7, Math.min(3, typical * intensity)) * 100) / 100;
    }
    return Math.round(typical * 100) / 100;
  }
  // Sin observaciones para esta fase se usa la tendencia de ESA
  // sonda. Si el episodio actual sigue activo, su efecto se atenúa
  // gradualmente hasta que haya una fase histórica o una recarga.
  if (sameCycle && Number.isFinite(recent)) {
    return Math.round(Math.max(0.7, Math.min(3,
      baseline + (recent - baseline) * (0.65 ** (dayIndex + 1)))) * 100) / 100;
  }
  return baseline;
}

export function afterRiseFactor(model) {
  const data = learned(model);
  if (data?.drydown_cycle?.some(entry => entry.day === 1 && entry.samples >= 2)) return 1;
  const value = data?.post_rise_factor;
  return data?.recharge_sample_count > 0 && Number.isFinite(value)
    && value >= 0.7 && value <= 1.15 ? value : 1;
}
