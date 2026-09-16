import { base44 } from '@/api/base44Client';
import { sensorService } from './sensorService';
import { weatherService } from './weatherService';
import { energyService } from './energyService';
import { irrigationRecommendationService } from './irrigationRecommendationService';
import { mmOfVwc, runScenario } from './engine/waterBalanceEngine';

// ============================================================
// soilWaterService — agua del perfil de suelo a partir de sondas.
// Convierte lecturas VWC por profundidad en mm de agua de la zona
// radicular, ponderando el espesor de suelo que representa cada
// sensor (límites a mitad de camino entre profundidades).
// La UI consulta resultados: NUNCA calcula.
// ESTIMACIÓN EXPERIMENTAL — no reemplaja criterio agronómico.
// ============================================================
const DAY_MS = 86400000;
const round1 = n => Math.round(n * 10) / 10;
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Perfil de respaldo si el lote no tiene SoilProfile configurado
const DEFAULT_PROFILE = {
  name: 'Perfil estimado',
  root_zone_depth_cm: 120,
  field_capacity_vwc: 0.30,
  wilting_point_vwc: 0.12,
  target_min_vwc: 0.17,
  target_max_vwc: 0.25,
};

// Espesor de suelo (cm) que representa cada sensor dentro de la zona
// radicular: límites a mitad de camino entre sensores consecutivos.
function layerSplit(depths, rootDepth) {
  const inside = depths.filter(d => d <= rootDepth);
  const layers = inside.map((d, i) => {
    const top = i === 0 ? 0 : (inside[i - 1] + d) / 2;
    const next = inside[i + 1] != null ? inside[i + 1] : rootDepth;
    const bottom = Math.min(rootDepth, next);
    return Math.max(0, bottom - top);
  });
  return { inside, layers };
}

// Estado hídrico del perfil a partir de las últimas lecturas de la sonda.
// Orden-agnóstico: conserva el valor más reciente por canal.
function buildState(lot, rawProfile, channels, readings, weatherDays, pumps, tariffs) {
  const depths = channels.map(c => c.depth_cm).sort((a, b) => a - b);
  // Profundidad efectiva: zona radicular del perfil, recortada al alcance de la sonda
  const rootDepth = Math.min(rawProfile.root_zone_depth_cm || 120, Math.max(...depths));
  const profile = { ...rawProfile, root_zone_depth_cm: rootDepth };
  const { inside, layers } = layerSplit(depths, rootDepth);

  // Último valor por profundidad (VWC fracción)
  const latest = new Map();
  let lastTs = -Infinity;
  let lastSource = 'MANUAL';
  for (const r of readings || []) {
    const ch = channels.find(c => c.id === r.probe_channel_id);
    if (!ch) continue;
    const t = new Date(r.timestamp).getTime();
    if (t > lastTs) { lastTs = t; lastSource = r.source || 'MANUAL'; }
    const cur = latest.get(ch.depth_cm);
    if (!cur || t > cur.t) latest.set(ch.depth_cm, { t, v: r.value / 100 });
  }

  // Agua almacenada en la zona radicular (mm)
  let currentMm = 0;
  inside.forEach((d, i) => { currentMm += (latest.get(d)?.v || 0) * layers[i] * 10; });
  currentMm = round1(currentMm);

  const wpMm = round1(mmOfVwc(profile.wilting_point_vwc, rootDepth));
  const fcMm = round1(mmOfVwc(profile.field_capacity_vwc, rootDepth));
  const tMinMm = round1(mmOfVwc(profile.target_min_vwc, rootDepth));
  const tMaxMm = round1(mmOfVwc(profile.target_max_vwc, rootDepth));
  const pct = fcMm > wpMm ? Math.max(0, Math.min(100, Math.round(((currentMm - wpMm) / (fcMm - wpMm)) * 100))) : null;
  const deficitMm = round1(Math.max(0, tMaxMm - currentMm));
  const status = currentMm < tMinMm ? 'RECARGAR' : currentMm >= tMaxMm ? 'LLENO' : 'ÓPTIMO';
  const currentVwc = currentMm / (rootDepth * 10);

  // Escenarios a 7 días con el pronóstico meteorológico de la finca
  const inputs = (weatherDays || []).map(w => ({ date: w.date, etcMm: w.etc_mm, rainMm: w.effective_rainfall_mm }));
  const scenarioA = inputs.length ? runScenario(profile, currentVwc, inputs) : [];
  const { recommendation, scenarioB } = irrigationRecommendationService.withRecommendation(profile, lot, currentVwc, inputs, scenarioA);
  const pump = energyService.getPumpForLot(pumps, lot, profile);
  const tariff = energyService.getActiveTariff(tariffs);
  const energy = recommendation ? energyService.compute(recommendation.recommended_irrigation_m3, pump, tariff) : null;
  const hit = scenarioA.find(p => p.vwc < profile.target_min_vwc);

  return {
    rootDepth,
    depths: inside,
    currentMm,
    pct,
    deficitMm,
    status,
    thresholds: { wpMm, fcMm, tMinMm, tMaxMm },
    nextIrrigation: hit ? { days: hit.day, date: hit.date } : null,
    scenarioA,
    scenarioB,
    recommendation,
    energy,
    pump,
    tariff,
    lastReadingAt: lastTs > -Infinity ? new Date(lastTs).toISOString() : null,
    source: lastSource,
    experimental: !rawProfile.id,
  };
}

