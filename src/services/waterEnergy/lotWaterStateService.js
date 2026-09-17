import { base44 } from '@/api/base44Client';
import { densityOf } from '@/lib/farmCalculations';
import { kcService } from './kcService';
import { soilWaterService, computeProfileConfig, fullProfileDepthCm, DEFAULT_FULL_PROFILE_DEPTH_CM } from './soilWaterService';
import { soilBehaviorService } from './soilBehaviorService';

// ============================================================
// lotWaterStateService — ESTADO HÍDRICO CALCULADO DE CADA LOTE.
//
// La curva de cada lote es una CURVA CALCULADA, no una lectura de
// sonda. Evoluciona con los eventos PROPIOS del lote:
//
//   estado hídrico anterior
//   + riegos ejecutados (IrrigationLog → lámina del programa)
//   + riegos programados (IrrigationProgram, futuro)
//   + lluvia observada / pronosticada
//   − demanda del cultivo (ETc = ET0 × Kc)
//   × comportamiento del suelo de referencia (SoilBehaviorModel:
//     eficiencia de recarga, agotamiento)
//
// SOLO LECTURA: una consulta de UI nunca escribe LotWaterState. El
// ORIGEN de la curva es una inicialización EXPLÍCITA del usuario
// (valor manual o estado inicial guardado); desde ese origen la curva
// se RECONSTRUYE completa en cada consulta. La sonda de referencia
// NUNCA inicializa ni iguala el estado del lote — solo alimenta el
// modelo de comportamiento del suelo.
//
// MODEL_VERSION: versión del modelo de balance (se registra en cada
// estado persistido para trazabilidad).
// ============================================================
const MODEL_VERSION = 'v1';
// Fondo del perfil de cálculo (cm): el estado hídrico CALCULADO de un
// lote se integra SIEMPRE sobre el perfil completo 0–120 cm. La sonda
// de referencia define el fondo con sus profundidades (10–115 → 120);
// sin sonda de referencia se usa el estándar DEFAULT_FULL_PROFILE_DEPTH_CM
// (importado de soilWaterService).
const round1 = n => Math.round(n * 10) / 10;
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => isoDay(new Date());
const dayAfter = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
// ET0 por defecto cuando la finca no tiene observaciones de estación —
// se documenta como estimación, nunca se presenta como dato medido.
const DEFAULT_ETO_MM = 4.0;
// Límite de reconstrucción hacia atrás (días) desde el ancla
const MAX_HISTORY_DAYS = 180;

// Factor del lote en el programa: suma de sus porciones (p.ej.
// Oeste + Este = lote completo).
function lotFactor(program, lotId) {
  const items = (program.items || []).filter(i => i.lot_id === lotId);
  return items.length ? items.reduce((s, i) => s + (i.factor ?? 1), 0) : 1;
}

// Lámina de un programa que corresponde a un lote (mm × factor del
// lote). baseMm permite pasar los mm REALMENTE aplicados del log.
// Los programas de la pestaña Riego suelen crearse sin mm explícito:
// en ese caso la lámina se deriva del DISEÑO DE RIEGO del lote y la
// duración del programa, con la misma fórmula que la vista previa de
// la pestaña Riego (mm/h del equipo × horas de riego × factor).
function lotIrrigationMm(program, lotId, lot, designs, baseMm) {
  const factor = lotFactor(program, lotId);
  if (baseMm != null) return baseMm * factor;
  if (program.mm != null) return program.mm * factor;
  const design = (designs || []).find(d => d.lot_id === lotId);
  if (!design || !lot) return 0;
  const mmh = (design.emitter_flow_lh || 0) * (design.emitters_per_plant || 0) * densityOf(lot) / 10000;
  return mmh * ((program.duration_min || 0) / 60) * factor;
}

// ---- Riegos ejecutados (PASADO) por lote ----
// PASADO = IrrigationLog: un riego cuenta como ejecutado SOLO si
// tiene su log (un programa histórico sin log no prueba que ocurrió).
// Los mm son los REALMENTE APLICADOS (log.applied_mm); si el log no
// los registra, se usa la lámina programada como respaldo.
function executedIrrigationFrom(logs, programs, lots, designs) {
  const lotIds = new Set(lots.map(l => l.id));
  const lotById = new Map(lots.map(l => [l.id, l]));
  const programById = new Map(programs.map(p => [p.id, p]));
  const executed = new Map();
  for (const log of logs) {
    const p = programById.get(log.program_id);
    if (!p || !log.date) continue;
    for (const lotId of p.lot_ids || []) {
      if (!lotIds.has(lotId)) continue;
      if (!executed.has(lotId)) executed.set(lotId, new Map());
      const cur = executed.get(lotId).get(log.date) || 0;
      executed.get(lotId).set(log.date, round1(cur + lotIrrigationMm(p, lotId, lotById.get(lotId), designs, log.applied_mm)));
    }
  }
  return executed;
}

