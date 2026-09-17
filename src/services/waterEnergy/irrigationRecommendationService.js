import { base44 } from '@/api/base44Client';
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
    const hit = (scenarioWithoutIrrigation || []).find(p => p.available_water_mm <= threshold);
    if (!hit) return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };

    // Necesidad NETA del perfil (el cruce ya incluye el riego
    // programado de ese día: solo falta la diferencia al objetivo).
    const neededMm = round1(Math.max(0, target - hit.available_water_mm));
    if (neededMm <= 0) return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };

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
      reason: `Sin riego adicional al ya programado, el agua útil del perfil alcanza el umbral de recarga (${threshold} mm) dentro de ${hit.day} día${hit.day > 1 ? 's' : ''}. El perfil necesita incorporar ${neededMm} mm para llegar al Target máx (${target} mm) y detenerse ahí — nunca se recomienda pasar ese límite; con la eficiencia de recarga aprendida del suelo (${Math.round(eff * 100)}%) eso exige aplicar ${grossMm} mm (el riego ya programado ese día ya está incluido en el escenario).`,
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
    return base44.entities.IrrigationRecommendation.create({
      ...persist,
      created_at: new Date().toISOString(),
    });
  },
};