import { backend } from '@/api/backendClient';
import { runUsefulWaterScenario } from './engine/waterBalanceEngine';

// ============================================================
// irrigationRecommendationService — recomendación de riego V1
// (agua útil en mm).
//
//  · Detecta el PRIMER día del forecast donde
//    available_water_mm <= recharge_threshold_mm (umbral de
//    recarga = Target mín del perfil, en agua útil). El escenario YA
//    INCLUYE los riegos programados: la recomendación es el aporte
//    ADICIONAL sobre lo ya programado ese día.
//  · profile_recharge_needed_mm = target_water_mm − available_water_mm
//    del día del cruce: mm NETOS que el perfil necesita incorporar.
//  · recommended_irrigation_mm = necesarios / eficiencia de recarga
//    aprendida del suelo (ej. 16 mm netos con eficiencia 0.80 →
//    20 mm a aplicar). Volumen, horas, kWh y costo usan los mm
//    APLICADOS (brutos).
//  · Re-corre el balance con los mm netos de la recomendación
//    sumados a lo programado ese día → escenario CON riego.
// ============================================================
const round1 = n => Math.round(n * 10) / 10;

export const irrigationRecommendationService = {
  withRecommendation(config, lot, startMm, days, scenarioWithoutIrrigation, efficiency) {
    const threshold = config.recharge_threshold_mm;
    const target = config.target_water_mm;
    if (threshold == null || target == null) {
      return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };
    }
    // Primer cruce del umbral con necesidad REAL de riego. El punto del
    // día en el escenario NO incluye el riego programado de ese mismo
    // día (la curva sube al día siguiente del riego): si lo programado
    // ya cubre la recarga, ese cruce no genera recomendación y se sigue
    // con el próximo cruce real.
    let hit = null;
    let neededMm = 0;
    let discountNotes = [];
    for (const p of scenarioWithoutIrrigation || []) {
      if (p.available_water_mm > threshold) continue;
      const hitIdx = (days || []).findIndex(d => d.date === p.date);
      // REGLA X+1: el riego recomendado del día del cruce sube el punto
      // del día SIGUIENTE junto con el riego y la lluvia de ese mismo
      // día; el punto posterior suma además el riego programado y la
      // lluvia del día siguiente. Se descuentan TODOS para que la
      // curva NUNCA supere el Target máx — un programa del día
      // siguiente ya hace la recarga y no genera recomendación.
      const irrHit = round1((days || [])[hitIdx]?.irrigation_mm || 0);
      const irrNext = round1((days || [])[hitIdx + 1]?.irrigation_mm || 0);
      const rainHit = round1((days || [])[hitIdx]?.rainfall_mm ?? 0);
      const rainNext = round1((days || [])[hitIdx + 1]?.rainfall_mm ?? 0);
      const needed = round1(Math.max(0, target - p.available_water_mm - irrHit - irrNext - rainHit - rainNext));
      // Un faltante menor a medio mm es ruido de redondeo: el riego ya
      // programado cubre la recarga y ese cruce no genera recomendación.
      if (needed > 0.5) {
        hit = p;
        neededMm = needed;
        if (irrNext > 0) discountNotes.push(`${irrNext} mm de riego ya programados para el día siguiente`);
        if (rainHit > 0) discountNotes.push(`${rainHit} mm de lluvia prevista para el día del riego`);
        if (rainNext > 0) discountNotes.push(`${rainNext} mm de lluvia prevista para el día siguiente`);
        break;
      }
    }
    if (!hit) return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };

    // Riego a APLICAR = necesidad / eficiencia de recarga del suelo.
    // Redondeo hacia ABAJO: la recarga se detiene al llegar al
    // Target máx y NUNCA lo supera (el techo del balance es el
    // Target máx; el exceso drena).
    const eff = efficiency != null && efficiency > 0 ? efficiency : 1;
    const grossMm = Math.floor(neededMm / eff * 10) / 10;
    const volumeM3 = Math.round(grossMm * (lot.area_ha || 0) * 10); // 1 mm × 1 ha = 10 m³
    const recommendation = {
      lot_id: lot.id,
      profile_recharge_needed_mm: neededMm,
      recommended_irrigation_mm: grossMm,
      recommended_irrigation_m3: volumeM3,
      recommended_start_date: hit.date,
      days_to_threshold: hit.day,
      reason: `Sin riego adicional al ya programado, el agua útil del perfil alcanza el umbral de recarga (${threshold} mm) dentro de ${hit.day} día${hit.day > 1 ? 's' : ''}. El perfil necesita incorporar ${neededMm} mm para llegar al Target máx (${target} mm) y detenerse ahí — nunca se recomienda pasar ese límite${discountNotes.length ? `; se descuentan ${discountNotes.join(', ')}` : ''}; con la eficiencia de recarga aprendida del suelo (${Math.round(eff * 100)}%) eso exige aplicar ${grossMm} mm (además del riego ya programado ese día).`,
      status: 'activa',
    };
    // Escenario CON riego: los mm NETOS de la recomendación se suman
    // a lo ya programado ese día (grossMm × eff = neededMm).
    const scenarioWithIrrigation = runUsefulWaterScenario(startMm, config, days.map(d => (
      d.date === hit.date ? { ...d, irrigation_mm: round1((d.irrigation_mm || 0) + neededMm) } : d
    )));
    return { recommendation, scenarioWithIrrigation };
  },

  // Persistencia de una recomendación (registro histórico).
  // profile_recharge_needed_mm es un valor de cálculo de la UI: no
  // forma parte del registro persistido.
  async save(recommendation) {
    const { profile_recharge_needed_mm, ...persist } = recommendation;
    return backend.entities.IrrigationRecommendation.create({
      ...persist,
      created_at: new Date().toISOString(),
    });
  },
};