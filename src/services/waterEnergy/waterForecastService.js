import { backend } from '@/api/backendClient';
import { weatherService } from './weatherService';
import { kcService } from './kcService';
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
// La sonda de referencia NO entrega el estado del lote: solo alimenta
// el SoilBehaviorModel (comportamiento del suelo). El estado inicial
// es el último LotWaterState persistido o una inicialización manual
// explícita. Dos lotes con el mismo modelo de suelo tienen curvas
// completamente distintas.
//
// MODEL_VERSION V2: cada resultado expone calidad y procedencia de
// datos para que una estimación incompleta nunca parezca una certeza.
// ============================================================

const round1 = n => Math.round(n * 10) / 10;

// Insumos diarios: el Kc se recalcula para cada fecha según cultivo,
// edad del lote, etapa fenológica y desfase de campaña configurado.
function forecastInputs(weatherDays, lot, profile, etcCorrectionFactor = 1) {
  return (weatherDays || []).map(w => {
    const kc = kcService.kcForLotDate(lot, w.date, profile);
    return {
      date: w.date,
      eto_mm: w.eto_mm ?? 0,
      kc: kc != null ? kc : null,
      etc_mm: kc != null ? round1((w.eto_mm ?? 0) * kc) : 0,
      rainfall_mm: w.rainfall_mm ?? 0,
      effective_rainfall_mm: w.effective_rainfall_mm ?? round1((w.rainfall_mm ?? 0) * 0.7),
      etc_correction_factor: etcCorrectionFactor,
    };
  });
}

