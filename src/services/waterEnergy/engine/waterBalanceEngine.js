// ============================================================
// WATER BALANCE ENGINE V1 — EXPERIMENTAL (AGUA ÚTIL EN MM)
// Modelo de balance hídrico de la zona radicular expresado en
// milímetros de AGUA ÚTIL (por encima del punto de marchitez).
// Puro: sin Base44, sin UI — solo matemática.
//
// Balance diario:
//   available_water_next_mm =
//     available_water_mm + effective_rainfall_mm + irrigation_mm − ETc
//   ETc = ET0 × Kc
//
// Límites:
//  · El agua útil nunca supera la capacidad útil total (TAW):
//    el exceso se informa como drainage_mm.
//  · El agua útil nunca cae por debajo de 0:
//    se marca below_wilting = true.
//
// Las decisiones se basan SOLO en:
//  · recharge_threshold_mm (umbral de recarga, derivado del MAD)
//  · target_water_mm (objetivo de recarga)
//  · total_available_water_capacity_mm (TAW)
// Nunca en VWC promedio, target_min_vwc ni target_max_vwc.
// ============================================================
const round1 = n => Math.round(n * 10) / 10;

// Un día de balance sobre la zona radicular
export function stepUsefulWaterDay(availableMm, config, day) {
  const kc = day.kc != null ? day.kc : 0;
  const etcMm = round1((day.eto_mm || 0) * kc);
  const rainMm = day.effective_rainfall_mm ?? day.rainfall_mm ?? 0;
  const irrMm = day.irrigation_mm || 0;
  let next = availableMm + rainMm + irrMm - etcMm;
  let drainageMm = 0;
  const taw = config.total_available_water_capacity_mm;
  if (taw != null && next > taw) {
    drainageMm = round1(next - taw);
    next = taw;
  }
  let belowWilting = false;
  if (next < 0) {
    next = 0;
    belowWilting = true;
  }
  return { availableMm: round1(next), drainageMm, belowWilting, etcMm };
}

// Escenario de N días en mm de agua útil.
// config: { total_available_water_capacity_mm, recharge_threshold_mm, target_water_mm }
// days:   [{ date, eto_mm, kc, rainfall_mm, effective_rainfall_mm, irrigation_mm }]
export function runUsefulWaterScenario(startMm, config, days) {
  let available = startMm;
  const taw = config.total_available_water_capacity_mm;
  return (days || []).map((d, idx) => {
    const r = stepUsefulWaterDay(available, config, d);
    available = r.availableMm;
    return {
      day: idx + 1,
      date: d.date,
      available_water_mm: r.availableMm,
      available_water_percent: taw > 0 ? round1((r.availableMm / taw) * 100) : null,
      eto_mm: round1(d.eto_mm || 0),
      kc: d.kc != null ? d.kc : null,
      etc_mm: r.etcMm,
      rainfall_mm: round1(d.rainfall_mm ?? 0),
      effective_rainfall_mm: round1(d.effective_rainfall_mm ?? 0),
      irrigation_mm: round1(d.irrigation_mm || 0),
      drainage_mm: r.drainageMm,
      below_wilting: r.belowWilting,
      below_recharge_threshold: config.recharge_threshold_mm != null
        ? r.availableMm <= config.recharge_threshold_mm
        : null,
    };
  });
}