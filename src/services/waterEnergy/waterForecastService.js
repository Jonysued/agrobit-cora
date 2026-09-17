import { base44 } from '@/api/base44Client';
import { weatherService } from './weatherService';
import { energyService } from './energyService';
import { irrigationRecommendationService } from './irrigationRecommendationService';
import { lotWaterStateService } from './lotWaterStateService';
import { runUsefulWaterScenario } from './engine/waterBalanceEngine';

// ============================================================
// waterForecastService — orquestador del módulo Water & Energy.
//
// FORECAST HÍDRICO POR LOTE (CURVA CALCULADA):
//   LotWaterState (estado calculado del lote, lotWaterStateService)
//   + SoilBehaviorModel (comportamiento del suelo de referencia)
//   + IrrigationLog (riegos ejecutados → ya aplicados al estado)
//   + IrrigationProgram (riegos programados → futuro)
//   + WeatherForecast (ET0 / lluvia pronosticada)
//   + Kc del cultivo (ETc = ET0 × Kc)
//   = CURVA HÍDRICA PROPIA DE CADA LOTE
//
// La sonda de referencia NO entrega el estado del lote: el estado
// inicial es el último LotWaterState persistido (o una inicialización
// manual / estimación única desde la sonda). Dos lotes con el mismo
// modelo de suelo tienen curvas completamente distintas.
//
// MODELO EXPERIMENTAL — no es una predicción agronómica validada.
// ============================================================

const round1 = n => Math.round(n * 10) / 10;

// Insumos diarios del balance futuro. V1: lluvia efectiva = lluvia
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

// Estado sintético para la UI (escala de agua útil + almacenamiento)
function buildState(curve) {
  const { config, currentUsefulMm } = curve;
  const taw = config.total_available_water_capacity_mm;
  const recharge = config.recharge_threshold_mm;
  const target = config.target_water_mm;
  let status = null;
  if (recharge != null) {
    status = currentUsefulMm < recharge ? 'RECARGAR'
      : (target != null && currentUsefulMm >= target) ? 'LLENO' : 'ÓPTIMO';
  }
  return {
    configuration_status: config.configuration_status,
    missing_configuration: config.missing_configuration,
    current_available_water_mm: currentUsefulMm,
    available_water_percent: taw > 0 ? round1((currentUsefulMm / taw) * 100) : null,
    status,
    total_available_water_capacity_mm: taw,
    recharge_threshold_mm: recharge,
    target_water_mm: target,
    wilting_storage_mm: config.wilting_storage_mm,
    field_capacity_storage_mm: config.field_capacity_storage_mm,
    recharge_storage_mm: config.recharge_storage_mm,
    target_storage_mm: config.target_storage_mm,
    total_profile_water_mm: curve.currentStoredMm,
    state_source: curve.state_source,
    origin: curve.origin,
    last_state_at: curve.anchored_at,
  };
}

