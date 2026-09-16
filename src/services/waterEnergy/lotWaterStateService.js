import { base44 } from '@/api/base44Client';
import { soilWaterService } from './soilWaterService';
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
// El estado persiste en LotWaterState (un registro por día) y es el
// punto de partida del día siguiente: la sonda de referencia NUNCA
// vuelve a igualar el estado del lote — solo alimenta el modelo.
//
// MODEL_VERSION: versión del modelo de balance (se registra en cada
// estado persistido para trazabilidad).
// ============================================================
const MODEL_VERSION = 'v1';
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

// Lámina de un programa que corresponde a un lote (mm × factor)
function lotIrrigationMm(program, lotId) {
  const item = (program.items || []).find(i => i.lot_id === lotId);
  return (program.mm || 0) * (item?.factor ?? 1);
}

// ---- Riegos ejecutados (IrrigationLog) y programados por lote ----
// Ejecutados: cada IrrigationLog confirma el riego de su programa en
// esa fecha (fuente principal). Fallback: programas pasados
// Finalizados si el lote no tiene ningún log cargado.
// Programados: programas futuros Programado/Activo.
function irrigationEventsFrom(logs, programs, lots) {
  const lotIds = new Set(lots.map(l => l.id));
  const programById = new Map(programs.map(p => [p.id, p]));
  const add = (map, lotId, date, mm) => {
    if (!map.has(lotId)) map.set(lotId, new Map());
    const cur = map.get(lotId).get(date) || 0;
    map.get(lotId).set(date, round1(cur + mm));
  };
  const executed = new Map();
  const scheduled = new Map();
  const loggedLots = new Set();
  for (const log of logs) {
    const p = programById.get(log.program_id);
    if (!p || !log.date) continue;
    for (const lotId of p.lot_ids || []) {
      if (!lotIds.has(lotId)) continue;
      add(executed, lotId, log.date, lotIrrigationMm(p, lotId));
      loggedLots.add(lotId);
    }
  }
  const t = todayStr();
  for (const p of programs) {
    if (!p.date) continue;
    for (const lotId of p.lot_ids || []) {
      if (!lotIds.has(lotId)) continue;
      if (!loggedLots.has(lotId) && p.date <= t && ['Finalizado', 'Activo'].includes(p.status)) {
        add(executed, lotId, p.date, lotIrrigationMm(p, lotId));
      }
      if (p.date > t && ['Programado', 'Activo'].includes(p.status)) {
        add(scheduled, lotId, p.date, lotIrrigationMm(p, lotId));
      }
    }
  }
  return { executed, scheduled };
}

// ---- Clima observado diario por finca: lluvia acumulada y ET0 ----
async function dailyObservedWeather(farmId) {
  const obs = await base44.entities.WeatherObservation.filter({ farm_id: farmId }, '-timestamp', 600);
  const raw = new Map();
  const etos = [];
  for (const o of obs) {
    const day = o.timestamp.slice(0, 10);
    const cur = raw.get(day) || { rain: 0, etoSum: 0, etoN: 0 };
    cur.rain += o.rainfall_mm || 0;
    if (o.eto_mm != null) { cur.etoSum += o.eto_mm; cur.etoN++; etos.push(o.eto_mm); }
    raw.set(day, cur);
  }
  const byDay = new Map();
  raw.forEach((v, day) => byDay.set(day, {
    rain: round1(v.rain),
    eto: v.etoN ? round1(v.etoSum / v.etoN) : null,
  }));
  const meanEto = etos.length ? round1(etos.reduce((s, v) => s + v, 0) / etos.length) : null;
  return { byDay, meanEto };
}