// ---- Clima observado diario por finca: lluvia acumulada y ET0 ----
async function dailyObservedWeather(farmId) {
  const obs = await base44.entities.WeatherObservation.filter({ farm_id: farmId }, '-timestamp', 600);
  const raw = new Map();
  for (const o of obs) {
    // Día LOCAL del registro (la reconstrucción usa fechas locales):
    // sin esto, la lluvia caída cerca de la medianoche UTC se atribuye
    // al día siguiente y la subida se dibuja desplazada.
    const day = isoDay(new Date(o.timestamp));
    const cur = raw.get(day) || { rain: 0, etoSum: 0, etoN: 0 };
    cur.rain += o.rainfall_mm || 0;
    // ET0 diaria = SUMA de los incrementos del día (los registros de
    // la estación son incrementos: 0.2 + 0.3 + 0.4 + 0.3 = 1.2 mm),
    // NUNCA promedio. ET0 = 0 se trata como "sin dato" del intervalo.
    if (o.eto_mm > 0) { cur.etoSum += o.eto_mm; cur.etoN++; }
    raw.set(day, cur);
  }
  const byDay = new Map();
  raw.forEach((v, day) => byDay.set(day, {
    rain: round1(v.rain),
    eto: v.etoN ? round1(v.etoSum) : null,
  }));
  // ET0 de respaldo para días sin observaciones: promedio de las ET0
  // DIARIAS (sumas del día), no de los incrementos individuales.
  const dailyEtos = [...byDay.values()].map(v => v.eto).filter(v => v != null);
  const meanEto = dailyEtos.length ? round1(dailyEtos.reduce((s, v) => s + v, 0) / dailyEtos.length) : null;
  return { byDay, meanEto };
}

// ---- Fondo del perfil completo (0–N cm) de un lote ----
// Definido por la sonda de referencia de su modelo de suelo (ej.
// sonda 10–115 cm → 0–120 cm). Sin sonda de referencia → null: la
// integración se hace sobre la zona radicular configurada.
async function referenceFullDepthCm(profile, models) {
  const model = soilBehaviorService.getModelForProfile(profile, models);
  const refProbeId = model?.reference_probe_id || profile.probe_id;
  if (!refProbeId) return DEFAULT_FULL_PROFILE_DEPTH_CM;
  const channels = await base44.entities.SoilProbeChannel.filter({ probe_id: refProbeId });
  return fullProfileDepthCm(channels.map(c => c.depth_cm)) ?? DEFAULT_FULL_PROFILE_DEPTH_CM;
}

// ---- Contexto compartido (una sola pasada para todos los lotes) ----
async function loadContext(lots) {
  const [profiles, models, states, logs, programs, farms, allLayers, allChannels, designs] = await Promise.all([
    base44.entities.SoilProfile.list(),
    soilBehaviorService.getModels(),
    base44.entities.LotWaterState.list('-timestamp', 2000),
    base44.entities.IrrigationLog.list(),
    base44.entities.IrrigationProgram.list(),
    base44.entities.Farm.list(),
    base44.entities.SoilLayer.list(),
    base44.entities.SoilProbeChannel.list(),
    base44.entities.IrrigationDesign.list(),
  ]);
  // Configuración estática de cada perfil (SIN sonda) — capas cargadas
  // UNA sola vez para todos los perfiles: sin consultas por perfil.
  const layersByProfile = new Map();
  for (const layer of allLayers) {
    if (!layersByProfile.has(layer.soil_profile_id)) layersByProfile.set(layer.soil_profile_id, []);
    layersByProfile.get(layer.soil_profile_id).push(layer);
  }
  // Configuración de cada perfil integrada sobre el PERFIL COMPLETO
  // definido por su sonda de referencia (ej. 0–120 cm)
  const configs = new Map();
  for (const p of profiles) {
    const model = soilBehaviorService.getModelForProfile(p, models);
    const refProbeId = model?.reference_probe_id || p.probe_id;
    const depths = refProbeId ? allChannels.filter(c => c.probe_id === refProbeId).map(c => c.depth_cm) : [];
    configs.set(p.id, computeProfileConfig(p, layersByProfile.get(p.id) || [], fullProfileDepthCm(depths) ?? DEFAULT_FULL_PROFILE_DEPTH_CM));
  }
  // Clima observado por finca (id)
  const farmByLot = new Map(lots.map(l => [l.id, farms.find(f => f.name === l.farm) || null]));
  const farmIds = [...new Set([...farmByLot.values()].map(f => f?.id).filter(Boolean))];
  const observed = new Map(await Promise.all(farmIds.map(async id => [id, await dailyObservedWeather(id)])));
  const executed = executedIrrigationFrom(logs, programs, lots, designs);
  return { profiles, models, states, configs, farmByLot, observed, executed, programs, designs };
}