const daysBetween = (a, b = new Date()) => {
  if (!a) return null;
  return Math.max(0, Math.floor((b.getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000));
};

function forecastQuality(curve, weatherDays, kcMissing) {
  const warnings = [];
  const anchorAgeDays = daysBetween(curve.anchor_date);
  const observedAt = curve.data_quality?.observed_weather_last_at;
  const observedAgeHours = observedAt ? Math.max(0, (Date.now() - new Date(observedAt).getTime()) / 3600000) : null;
  const simulatedInDecisionWindow = (weatherDays || []).slice(0, 15).some(d => d.simulated);
  if (!curve.model) warnings.push('sin modelo de suelo vinculado');
  else if (curve.model.calibration_status !== 'calibrated') warnings.push('modelo de suelo sin calibración completa');
  if (!curve.data_quality?.recharge_efficiency_learned) warnings.push('eficiencia de recarga no aprendida');
  if (!curve.data_quality?.etc_correction_learned) warnings.push('respuesta de extracción no calibrada contra ETc');
  if (anchorAgeDays != null && anchorAgeDays > 30) warnings.push(`estado inicial con ${anchorAgeDays} días de antigüedad`);
  if (anchorAgeDays > 0 && observedAgeHours == null) warnings.push('sin meteorología observada para reconstruir el estado');
  else if (anchorAgeDays > 0 && observedAgeHours > 24) warnings.push('meteorología observada desactualizada');
  if (curve.data_quality?.estimated_eto_days > 0) warnings.push(`ET0 estimada con promedio de Garita en ${curve.data_quality.estimated_eto_days} días sin lectura`);
  if (curve.data_quality?.missing_rain_days > 0) warnings.push(`sin lectura de lluvia de Garita en ${curve.data_quality.missing_rain_days} días`);
  if (simulatedInDecisionWindow) warnings.push('el horizonte de decisión contiene clima simulado');
  if (kcMissing) warnings.push('Kc sin configurar');
  const blockedReasons = [];
  if (kcMissing) blockedReasons.push('Falta configurar Kc.');
  if (simulatedInDecisionWindow) blockedReasons.push('No hay pronóstico meteorológico real para toda la ventana de decisión.');
  if (anchorAgeDays > 0 && (observedAgeHours == null || observedAgeHours > 24)) blockedReasons.push('La meteorología observada está ausente o tiene más de 24 horas.');
  const level = blockedReasons.length ? 'blocked' : warnings.length ? 'partial' : 'complete';
  return { level, warnings, blocked_reasons: blockedReasons, anchor_age_days: anchorAgeDays, observed_weather_age_hours: observedAgeHours == null ? null : round1(observedAgeHours), simulated_in_decision_window: simulatedInDecisionWindow };
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
    daily_change_mm: curve.daily_change_mm,
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
  // eficiencia de recarga del modelo de suelo de referencia).
  const kc_details = kcService.detailsForLotDate(lot, (weatherDays || [])[0]?.date, profile);
  const kc = kc_details.kc;
  const kc_source = kc_details.source;
  const kc_missing = kc == null;
  const scheduledByDate = new Map((curve.events?.scheduled || []).map(e => [e.date, e.mm]));
  const baseDays = forecastInputs(weatherDays, lot, profile, curve.etc_correction_factor ?? 1);
  const forecast_quality = forecastQuality(curve, weatherDays, kc_missing);
  const config = {
    total_available_water_capacity_mm: curve.config.total_available_water_capacity_mm,
    recharge_threshold_mm: curve.config.recharge_threshold_mm,
    target_water_mm: curve.config.target_water_mm,
  };
  // TENDENCIA SIN RIEGO: continuación natural de la curva actual
  // (solo lluvia − ETc), sin ningún riego futuro.
  const scenarioNoIrrigation = runUsefulWaterScenario(curve.currentUsefulMm, config, baseDays);
  const days = baseDays.map(d => ({
    ...d,
    irrigation_mm: scheduledByDate.get(d.date) ?? 0,
  }));
  const scenarioScheduled = runUsefulWaterScenario(curve.currentUsefulMm, config, days);
  // El escenario y la recomendación comparten los 15 días del pronóstico.
  const canRecommend = !kc_missing && forecast_quality.level !== 'blocked';
  const { recommendation, scenarioWithIrrigation } = canRecommend
    ? irrigationRecommendationService.withRecommendation(config, lot, curve.currentUsefulMm, days, scenarioScheduled.slice(0, 15), efficiency)
    : { recommendation: null, scenarioWithIrrigation: scenarioScheduled };
  const energy = recommendation ? energyService.compute(recommendation.recommended_irrigation_m3, pump, tariff, rateMmH, recommendation.recommended_irrigation_mm) : null;
  return {
    ...row,
    kc,
    kc_source,
    kc_details,
    kc_missing,
    efficiency,
    scheduled_irrigation: curve.events?.scheduled || [],
    forecast_confidence: forecast_quality.level,
    forecast_quality,
    scenarioNoIrrigation,
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
  async getLots() { return backend.entities.Lot.list(); },
  async getProfiles() { return backend.entities.SoilProfile.list(); },
  async saveProfile(data) {
    return data.id ? backend.entities.SoilProfile.update(data.id, data) : backend.entities.SoilProfile.create(data);
  },
  async deleteProfile(id) { return backend.entities.SoilProfile.delete(id); },

  // ---- Inicialización del estado de un lote (SOLO valor manual) ----
  initializeManual(lotId, mm, date) { return lotWaterStateService.initializeManual(lotId, mm, date); },

  // ---- Confirmar un riego programado como EJECUTADO ----
  // Guarda el IrrigationLog con los mm realmente aplicados y marca el
  // programa Finalizado: el evento pasa de "programado" (cronograma,
  // futuro) a "ejecutado" (histórico). La próxima consulta reconstruye
  // la curva con los mm reales y recalcula forecast y recomendación.
  async confirmScheduledIrrigation(programId, appliedMm) {
    const programs = await backend.entities.IrrigationProgram.list();
    const program = programs.find(p => p.id === programId);
    if (!program) throw new Error('Programa de riego no encontrado.');
    // La ejecución SOLO se confirma el día del riego o después: un
    // riego futuro todavía no ocurrió y no puede entrar al estado
    // actual del lote (curva negra).
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (program.date > today) throw new Error('No se puede confirmar la ejecución de un riego futuro — confirmalo el día del riego o después.');
    const mm = Math.round((Number(appliedMm) || 0) * 10) / 10;
    if (!(mm > 0)) throw new Error('Los mm aplicados deben ser mayores que cero.');
    await backend.entities.IrrigationLog.create({ program_id: programId, date: program.date, applied_mm: mm });
    await backend.entities.IrrigationProgram.update(programId, { status: 'Finalizado' });
  },

  // ---- Riegos a confirmar: TODOS los lotes en una lista ----
  // Programas de HOY o de fechas PASADAS sin su IrrigationLog (la
  // ejecución nunca se confirma por adelantado), con el efecto neto
  // sobre el perfil (mm × eficiencia de recarga del suelo). Más
  // atrasados primero.
  async getPendingIrrigations() {
    const lots = await this.getLots();
    const curves = await lotWaterStateService.getLotStates(lots, { withHistory: false });
    return lots.flatMap(lot => {
      const curve = curves.get(lot.id);
      return (curve?.events?.pendingPrograms || []).map(e => ({
        ...e,
        lot_id: lot.id,
        lot_name: lot.name,
        lot_farm: lot.farm,
        efficiency: curve?.efficiency ?? null,
      }));
    }).sort((a, b) => a.date.localeCompare(b.date) || a.lot_name.localeCompare(b.lot_name));
  },

  // ---- Dashboard: filas por lote + totales de 15 días ----
  async getFarmOverview() {
    const [lots, pumps, tariffs, designs] = await Promise.all([
      this.getLots(),
      energyService.getPumps(),
      energyService.getTariffs(),
      backend.entities.IrrigationDesign.list(),
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

  // ---- Detalle de un lote: histórico calculado + HOY + pronóstico de 15 días ----
  async getLotDetail(lotId) {
    const lots = await this.getLots();
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return null;
    const [pumps, tariffs, curves, designs] = await Promise.all([
      energyService.getPumps(),
      energyService.getTariffs(),
      lotWaterStateService.getLotStates([lot], { withHistory: true }),
      backend.entities.IrrigationDesign.filter({ lot_id: lotId }),
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
      // Punto de partida de la curva: el gráfico encuadra su ventana y
      // marca este punto (fecha + mm de la inicialización).
      anchor_date: curve.anchor_date,
      anchor_storage_mm: curve.anchor_storage_mm,
    };
  },
};
