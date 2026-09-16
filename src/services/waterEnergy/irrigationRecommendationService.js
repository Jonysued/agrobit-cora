import { base44 } from '@/api/base44Client';
import { runScenario } from './engine/waterBalanceEngine';

// ============================================================
// irrigationRecommendationService — genera la recomendación de riego.
// Si el escenario SIN riego cae por debajo de target_min_vwc,
// recomienda regar el día del cruce hasta volver a la zona objetivo
// (target_max_vwc) y recalcula el escenario CON riego.
// ============================================================
const round1 = n => Math.round(n * 10) / 10;

export const irrigationRecommendationService = {
  withRecommendation(profile, lot, currentVwc, inputs, scenarioA) {
    const hit = scenarioA.find(p => p.vwc < profile.target_min_vwc);
    if (!hit) return { recommendation: null, scenarioB: scenarioA };
    const mm = round1((profile.target_max_vwc - hit.vwc) * profile.root_zone_depth_cm * 10);
    const volumeM3 = Math.round(mm * lot.area_ha * 10); // 1 mm × 1 ha = 10 m³
    const recommendation = {
      lot_id: lot.id,
      recommended_irrigation_mm: mm,
      recommended_irrigation_m3: volumeM3,
      recommended_start_date: hit.date,
      days_to_threshold: hit.day,
      reason: `Sin riego, el modelo estima que el lote alcanzará el umbral mínimo dentro de ${hit.day} día${hit.day > 1 ? 's' : ''}.`,
      status: 'activa',
    };
    const scenarioB = runScenario(profile, currentVwc, inputs.map(i => (
      i.date === hit.date ? { ...i, irrMm: mm } : i
    )));
    return { recommendation, scenarioB };
  },

  // Persistencia de una recomendación (registro histórico)
  async save(recommendation) {
    return base44.entities.IrrigationRecommendation.create({
      ...recommendation,
      created_at: new Date().toISOString(),
    });
  },
};