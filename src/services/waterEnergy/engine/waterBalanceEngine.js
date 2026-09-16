// ============================================================
// WATER BALANCE ENGINE V0 — EXPERIMENTAL
// Modelo simple de balance hídrico en la zona radicular.
// Puro: sin Base44, sin UI, sin AI — solo matemática.
// Balance diario: agua mañana = agua hoy + lluvia efectiva
//                 + riego − ETc − drenaje
// Trabajo interno en milímetros de agua sobre la zona radicular:
//   mm = vwc (cm³/cm³) × profundidad (cm) × 10
// La humedad proyectada nunca supera capacidad de campo (el
// exceso se informa como drenaje) y nunca cae por debajo del
// punto de marchitez (se marca belowWilting como advertencia).
// ============================================================

export const mmOfVwc = (vwc, depthCm) => vwc * depthCm * 10;
export const vwcOfMm = (mm, depthCm) => mm / (depthCm * 10);

// Un día de balance
export function stepDay(profile, vwc, { etcMm = 0, rainMm = 0, irrMm = 0 } = {}) {
  const depth = profile.root_zone_depth_cm;
  let mm = mmOfVwc(vwc, depth) + rainMm + irrMm - etcMm;
  const fcMm = mmOfVwc(profile.field_capacity_vwc, depth);
  const wpMm = mmOfVwc(profile.wilting_point_vwc, depth);
  let drainageMm = 0;
  let belowWilting = false;
  if (mm > fcMm) { drainageMm = mm - fcMm; mm = fcMm; }
  if (mm < wpMm) { belowWilting = true; mm = wpMm; }
  return { vwc: vwcOfMm(mm, depth), drainageMm, belowWilting };
}

// Agua disponible como % entre marchitez y capacidad de campo
export function waterAvailablePercent(profile, vwc) {
  const { field_capacity_vwc: fc, wilting_point_vwc: wp } = profile;
  return Math.max(0, Math.min(100, ((vwc - wp) / (fc - wp)) * 100));
}

// Escenario de N días. dailyInputs: [{date, etcMm, rainMm, irrMm}]
export function runScenario(profile, startVwc, dailyInputs) {
  let vwc = startVwc;
  const points = [];
  dailyInputs.forEach((d, idx) => {
    const r = stepDay(profile, vwc, d);
    points.push({
      day: idx + 1,
      date: d.date,
      vwc: r.vwc,
      drainageMm: r.drainageMm,
      belowWilting: r.belowWilting,
      etcMm: d.etcMm || 0,
      rainMm: d.rainMm || 0,
      irrigationMm: d.irrMm || 0,
      waterAvailablePercent: Math.round(waterAvailablePercent(profile, r.vwc)),
    });
    vwc = r.vwc;
  });
  return points;
}

// Semáforo: rojo bajo el umbral, amarillo acercándose, verde normal
export function statusForVwc(profile, vwc) {
  if (vwc < profile.target_min_vwc) return 'rojo';
  const band = (profile.target_max_vwc - profile.target_min_vwc) * 0.25;
  if (vwc < profile.target_min_vwc + band) return 'amarillo';
  return 'verde';
}