// ---- Estado de UN lote: ancla + reconstrucción diaria hasta hoy ----
async function computeLot(lot, ctx, withHistory) {
  const profile = ctx.profiles.find(p => p.lot_id === lot.id);
  if (!profile) return { lot, profile: null, config: null, model: null, forecast_status: 'no_disponible', reason: 'sin_perfil' };
  const config = ctx.configs.get(profile.id);
  const model = soilBehaviorService.getModelForProfile(profile, ctx.models);
  const efficiency = model?.recharge_efficiency != null ? model.recharge_efficiency : 1;
  const taw = config?.total_available_water_capacity_mm ?? null;
  const wilting = config?.wilting_storage_mm ?? 0;
  const configComplete = config?.configuration_status === 'complete';

  // ---- Origen del estado: inicialización EXPLÍCITA del usuario ----
  // Se aceptan únicamente un LotWaterState creado explícitamente
  // (manual o estimación guardada por el usuario) o el valor manual
  // del perfil. La sonda JAMÁS inicializa el estado del lote: es solo
  // referencia para aprender el comportamiento del suelo.
  const stateRecs = ctx.states.filter(s => s.lot_id === lot.id);
  let anchor = null;
  const explicit = stateRecs.find(s => s.source === 'manual_adjustment' || s.source === 'initialized');
  if (explicit) {
    // La inicialización más reciente: una nueva inicialización reinicia la curva
    anchor = {
      date: isoDay(new Date(explicit.timestamp)),
      useful: Math.max(0, round1((explicit.profile_water_mm ?? 0) - wilting)),
      source: explicit.source,
    };
  } else if (stateRecs.length) {
    // Registros legados diarios: el más antiguo es el punto de partida
    const first = stateRecs[stateRecs.length - 1];
    anchor = {
      date: isoDay(new Date(first.timestamp)),
      useful: Math.max(0, round1((first.profile_water_mm ?? 0) - wilting)),
      source: 'calculated',
    };
  } else if (configComplete && profile.manual_initial_water_mm != null) {
    anchor = { date: todayStr(), useful: profile.manual_initial_water_mm, source: 'manual_adjustment' };
  }
  if (!anchor) {
    return {
      lot, profile, config, model, efficiency,
      forecast_status: 'no_disponible',
      reason: configComplete ? 'sin_estado_inicial' : 'config_incompleta',
    };
  }
  // Rango físico del origen: nunca por encima de la capacidad útil
  // (el excedente drena) ni por debajo del punto de marchitez. Sin
  // esto, un origen fuera de rango hace que el primer día del
  // forecast recorte la curva y el gráfico no refleje el valor inicial.
  if (taw != null && anchor.useful > taw) anchor = { ...anchor, useful: taw };
  if (anchor.useful < 0) anchor = { ...anchor, useful: 0 };

  // ---- Reconstrucción diaria: ancla → hoy ----
  // eventos propios del lote + clima observado + demanda del cultivo,
  // modulados por el comportamiento del suelo de referencia.
  const end = todayStr();
  let startDay = anchor.date;
  if (startDay < dayAfter(end, -(MAX_HISTORY_DAYS - 1))) startDay = dayAfter(end, -(MAX_HISTORY_DAYS - 1));
  const executed = ctx.executed.get(lot.id) || new Map();
  const farm = ctx.farmByLot.get(lot.id);
  const obs = farm ? ctx.observed.get(farm.id) : null;
  const history = [{ date: startDay, mm: anchor.useful }];
  const irrigationEvents = [];
  const rainEvents = [];
  let water = anchor.useful;
  let d = dayAfter(startDay, 1);
  while (d <= end) {
    const irr = round1((executed.get(d) || 0) * efficiency);
    const rain = obs?.byDay.get(d)?.rain ?? 0;
    const eto = obs?.byDay.get(d)?.eto ?? obs?.meanEto ?? DEFAULT_ETO_MM;
    // Kc de cada día: el EXPLÍCITO del perfil (current_kc) o, si no
    // hay, la tabla MENSUAL del cultivo (granadas/olivos): un Kc
    // distinto según el mes. Sin ninguno no se descuenta demanda.
    const kc = profile.current_kc != null ? profile.current_kc : kcService.kcForCropDate(lot.crop, d);
    const etc = kc != null ? round1(eto * kc) : 0;
    let next = water + irr + rain - etc;
    if (taw != null && next > taw) next = taw; // excedente = drenaje
    if (next < 0) next = 0; // suelo del ancla nunca baja del punto de marchitez
    water = round1(next);
    if (irr > 0) irrigationEvents.push({ date: d, mm: irr });
    if (rain > 0) rainEvents.push({ date: d, mm: rain });
    history.push({ date: d, mm: water });
    d = dayAfter(d, 1);
  }

  // ---- Programados del lote (futuro) con eficiencia del modelo ----
  // Un evento por PROGRAMA (guarda program_id para poder confirmar la
  // ejecución desde la UI). gross_mm = lámina a aplicar del
  // cronograma (mm explícitos del programa o derivados de su diseño
  // de riego y duración); mm = efecto neto sobre el perfil (gross ×
  // eficiencia de recarga aprendida del suelo).
  const t = todayStr();
  const scheduledPrograms = (ctx.programs || [])
    .filter(p => p.date && p.date > t && ['Programado', 'Activo'].includes(p.status) && (p.lot_ids || []).includes(lot.id))
    .map(p => {
      const gross = lotIrrigationMm(p, lot.id, lot, ctx.designs);
      return { date: p.date, gross_mm: round1(gross), mm: round1(gross * efficiency), program_id: p.id, status: p.status };
    })
    .filter(e => e.gross_mm > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  // Agregado por fecha para el gráfico (puede haber varios programas
  // el mismo día).
  const scheduledAgg = new Map();
  for (const e of scheduledPrograms) scheduledAgg.set(e.date, round1((scheduledAgg.get(e.date) || 0) + e.mm));
  const scheduledEvents = [...scheduledAgg.entries()]
    .map(([date, mm]) => ({ date, mm }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    lot, profile, config, model,
    efficiency,
    currentUsefulMm: water,
    currentStoredMm: round1(wilting + water),
    state_source: anchor.source,
    origin: anchor.source,
    anchored_at: end,
    history: withHistory ? history : null,
    events: { irrigation: irrigationEvents, scheduled: scheduledEvents, scheduledPrograms, rain: rainEvents },
    forecast_status: 'ok',
  };
}

export const lotWaterStateService = {
  // Map<lot_id, estado calculado> — SOLO LECTURA/CÁLCULO: una consulta
  // de UI nunca escribe LotWaterState (los registros se crean únicamente
  // con las inicializaciones explícitas de más abajo). withHistory
  // incluye la serie diaria pasada (para el gráfico).
  async getLotStates(lots, { withHistory = false } = {}) {
    const ctx = await loadContext(lots);
    const results = await Promise.all(lots.map(l => computeLot(l, ctx, withHistory)));
    return new Map(lots.map((l, i) => [l.id, results[i]]));
  },

  // Inicialización manual del estado del lote. La entrada está en la
  // MISMA escala del gráfico "Suma de perfil" (mm de agua almacenada):
  // la curva arranca exactamente en el valor ingresado. Se acota al
  // rango físico [punto de marchitez, capacidad de campo] — el
  // excedente drena y no se almacena. A partir de ahí el estado
  // evoluciona solo con los eventos del lote.
  async initializeManual(lotId, profileWaterMm) {
    const profiles = await base44.entities.SoilProfile.filter({ lot_id: lotId });
    const profile = profiles[0];
    if (!profile) throw new Error('El lote no tiene perfil de suelo configurado.');
    const models = await soilBehaviorService.getModels();
    const config = await soilWaterService.getProfileConfig(profile, await referenceFullDepthCm(profile, models));
    const wilting = config?.wilting_storage_mm || 0;
    const taw = config?.total_available_water_capacity_mm;
    let useful = round1(profileWaterMm - wilting);
    if (taw != null && useful > taw) useful = taw;
    if (useful < 0) useful = 0;
    const stored = round1(wilting + useful);
    await base44.entities.SoilProfile.update(profile.id, { manual_initial_water_mm: useful });
    return base44.entities.LotWaterState.create({
      lot_id: lotId,
      timestamp: new Date().toISOString(),
      profile_water_mm: stored,
      source: 'manual_adjustment',
      model_version: MODEL_VERSION,
    });
  },

};