// ---- Contexto compartido (una sola pasada para todos los lotes) ----
async function loadContext(lots) {
  const [profiles, models, states, logs, programs, farms] = await Promise.all([
    base44.entities.SoilProfile.list(),
    soilBehaviorService.getModels(),
    base44.entities.LotWaterState.list('-timestamp', 2000),
    base44.entities.IrrigationLog.list(),
    base44.entities.IrrigationProgram.list(),
    base44.entities.Farm.list(),
  ]);
  // Configuración estática de cada perfil (SIN sonda)
  const configs = new Map(await Promise.all(profiles.map(async p => [p.id, await soilWaterService.getProfileConfig(p)])));
  // Clima observado por finca (id)
  const farmByLot = new Map(lots.map(l => [l.id, farms.find(f => f.name === l.farm) || null]));
  const farmIds = [...new Set([...farmByLot.values()].map(f => f?.id).filter(Boolean))];
  const observed = new Map(await Promise.all(farmIds.map(async id => [id, await dailyObservedWeather(id)])));
  const { executed, scheduled } = irrigationEventsFrom(logs, programs, lots);
  return { profiles, models, probes, states, configs, farmByLot, observed, executed, scheduled };
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

  // ---- Ancla del estado: último estado persistido, o inicialización ----
  const stateRecs = ctx.states.filter(s => s.lot_id === lot.id);
  let anchor = null;
  let justInitialized = false;
  if (stateRecs.length) {
    const rec = stateRecs[0];
    anchor = { date: isoDay(new Date(rec.timestamp)), useful: round1((rec.profile_water_mm ?? 0) - wilting), source: rec.source || 'calculated' };
    if (anchor.useful < 0) anchor.useful = 0;
  } else if (configComplete) {
    if (profile.manual_initial_water_mm != null) {
      anchor = { date: todayStr(), useful: profile.manual_initial_water_mm, source: 'manual_adjustment' };
      justInitialized = true;
    } else if (model?.reference_probe_id) {
      // Estimación inicial ÚNICA desde la sonda de referencia (el estado
      // luego evoluciona solo: la sonda nunca vuelve a igualarlo).
      const probeState = await soilWaterService.getProbeWaterState(model.reference_probe_id);
      if (probeState && !probeState.missing && probeState.current_available_water_mm != null) {
        anchor = { date: todayStr(), useful: probeState.current_available_water_mm, source: 'initialized' };
        justInitialized = true;
      }
    }
  }
  if (!anchor) {
    return {
      lot, profile, config, model, efficiency,
      forecast_status: 'no_disponible',
      reason: configComplete ? 'sin_estado_inicial' : 'config_incompleta',
    };
  }

  // ---- Reconstrucción diaria: ancla → hoy ----
  // eventos propios del lote + clima observado + demanda del cultivo,
  // modulados por el comportamiento del suelo de referencia.
  const end = todayStr();
  let startDay = anchor.date;
  if (startDay < dayAfter(end, -(MAX_HISTORY_DAYS - 1))) startDay = dayAfter(end, -(MAX_HISTORY_DAYS - 1));
  const kc = profile.current_kc;
  const executed = ctx.executed.get(lot.id) || new Map();
  const farm = ctx.farmByLot.get(lot.id);
  const obs = farm ? ctx.observed.get(farm.id) : null;
  const history = [{ date: startDay, mm: anchor.useful }];
  const irrigationEvents = [];
  let water = anchor.useful;
  let d = dayAfter(startDay, 1);
  while (d <= end) {
    const irr = round1((executed.get(d) || 0) * efficiency);
    const rain = obs?.byDay.get(d)?.rain ?? 0;
    const eto = obs?.byDay.get(d)?.eto ?? obs?.meanEto ?? DEFAULT_ETO_MM;
    const etc = kc != null ? round1(eto * kc) : 0;
    let next = water + irr + rain - etc;
    if (taw != null && next > taw) next = taw; // excedente = drenaje
    if (next < 0) next = 0; // suelo del ancla nunca baja del punto de marchitez
    water = round1(next);
    if (irr > 0) irrigationEvents.push({ date: d, mm: irr });
    history.push({ date: d, mm: water });
    d = dayAfter(d, 1);
  }

  // ---- Persistencia: un estado calculado por día ----
  let persist = null;
  const lastPersistedDay = stateRecs.length ? isoDay(new Date(stateRecs[0].timestamp)) : null;
  if (justInitialized || lastPersistedDay !== end) {
    persist = {
      lot_id: lot.id,
      timestamp: new Date().toISOString(),
      profile_water_mm: round1(wilting + water),
      source: justInitialized ? anchor.source : 'calculated',
      model_version: MODEL_VERSION,
    };
  }

  // ---- Programados del lote (futuro) con eficiencia del modelo ----
  const scheduledMap = ctx.scheduled.get(lot.id) || new Map();
  const scheduledEvents = [...scheduledMap.entries()]
    .map(([date, mm]) => ({ date, mm: round1(mm * efficiency) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    lot, profile, config, model,
    efficiency,
    currentUsefulMm: water,
    currentStoredMm: round1(wilting + water),
    state_source: justInitialized ? anchor.source : 'calculated',
    origin: anchor.source,
    anchored_at: end,
    history: withHistory ? history : null,
    events: { irrigation: irrigationEvents, scheduled: scheduledEvents },
    forecast_status: 'ok',
    persist,
  };
}

export const lotWaterStateService = {
  // Map<lot_id, estado calculado> — reconstrucción y persistencia.
  // withHistory incluye la serie diaria pasada (para el gráfico).
  async getLotStates(lots, { withHistory = false } = {}) {
    const ctx = await loadContext(lots);
    const results = await Promise.all(lots.map(l => computeLot(l, ctx, withHistory)));
    const toCreate = results.map(r => r.persist).filter(Boolean);
    if (toCreate.length) await base44.entities.LotWaterState.bulkCreate(toCreate).catch(() => {});
    return new Map(lots.map((l, i) => [l.id, results[i]]));
  },

  // Inicialización manual del estado del lote (mm de agua útil).
  // Persiste el punto de partida; a partir de ahí el estado evoluciona
  // solo con los eventos del lote.
  async initializeManual(lotId, usefulMm) {
    const profiles = await base44.entities.SoilProfile.filter({ lot_id: lotId });
    const profile = profiles[0];
    if (!profile) throw new Error('El lote no tiene perfil de suelo configurado.');
    const config = await soilWaterService.getProfileConfig(profile);
    const stored = round1((config?.wilting_storage_mm || 0) + usefulMm);
    await base44.entities.SoilProfile.update(profile.id, { manual_initial_water_mm: usefulMm });
    return base44.entities.LotWaterState.create({
      lot_id: lotId,
      timestamp: new Date().toISOString(),
      profile_water_mm: stored,
      source: 'manual_adjustment',
      model_version: MODEL_VERSION,
    });
  },

  // Inicialización desde la sonda de referencia del modelo de suelo del
  // lote (estimación inicial única; luego el estado evoluciona solo).
  async initializeFromReferenceProbe(lotId) {
    const profiles = await base44.entities.SoilProfile.filter({ lot_id: lotId });
    const profile = profiles[0];
    if (!profile) throw new Error('El lote no tiene perfil de suelo configurado.');
    const models = await soilBehaviorService.getModels();
    const model = soilBehaviorService.getModelForProfile(profile, models);
    if (!model?.reference_probe_id) throw new Error('El lote no tiene modelo de suelo con sonda de referencia — vinculá uno en Water & Energy → Configuración.');
    const probeState = await soilWaterService.getProbeWaterState(model.reference_probe_id);
    if (!probeState || probeState.missing || probeState.current_available_water_mm == null) {
      throw new Error('La sonda de referencia no tiene lecturas suficientes para estimar el estado inicial.');
    }
    const config = await soilWaterService.getProfileConfig(profile);
    const stored = round1((config?.wilting_storage_mm || 0) + probeState.current_available_water_mm);
    await base44.entities.SoilProfile.update(profile.id, { manual_initial_water_mm: null });
    return base44.entities.LotWaterState.create({
      lot_id: lotId,
      timestamp: new Date().toISOString(),
      profile_water_mm: stored,
      source: 'initialized',
      model_version: MODEL_VERSION,
    });
  },
};