// Fila de análisis de un lote (compartida por dashboard y detalle)
function buildRow(lot, curve, weatherDays, pumps, tariffs, designs) {
  const { profile, model, efficiency } = curve;
  const pump = energyService.getPumpForLot(pumps, lot, profile);
  const tariff = energyService.getActiveTariff(tariffs);
  // Diseño de riego del lote: define la lámina que el equipo puede
  // aplicar por hora (mm/h) — base del tiempo de bombeo.
  const design = (designs || []).find(d => d.lot_id === lot.id) || null;
  const rateMmH = energyService.applicationRateMmH(design, lot);
  const usable = curve.forecast_status === 'ok'
    && curve.config?.configuration_status === 'complete'
    && curve.currentUsefulMm != null;
  const row = {
    lot,
    profile,
    model,
    pump,
    tariff,
    state: usable ? buildState(curve) : (curve.config
      ? { configuration_status: curve.config.configuration_status, missing_configuration: curve.config.missing_configuration }
      : null),
    weather: weatherDays,
    forecast_status: usable ? 'ok' : 'no_disponible',
  };
  if (!usable) return row;

  // Balance futuro: clima + riegos PROGRAMADOS del lote (con la
  // eficiencia de recarga del modelo de suelo de referencia)
  const kc = profile.current_kc;
  const kc_missing = kc == null;
  const scheduledByDate = new Map((curve.events?.scheduled || []).map(e => [e.date, e.mm]));
  const days = forecastInputs(weatherDays, kc).map(d => ({
    ...d,
    irrigation_mm: scheduledByDate.get(d.date) ?? 0,
  }));
  const config = {
    total_available_water_capacity_mm: curve.config.total_available_water_capacity_mm,
    recharge_threshold_mm: curve.config.recharge_threshold_mm,
    target_water_mm: curve.config.target_water_mm,
  };
  const scenarioScheduled = runUsefulWaterScenario(curve.currentUsefulMm, config, days);
  const canRecommend = !kc_missing;
  const { recommendation, scenarioWithIrrigation } = canRecommend
    ? irrigationRecommendationService.withRecommendation(config, lot, curve.currentUsefulMm, days, scenarioScheduled)
    : { recommendation: null, scenarioWithIrrigation: scenarioScheduled };
  const energy = recommendation ? energyService.compute(recommendation.recommended_irrigation_m3, pump, tariff, rateMmH, recommendation.recommended_irrigation_mm) : null;
  return {
    ...row,
    kc,
    kc_missing,
    efficiency,
    scheduled_irrigation: curve.events?.scheduled || [],
    forecast_confidence: model?.calibration_status === 'calibrated' ? 'complete' : 'partial',
    scenarioWithoutIrrigation: scenarioScheduled,
    scenarioWithIrrigation,
    recommendation,
    irrigation_design: design,
    application_rate_mm_h: rateMmH,
    energy,
    below_wilting: scenarioScheduled.some(p => p.below_wilting),
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

  // ---- Inicialización del estado de un lote (manual / sonda de ref.) ----
  initializeManual(lotId, mm) { return lotWaterStateService.initializeManual(lotId, mm); },
  initializeFromReferenceProbe(lotId) { return lotWaterStateService.initializeFromReferenceProbe(lotId); },

  // ---- Dashboard: filas por lote + totales de 15 días ----
  async getFarmOverview() {
    const [lots, pumps, tariffs, designs] = await Promise.all([
      this.getLots(),
      energyService.getPumps(),
      energyService.getTariffs(),
      base44.entities.IrrigationDesign.list(),
    ]);
    const curves = await lotWaterStateService.getLotStates(lots, { withHistory: false });
    const weather = await weatherService.getFarmForecast(lots);
    const rows = lots.map(lot => {
      const curve = curves.get(lot.id);
      if (!curve?.profile) return { lot, profile: null, state: null, forecast_status: 'no_disponible' };
      return buildRow(lot, curve, weather.get(lot.id) || [], pumps, tariffs, designs);
    });
    const withState = rows.filter(r => r.forecast_status === 'ok');
    const withRecommendation = withState.filter(r => r.recommendation);
    const pcts = withState.map(r => r.state.available_water_percent).filter(v => v != null);
    const totals = {
      lots: lots.length,
      monitored: withState.length,
      unprofiled: rows.filter(r => !r.profile).length,
      avgPct: pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : null,
      avgStoredMm: (() => { const mm = withState.map(r => r.state?.total_profile_water_mm).filter(v => v != null); return mm.length ? Math.round(mm.reduce((s, v) => s + v, 0) / mm.length * 10) / 10 : null; })(),
      volumeM3: Math.round(withRecommendation.reduce((s, r) => s + (r.recommendation?.recommended_irrigation_m3 || 0), 0)),
      kwh: Math.round(withRecommendation.reduce((s, r) => s + (r.energy?.kwh || 0), 0)),
      cost: Math.round(withRecommendation.reduce((s, r) => s + (r.energy?.cost || 0), 0)),
    };
    return { rows, totals, tariff: energyService.getActiveTariff(tariffs) };
  },

  // ---- Detalle de un lote: histórico calculado + HOY + forecast a 15 días ----
  async getLotDetail(lotId) {
    const lots = await this.getLots();
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return null;
    const [pumps, tariffs, curves, designs] = await Promise.all([
      energyService.getPumps(),
      energyService.getTariffs(),
      lotWaterStateService.getLotStates([lot], { withHistory: true }),
      base44.entities.IrrigationDesign.filter({ lot_id: lotId }),
    ]);
    const curve = curves.get(lotId);
    if (!curve?.profile) return { lot, profile: null, forecast_status: 'no_disponible' };
    const weather = await weatherService.getFarmForecast([lot]);
    const row = buildRow(lot, curve, weather.get(lot.id) || [], pumps, tariffs, designs);
    // Serie calculada del lote (agua útil mm por día) + eventos propios
    return {
      ...row,
      history: curve.history || [],
      events: curve.events,
      efficiency: curve.efficiency,
    };
  },
};