import { base44 } from '@/api/base44Client';
import { weatherService } from './weatherService';
import { energyService } from './energyService';
import { irrigationRecommendationService } from './irrigationRecommendationService';
import { soilWaterService } from './soilWaterService';
import { runUsefulWaterScenario } from './engine/waterBalanceEngine';

// ============================================================
// waterForecastService — orquestador del módulo Water & Energy.
// FORECAST HÍDRICO V1 (AGUA ÚTIL EN MM):
//  · Estado inicial: AGUA ÚTIL DISPONIBLE (mm) medida por la
//    sonda, tomada directamente de soilWaterService — nunca VWC
//    promedio. Junto al estado se propagan TAW, umbral de recarga,
//    objetivo, cobertura y estado de configuración.
//  · Balance diario: agua = agua + lluvia efectiva + riego − ETc,
//    con ETc = ET0 (forecast meteorológico) × Kc (current_kc del
//    perfil). Limitado por TAW: el exceso es drainage_mm; si cae
//    bajo 0 se marca below_wilting.
//  · V1: effective_rainfall_mm = rainfall_mm (sin coeficientes;
//    se mantienen como variables separadas para evolucionar).
//  · Recomendación: primer día que cruza recharge_threshold_mm,
//    recargando hasta target_water_mm. Bloqueada si falta Kc
//    ("Falta configurar Kc") o si la cobertura es insuficiente.
//  · configuration_status incomplete → forecast no disponible;
//    coverage partial → forecast con forecast_confidence "partial".
// MODELO EXPERIMENTAL — no es una predicción agronómica validada.
// ============================================================

const round1 = n => Math.round(n * 10) / 10;

// Insumos diarios del balance. V1: lluvia efectiva = lluvia
// pronosticada tal cual (variables separadas para el futuro).
function forecastInputs(weatherDays, kc) {
  return (weatherDays || []).map(w => ({
    date: w.date,
    eto_mm: w.eto_mm ?? 0,
    kc: kc != null ? kc : null,
    etc_mm: kc != null ? round1((w.eto_mm ?? 0) * kc) : 0,
    rainfall_mm: w.rainfall_mm ?? 0,
    effective_rainfall_mm: w.rainfall_mm ?? 0,
  }));
}

// Fila de análisis de un lote (compartida por dashboard y detalle)
function buildRow(lot, profile, weatherDays, pumps, tariffs, state) {
  const pump = energyService.getPumpForLot(pumps, lot, profile);
  const tariff = energyService.getActiveTariff(tariffs);
  // El estado inicial SIEMPRE es el agua útil medida (soilWaterService)
  const usable = state && !state.missing
    && state.configuration_status === 'complete'
    && state.current_available_water_mm != null;
  const row = {
    lot,
    profile,
    pump,
    tariff,
    state: state || null,
    weather: weatherDays,
    forecast_status: usable ? 'ok' : 'no_disponible',
  };
  if (!usable) return row;

  const config = {
    total_available_water_capacity_mm: state.total_available_water_capacity_mm,
    recharge_threshold_mm: state.recharge_threshold_mm,
    target_water_mm: state.target_water_mm,
  };
  const kc = profile.current_kc;
  const kc_missing = kc == null;
  const days = forecastInputs(weatherDays, kc);
  const startMm = state.current_available_water_mm;
  const scenarioWithoutIrrigation = runUsefulWaterScenario(startMm, config, days);
  // Sin Kc configurado o cobertura insuficiente: sin recomendación
  const canRecommend = !kc_missing && state.coverage_status !== 'insufficient';
  const { recommendation, scenarioWithIrrigation } = canRecommend
    ? irrigationRecommendationService.withRecommendation(config, lot, startMm, days, scenarioWithoutIrrigation)
    : { recommendation: null, scenarioWithIrrigation: scenarioWithoutIrrigation };
  const energy = recommendation ? energyService.compute(recommendation.recommended_irrigation_m3, pump, tariff) : null;
  return {
    ...row,
    kc,
    kc_missing,
    forecast_confidence: state.coverage_status === 'partial' ? 'partial' : 'complete',
    scenarioWithoutIrrigation,
    scenarioWithIrrigation,
    recommendation,
    energy,
    below_wilting: scenarioWithoutIrrigation.some(p => p.below_wilting),
  };
}

export const waterForecastService = {
  // ---- Datos base (lotes y perfiles) ----
  async getLots() { return base44.entities.Lot.list(); },
  async getProfiles() { return base44.entities.SoilProfile.list(); },
  async saveProfile(data) {
    return data.id ? base44.entities.SoilProfile.update(data.id, data) : base44.entities.SoilProfile.create(data);
  },
  async deleteProfile(id) { return base44.entities.SoilProfile.delete(id); },

  // ---- Dashboard: filas por lote + totales de 7 días ----
  async getFarmOverview() {
    const [lots, profiles, pumps, tariffs] = await Promise.all([
      this.getLots(),
      this.getProfiles(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const tariff = energyService.getActiveTariff(tariffs);
    const weather = await weatherService.getFarmForecast(lots);
    const states = await soilWaterService.getStateForLots(lots.map(l => l.id));
    const rows = lots.map(lot => {
      const profile = profiles.find(p => p.lot_id === lot.id);
      if (!profile) return { lot, profile: null, forecast_status: 'no_disponible' };
      return buildRow(lot, profile, weather.get(lot.id) || [], pumps, tariffs, states.get(lot.id));
    });
    const withState = rows.filter(r => r.forecast_status === 'ok');
    const withRecommendation = withState.filter(r => r.recommendation);
    const pcts = withState.map(r => r.state.available_water_percent).filter(v => v != null);
    const totals = {
      lots: lots.length,
      monitored: withState.length,
      unprofiled: rows.length - rows.filter(r => r.profile).length,
      avgPct: pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : null,
      volumeM3: Math.round(withRecommendation.reduce((s, r) => s + (r.recommendation?.recommended_irrigation_m3 || 0), 0)),
      kwh: Math.round(withRecommendation.reduce((s, r) => s + (r.energy?.kwh || 0), 0)),
      cost: Math.round(withRecommendation.reduce((s, r) => s + (r.energy?.cost || 0), 0)),
    };
    return { rows, totals, tariff };
  },

  // ---- Detalle de un lote: histórico + HOY + forecast a 7 días ----
  async getLotDetail(lotId) {
    const lots = await this.getLots();
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return null;
    const [profiles, pumps, tariffs] = await Promise.all([
      this.getProfiles(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const profile = profiles.find(p => p.lot_id === lotId);
    if (!profile) return { lot, profile: null, forecast_status: 'no_disponible' };
    const [weather, state, history] = await Promise.all([
      weatherService.getFarmForecast([lot]),
      soilWaterService.getStateForLots([lotId]).then(m => m.get(lotId)),
      soilWaterService.getUsefulWaterHistory(lotId),
    ]);
    const row = buildRow(lot, profile, weather.get(lot.id) || [], pumps, tariffs, state);
    // Histórico del agua útil (mm) medido por la sonda del lote
    return { ...row, history: history || [], probeLinked: !!history };
  },
};