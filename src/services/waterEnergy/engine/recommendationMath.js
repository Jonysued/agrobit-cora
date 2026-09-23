const round1 = n => Math.round(n * 10) / 10;

// Lámina NETA necesaria en el día del cruce para que el punto X+1
// alcance el objetivo. Solo las entradas del día X llegan a X+1.
export function netIrrigationNeeded(targetMm, availableAtHitMm, hitDay, nextDay) {
  const scheduledNetMm = round1(hitDay?.irrigation_mm || 0);
  const effectiveRainMm = round1(hitDay?.effective_rainfall_mm ?? hitDay?.rainfall_mm ?? 0);
  const nextEtcMm = nextDay
    ? round1((nextDay.etc_mm ?? ((nextDay.eto_mm || 0) * (nextDay.kc || 0))) * (nextDay.etc_correction_factor ?? 1))
    : 0;
  return round1(Math.max(0, targetMm - availableAtHitMm - scheduledNetMm - effectiveRainMm + nextEtcMm));
}
