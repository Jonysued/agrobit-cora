// La sonda aporta la forma relativa de secado, no el contenido de agua
// absoluto ni el Kc de un cultivo ajeno al lote.
export function drydownFactor(model, availableMm, capacityMm) {
  const learned = model?.calibration_diagnostics;
  const factor = Number(learned?.relative_drydown_factor);
  if (learned?.method !== 'probe_history_relative_drydown'
    || !(learned?.depletion_sample_count >= 20)
    || !Number.isFinite(factor) || factor < 0.7 || factor > 1.15
    || !(capacityMm > 0) || !Number.isFinite(availableMm)) return 1;
  const fraction = Math.max(0, Math.min(1, availableMm / capacityMm));
  // Por encima de 60% de agua útil, ETc = ET0 × Kc del lote.
  // A menor agua útil, modular gradualmente según el historial.
  const weight = Math.max(0, Math.min(1, (0.6 - fraction) / 0.3));
  return 1 + (factor - 1) * weight;
}
