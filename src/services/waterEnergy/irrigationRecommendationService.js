import { base44 } from '@/api/base44Client';
import { runUsefulWaterScenario } from './engine/waterBalanceEngine';

// ============================================================
// irrigationRecommendationService — recomendación de riego V1
// (agua útil en mm).
//
//  · Detecta el PRIMER día del forecast donde
//    available_water_mm <= recharge_threshold_mm (umbral de
//    recarga, derivado del MAD — nunca target_min_vwc).
//  · Lámina recomendada = target_water_mm − available_water_mm
//    del día del cruce (nunca target_max_vwc, nunca negativa).
//  · Re-corre el balance con el riego aplicado ese día para
//    construir el escenario CON riego.
// ============================================================
const round1 = n => Math.round(n * 10) / 10;

export const irrigationRecommendationService = {
  withRecommendation(config, lot, startMm, days, scenarioWithoutIrrigation) {
    const threshold = config.recharge_threshold_mm;
    const target = config.target_water_mm;
    if (threshold == null || target == null) {
      return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };
    }
    const hit = (scenarioWithoutIrrigation || []).find(p => p.available_water_mm <= threshold);
    if (!hit) return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };

    const mm = round1(Math.max(0, target - hit.available_water_mm));
    if (mm <= 0) return { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };

    const volumeM3 = Math.round(mm * (lot.area_ha || 0) * 10); // 1 mm × 1 ha = 10 m³
    const recommendation = {
      lot_id: lot.id,
      recommended_irrigation_mm: mm,
      recommended_irrigation_m3: volumeM3,
      recommended_start_date: hit.date,
      days_to_threshold: hit.day,
      reason: `Sin riego, el agua útil del perfil alcanza el umbral de recarga (${threshold} mm) dentro de ${hit.day} día${hit.day > 1 ? 's' : ''}. Se recomienda regar para recuperar hasta el objetivo de recarga (${target} mm).`,
      status: 'activa',
    };
    const scenarioWithIrrigation = runUsefulWaterScenario(startMm, config, days.map(d => (
      d.date === hit.date ? { ...d, irrigation_mm: mm } : d
    )));
    return { recommendation, scenarioWithIrrigation };
  },

  // Persistencia de una recomendación (registro histórico)
  async save(recommendation) {
    return base44.entities.IrrigationRecommendation.create({
      ...recommendation,
      created_at: new Date().toISOString(),
    });
  },
};