// Estado de un punto (compartido por listado, detalle y getters)
async function stateForPoint(point, lots, profiles, pumps, tariffs, weatherMap) {
  const lot = lots.find(l => l.id === point.lot_id);
  if (!lot) return { point, missing: 'El lote del punto ya no existe.' };
  const probe = (await sensorService.getProbesForMonitoringPoint(point.id))[0];
  if (!probe) return { point, lot, lotName: lot.name, missing: 'Sin sonda asociada.' };
  const channels = await sensorService.getProbeChannels(probe.id);
  if (!channels.length) return { point, lot, lotName: lot.name, missing: 'Sonda sin canales configurados.' };
  const readings = await base44.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 200);
  if (!readings.length) return { point, lot, lotName: lot.name, missing: 'Sin lecturas cargadas.' };
  const profile = profiles.find(p => p.lot_id === lot.id) || { ...DEFAULT_PROFILE };
  const state = buildState(lot, profile, channels, readings, weatherMap.get(lot.id) || [], pumps, tariffs);
  return { point, lot, lotName: lot.name, probeName: probe.name, ...state };
}

export const soilWaterService = {
  // ---- Listado de puntos de monitoreo (pantalla principal) ----
  async getPointSummaries() {
    const [points, lots, profiles, pumps, tariffs] = await Promise.all([
      sensorService.getMonitoringPoints(),
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const weatherMap = await weatherService.getFarmForecast(lots);
    const summaries = [];
    for (const point of points) {
      summaries.push(await stateForPoint(point, lots, profiles, pumps, tariffs, weatherMap));
    }
    return summaries;
  },

  // ---- Detalle completo de un punto (pantalla de decisión de riego) ----
  async getPointAnalysis(pointId) {
    const points = await sensorService.getMonitoringPoints();
    const point = points.find(p => p.id === pointId);
    if (!point) return null;
    const [lots, profiles, pumps, tariffs] = await Promise.all([
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const lot = lots.find(l => l.id === point.lot_id);
    const probe = lot ? (await sensorService.getProbesForMonitoringPoint(pointId))[0] : null;
    if (!lot || !probe) return { point, lot: lot || null, missing: 'El punto de monitoreo no tiene sonda asociada.' };
    const [channels, readings, weatherMap] = await Promise.all([
      sensorService.getProbeChannels(probe.id),
      sensorService.getProbeReadings(probe.id, Date.now() - 95 * DAY_MS, Date.now()),
      weatherService.getFarmForecast([lot]),
    ]);
    if (!channels.length) return { point, lot, missing: 'La sonda no tiene canales configurados.' };
    const profile = profiles.find(p => p.lot_id === lot.id) || { ...DEFAULT_PROFILE };
    const state = buildState(lot, profile, channels, readings, weatherMap.get(lot.id) || [], pumps, tariffs);
    const { inside, layers } = layerSplit(channels.map(c => c.depth_cm).sort((a, b) => a - b), state.rootDepth);

    // ---- Historial: agua total de la zona radicular por timestamp ----
    const depthByChannel = new Map(channels.map(c => [c.id, c.depth_cm]));
    const byTs = new Map();
    for (const r of readings) {
      const d = depthByChannel.get(r.probe_channel_id);
      if (d == null) continue;
      const t = new Date(r.timestamp).getTime();
      if (!byTs.has(t)) byTs.set(t, new Map());
      byTs.get(t).set(d, r.value / 100);
    }
    const history = [];
    byTs.forEach((vals, t) => {
      if (vals.size < inside.length) return; // timestamp incompleto
      let mm = 0;
      inside.forEach((d, i) => { mm += (vals.get(d) || 0) * layers[i] * 10; });
      history.push({ t, mm: round1(mm) });
    });
    history.sort((a, b) => a.t - b.t);

    // ---- Forecast 7 días: agua TOTAL de la zona radicular (no por profundidad) ----
    const todayIso = isoDay(new Date());
    const forecastA = [{ date: todayIso, mm: state.currentMm }, ...state.scenarioA.map(p => ({ date: p.date, mm: round1(mmOfVwc(p.vwc, state.rootDepth)) }))];
    const forecastB = [{ date: todayIso, mm: state.currentMm }, ...state.scenarioB.map(p => ({ date: p.date, mm: round1(mmOfVwc(p.vwc, state.rootDepth)) }))];

    // ---- Eventos: riegos del lote + lluvia observada de la finca ----
    const programs = await base44.entities.IrrigationProgram.list();
    const irrigationEvents = [...new Set(programs.filter(p => (p.lot_ids || []).includes(lot.id) && p.date).map(p => p.date))].sort();
    const farms = await base44.entities.Farm.list();
    const farm = farms.find(f => f.name === lot.farm);
    const obs = farm ? await weatherService.getObservedWeather(farm.id, 500) : [];
    const rainByDay = new Map();
    obs.forEach(o => {
      if (o.rainfall_mm > 0) {
        const d = o.timestamp.slice(0, 10);
        rainByDay.set(d, round1((rainByDay.get(d) || 0) + o.rainfall_mm));
      }
    });
    const rainEvents = [...rainByDay.entries()].map(([date, mm]) => ({ date, mm })).sort((a, b) => a.date.localeCompare(b.date));

    return {
      point,
      lot,
      probe,
      channels,
      readings,
      profile: profile.id ? profile : null,
      ...state,
      history,
      forecastA,
      forecastB,
      events: { irrigation: irrigationEvents, rain: rainEvents },
    };
  },

  // ---- Getores conceptuales por lote (consultados por la UI, nunca calculados en componentes) ----
  async _lotState(lotId) {
    const [points, lots, profiles, pumps, tariffs] = await Promise.all([
      sensorService.getMonitoringPoints(lotId),
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const point = points[0];
    if (!point) return null;
    const weatherMap = await weatherService.getFarmForecast(lots);
    return stateForPoint(point, lots, profiles, pumps, tariffs, weatherMap);
  },
  async getRootZoneWater(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? { currentMm: s.currentMm, rootDepthCm: s.rootDepth, ...s.thresholds } : null;
  },
  async getAvailableWaterPercent(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.pct : null;
  },
  async getWaterDeficitMm(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.deficitMm : null;
  },
  async getRechargeThreshold(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.thresholds.tMinMm : null;
  },
};