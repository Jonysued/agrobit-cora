import { base44 } from '@/api/base44Client';
import { sensorService } from './sensorService';
import { weatherService } from './weatherService';

// ============================================================
// soilWaterService — CÁLCULO DEL ESTADO HÍDRICO ACTUAL del perfil
// de suelo, centrado en SONDA. SOLO MONITOREO (sin recomendaciones).
//
// Motor:
//  1. Cada sensor representa un segmento del perfil. Los límites
//     entre sensores consecutivos son los PUNTOS MEDIOS
//     (d_actual + d_siguiente) / 2 → segmentos continuos, sin
//     solapamiento, huecos ni doble contabilización. El sensor
//     más profundo se extiende en forma simétrica: nunca se
//     extrapola humedad por debajo de la zona medida.
//  2. root_zone_depth_cm SIEMPRE conserva la profundidad radicular
//     configurada (no se recorta a la sonda). La cobertura de la
//     sonda se reporta aparte: measured_profile_depth_cm +
//     coverage_status (complete / partial / insufficient).
//  3. Cada segmento se cruza con las SoilLayer del perfil
//     (división matemática cuando un segmento atraviesa dos
//     capas). Sin capas configuradas se usan TEMPORALMENTE los
//     valores generales del perfil (uniform_profile = true).
//  4. Dos indicadores sobre la MISMA integración de segmentos:
//     AGUA ÚTIL (por encima del punto de marchitez) para umbrales,
//     déficit y recomendación, y AGUA TOTAL DEL PERFIL (mm de agua
//     almacenada) como indicador principal de monitoreo, con todos
//     los umbrales convertidos a esa escala de almacenamiento.
//  5. Sin invención silenciosa: si falta configuración obligatoria
//     se devuelve configuration_status = "incomplete" +
//     missing_configuration, sin resultados aparentemente reales.
//
// ESTIMACIÓN EXPERIMENTAL — no reemplaza criterio agronómico.
// ============================================================
const DAY_MS = 86400000;
const round1 = n => Math.round(n * 10) / 10;

// Etiquetas de la configuración faltante (para la UI)
export const CONFIG_LABELS = {
  soil_profile: 'perfil de suelo',
  root_zone_depth: 'profundidad radicular',
  field_capacity: 'capacidad de campo',
  wilting_point: 'punto de marchitez',
  management_allowed_depletion: 'agotamiento permitido (MAD)',
  target_refill: 'objetivo de recarga',
};

const CORE = [
  ['root_zone_depth', 'root_zone_depth_cm'],
  ['field_capacity', 'field_capacity_vwc'],
  ['wilting_point', 'wilting_point_vwc'],
];
const OPTIONAL = [
  ['management_allowed_depletion', 'management_allowed_depletion_percent'],
  ['target_refill', 'target_refill_percent'],
];

// Configuración faltante del perfil (obligatoria + opcional)
function missingConfiguration(profile) {
  if (!profile) return ['soil_profile'];
  const missing = [];
  for (const [key, field] of CORE) if (profile[field] == null) missing.push(key);
  for (const [key, field] of OPTIONAL) if (profile[field] == null) missing.push(key);
  return missing;
}

// ---- SoilLayers del perfil; sin capas → perfil uniforme temporal ----
async function getLayersFor(profile) {
  if (!profile?.id) return { layers: [], uniform_profile: true };
  const layers = await base44.entities.SoilLayer.filter({ soil_profile_id: profile.id });
  if (layers.length) {
    return { layers: layers.sort((a, b) => a.depth_top_cm - b.depth_top_cm), uniform_profile: false };
  }
  // Fallback TEMPORAL: valores generales del perfil en toda la zona radicular
  return {
    layers: [{
      depth_top_cm: 0,
      depth_bottom_cm: profile.root_zone_depth_cm,
      field_capacity_vwc: profile.field_capacity_vwc,
      wilting_point_vwc: profile.wilting_point_vwc,
    }],
    uniform_profile: true,
  };
}

// ---- Segmentos representados por cada sensor (puntos medios) ----
function sensorSegments(depths, rootDepth) {
  const segs = [];
  for (let i = 0; i < depths.length; i++) {
    const top = i === 0 ? 0 : (depths[i - 1] + depths[i]) / 2;
    const bottom = i < depths.length - 1
      ? (depths[i] + depths[i + 1]) / 2
      : depths[i] + (depths[i] - top); // extensión simétrica del sensor más profundo
    const cTop = Math.max(0, top);
    const cBottom = Math.min(rootDepth, bottom);
    if (cBottom - cTop > 0) {
      segs.push({ sensor_depth_cm: depths[i], depth_top_cm: round1(cTop), depth_bottom_cm: round1(cBottom) });
    }
  }
  return segs;
}

function coverageStatus(rootDepth, measuredDepth) {
  if (measuredDepth <= 0) return 'insufficient';
  // "complete" SOLO si la cobertura medida alcanza toda la
  // profundidad radicular configurada (root_zone_depth_cm).
  if (measuredDepth >= rootDepth) return 'complete';
  // No cubre todo el perfil: "partial" si la cobertura es representativa,
  // "insufficient" si es claramente insuficiente para el perfil.
  const ratio = measuredDepth / rootDepth;
  if (ratio >= 0.5) return 'partial';
  return 'insufficient';
}

// ---- Cruce segmento del sensor × SoilLayer (división matemática) ----
function splitSegmentWithLayers(seg, layers) {
  const parts = [];
  for (const L of layers) {
    const top = Math.max(seg.depth_top_cm, L.depth_top_cm);
    const bottom = Math.min(seg.depth_bottom_cm, L.depth_bottom_cm);
    if (bottom - top <= 0) continue;
    parts.push({ layer: L, depth_top_cm: round1(top), depth_bottom_cm: round1(bottom) });
  }
  return parts;
}

// ---- Última VWC por profundidad + timestamp/origen más reciente ----
function latestReadings(channels, readings) {
  const byDepth = new Map();
  let lastTs = -Infinity;
  let lastSource = 'MANUAL';
  for (const r of readings || []) {
    const ch = channels.find(c => c.id === r.probe_channel_id);
    if (!ch) continue;
    const t = new Date(r.timestamp).getTime();
    if (t > lastTs) { lastTs = t; lastSource = r.source || 'MANUAL'; }
    const cur = byDepth.get(ch.depth_cm);
    if (!cur || t > cur.t) byDepth.set(ch.depth_cm, { t, v: r.value / 100 });
  }
  return { byDepth, lastTs, lastSource };
}

// ---- ESTADO HÍDRICO ACTUAL (núcleo del cálculo) ----
async function buildState(profile, channels, readings) {
  const missing_configuration = missingConfiguration(profile);
  const coreOk = !missing_configuration.some(k => k === 'soil_profile' || CORE.some(([key]) => key === k));
  if (!coreOk) {
    // Configuración obligatoria faltante: SIN resultados aparentemente reales
    return {
      configuration_status: 'incomplete',
      missing_configuration,
      uniform_profile: null,
      root_zone_depth_cm: profile?.root_zone_depth_cm ?? null,
      measured_profile_depth_cm: null,
      coverage_status: null,
      current_available_water_mm: null,
      total_available_water_capacity_mm: null,
      total_profile_water_mm: null,
      wilting_storage_mm: null,
      field_capacity_storage_mm: null,
      recharge_storage_mm: null,
      target_storage_mm: null,
      available_water_percent: null,
      recharge_threshold_mm: null,
      target_water_mm: null,
      water_deficit_mm: null,
      status: null,
      currentVwc: null,
      lastReadingAt: null,
      source: null,
      layer_breakdown: null,
      _model: null,
    };
  }

  // La profundidad radicular SIEMPRE es la configurada — nunca se recorta
  const rootDepth = profile.root_zone_depth_cm;
  const { layers, uniform_profile } = await getLayersFor(profile);
  const depths = [...new Set(channels.map(c => c.depth_cm))].filter(d => d <= rootDepth).sort((a, b) => a - b);
  const { byDepth, lastTs, lastSource } = latestReadings(channels, readings);
  const segs = sensorSegments(depths, rootDepth);
  const measuredDepth = segs.length ? segs[segs.length - 1].depth_bottom_cm : 0;

  // Desglose auditable (sensor × capa) y sumas de AGUA ÚTIL
  const layer_breakdown = [];
  let currentAvailableMm = 0;
  let tawMm = 0;
  let measuredWaterMm = 0;
  let wiltingStorageMm = 0;
  let fcStorageMm = 0;
  for (const seg of segs) {
    const theta = byDepth.get(seg.sensor_depth_cm)?.v;
    if (theta == null) continue; // profundidad sin lectura: no se contabiliza
    for (const part of splitSegmentWithLayers(seg, layers)) {
      const thicknessMm = (part.depth_bottom_cm - part.depth_top_cm) * 10;
      const fc = part.layer.field_capacity_vwc;
      const wp = part.layer.wilting_point_vwc;
      const availableMm = Math.max(0, (theta - wp) * thicknessMm);
      const totalMm = (fc - wp) * thicknessMm;
      currentAvailableMm += availableMm;
      tawMm += totalMm;
      measuredWaterMm += theta * thicknessMm;
      wiltingStorageMm += wp * thicknessMm;
      fcStorageMm += fc * thicknessMm;
      layer_breakdown.push({
        depth_top_cm: part.depth_top_cm,
        depth_bottom_cm: part.depth_bottom_cm,
        thickness_cm: round1(part.depth_bottom_cm - part.depth_top_cm),
        sensor_depth_cm: seg.sensor_depth_cm,
        current_vwc: theta,
        field_capacity_vwc: fc,
        wilting_point_vwc: wp,
        available_water_mm: round1(availableMm),
        total_available_water_mm: round1(totalMm),
        profile_water_mm: round1(theta * thicknessMm),
      });
    }
  }

  // Umbral de recarga / objetivo / déficit — sin parámetros, sin invención
  const mad = profile.management_allowed_depletion_percent;
  const refill = profile.target_refill_percent;
  const rechargeMm = mad != null ? round1(tawMm * (1 - mad / 100)) : null;
  const targetMm = refill != null ? round1(tawMm * refill / 100) : null;
  const deficitMm = targetMm != null ? round1(Math.max(0, targetMm - currentAvailableMm)) : null;

  // Escala de ALMACENAMIENTO (mm de agua total del perfil): mismos
  // umbrales convertidos a la escala del agua física almacenada.
  // total_profile_water_mm = SUM(theta × espesor) — sin promedios.
  const totalProfileMm = round1(measuredWaterMm);
  const wiltingStorage = round1(wiltingStorageMm);
  const fcStorage = round1(fcStorageMm);
  const rechargeStorage = rechargeMm != null ? round1(wiltingStorageMm + rechargeMm) : null;
  const targetStorage = targetMm != null ? round1(wiltingStorageMm + targetMm) : null;

  let status = null;
  if (rechargeMm != null) {
    status = currentAvailableMm < rechargeMm ? 'RECARGAR' : (targetMm != null && currentAvailableMm >= targetMm) ? 'LLENO' : 'ÓPTIMO';
  }

  return {
    configuration_status: missing_configuration.length ? 'incomplete' : 'complete',
    missing_configuration,
    uniform_profile,
    root_zone_depth_cm: rootDepth,
    measured_profile_depth_cm: measuredDepth,
    coverage_status: coverageStatus(rootDepth, measuredDepth),
    current_available_water_mm: round1(currentAvailableMm),
    total_available_water_capacity_mm: round1(tawMm),
    total_profile_water_mm: totalProfileMm,
    wilting_storage_mm: wiltingStorage,
    field_capacity_storage_mm: fcStorage,
    recharge_storage_mm: rechargeStorage,
    target_storage_mm: targetStorage,
    available_water_percent: tawMm > 0 ? round1((currentAvailableMm / tawMm) * 100) : null,
    recharge_threshold_mm: rechargeMm,
    target_water_mm: targetMm,
    water_deficit_mm: deficitMm,
    status,
    currentVwc: measuredDepth > 0 ? round1((measuredWaterMm / (measuredDepth * 10)) * 1000) / 1000 : null,
    lastReadingAt: lastTs > -Infinity ? new Date(lastTs).toISOString() : null,
    source: lastSource,
    layer_breakdown,
    // Modelo interno (segmentos × capas) — auditoría e historial
    _model: { segs, layers, depths, rootDepth, measuredDepth },
  };
}

// Estado de una sonda (compartido por listado, detalle, forecast y getters)
async function stateForProbe(probe, lots, profiles) {
  const lot = probe.lot_id ? lots.find(l => l.id === probe.lot_id) : null;
  if (!lot) {
    return { probe, probeId: probe.id, lotName: 'Sin lote vinculado', missing: 'Sonda sin lote vinculado — vinculá el lote en Water & Energy → Configuración → Vinculación de perfiles.' };
  }
  const channels = await sensorService.getProbeChannels(probe.id);
  if (!channels.length) return { probe, probeId: probe.id, lot, lotName: lot.name, missing: 'Sonda sin canales/profundidades configurados.' };
  const readings = await base44.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 200);
  if (!readings.length) return { probe, probeId: probe.id, lot, lotName: lot.name, missing: 'Sin lecturas — la sonda todavía no reporta datos.' };
  const profile = profiles.find(p => p.lot_id === lot.id) || null;
  const state = await buildState(profile, channels, readings);
  return { probe, probeId: probe.id, lot, lotName: lot.name, probeProvider: probe.provider, connectionStatus: probe.connection_status, ...state };
}

// Serie temporal de agua ÚTIL (mm) en la zona radicular medida
function usefulWaterSeries(readings, channels, model) {
  const { segs, layers, depths } = model;
  const depthByChannel = new Map(channels.map(c => [c.id, c.depth_cm]));
  const byTs = new Map();
  for (const r of readings) {
    const d = depthByChannel.get(r.probe_channel_id);
    if (d == null) continue;
    const t = new Date(r.timestamp).getTime();
    if (!byTs.has(t)) byTs.set(t, new Map());
    byTs.get(t).set(d, r.value / 100);
  }
  const series = [];
  byTs.forEach((vals, t) => {
    if (!depths.every(d => vals.has(d))) return; // timestamp incompleto
    let useful = 0;
    let profile = 0;
    for (const seg of segs) {
      const theta = vals.get(seg.sensor_depth_cm);
      for (const part of splitSegmentWithLayers(seg, layers)) {
        const th = (part.depth_bottom_cm - part.depth_top_cm) * 10;
        useful += Math.max(0, (theta - part.layer.wilting_point_vwc) * th);
        profile += theta * th;
      }
    }
    series.push({ t, mm: round1(useful), profile: round1(profile) });
  });
  return series.sort((a, b) => a.t - b.t);
}

export const soilWaterService = {
  // ---- Configuración estática del perfil (SIN sonda) ----
  // Capacidad útil (TAW), agua almacenada en marchitez / capacidad de
  // campo y umbrales derivados (recarga, objetivo), calculados SOLO
  // con el perfil y sus capas. Es la base del modelo de lote: la sonda
  // de referencia ya no define el estado hídrico del lote.
  async getProfileConfig(profile) {
    const missing_configuration = missingConfiguration(profile);
    const coreOk = !missing_configuration.some(k => k === 'soil_profile' || CORE.some(([key]) => key === k));
    if (!coreOk || !profile) {
      return {
        configuration_status: 'incomplete',
        missing_configuration: missing_configuration.length ? missing_configuration : ['soil_profile'],
        root_zone_depth_cm: profile?.root_zone_depth_cm ?? null,
        total_available_water_capacity_mm: null,
        wilting_storage_mm: null,
        field_capacity_storage_mm: null,
        recharge_threshold_mm: null,
        target_water_mm: null,
        recharge_storage_mm: null,
        target_storage_mm: null,
      };
    }
    const { layers } = await getLayersFor(profile);
    const rootDepth = profile.root_zone_depth_cm;
    let tawMm = 0, wiltingMm = 0, fcMm = 0;
    for (const L of layers) {
      const top = Math.max(0, L.depth_top_cm);
      const bottom = Math.min(rootDepth, L.depth_bottom_cm);
      const thicknessMm = (bottom - top) * 10;
      if (thicknessMm <= 0) continue;
      tawMm += (L.field_capacity_vwc - L.wilting_point_vwc) * thicknessMm;
      wiltingMm += L.wilting_point_vwc * thicknessMm;
      fcMm += L.field_capacity_vwc * thicknessMm;
    }
    const mad = profile.management_allowed_depletion_percent;
    const refill = profile.target_refill_percent;
    const rechargeMm = mad != null ? round1(tawMm * (1 - mad / 100)) : null;
    const targetMm = refill != null ? round1(tawMm * refill / 100) : null;
    return {
      configuration_status: missing_configuration.length ? 'incomplete' : 'complete',
      missing_configuration,
      root_zone_depth_cm: rootDepth,
      total_available_water_capacity_mm: round1(tawMm),
      wilting_storage_mm: round1(wiltingMm),
      field_capacity_storage_mm: round1(fcMm),
      recharge_threshold_mm: rechargeMm,
      target_water_mm: targetMm,
      recharge_storage_mm: rechargeMm != null ? round1(wiltingMm + rechargeMm) : null,
      target_storage_mm: targetMm != null ? round1(wiltingMm + targetMm) : null,
    };
  },

  // ---- Estado de UNA sonda puntual (referencia de un modelo de
  //      suelo / pantalla Sensores). NUNCA representa la humedad de
  //      un lote: es la medición de esa sonda. ----
  async getProbeWaterState(probeId) {
    const [probes, lots, profiles] = await Promise.all([
      base44.entities.SoilProbe.list(),
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
    ]);
    const probe = probes.find(p => p.id === probeId);
    if (!probe) return null;
    return stateForProbe(probe, lots, profiles);
  },

  // ---- Listado de sondas (pantalla Sensores) ----
  async getProbeSummaries() {
    const [probes, lots, profiles] = await Promise.all([
      sensorService.getProbes(),
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
    ]);
    // En paralelo: cada sonda pide canales + lecturas — sin esperas
    // secuenciales que multiplican la latencia de la pantalla.
    return Promise.all(probes.filter(p => p.active !== false).map(p => stateForProbe(p, lots, profiles)));
  },

  // ---- Detalle completo de una sonda (solo monitoreo) ----
  async getProbeAnalysis(probeId) {
    const probes = await sensorService.getProbes();
    const probe = probes.find(p => p.id === probeId);
    if (!probe) return null;
    const [lots, profiles] = await Promise.all([base44.entities.Lot.list(), base44.entities.SoilProfile.list()]);
    const lot = probe.lot_id ? lots.find(l => l.id === probe.lot_id) : null;
    if (!lot) return { probe, lot: null, missing: 'Sonda sin lote vinculado — vinculá el lote en Water & Energy → Configuración → Vinculación de perfiles.' };
    const [channels, readings] = await Promise.all([
      sensorService.getProbeChannels(probe.id),
      sensorService.getProbeReadings(probe.id, Date.now() - 95 * DAY_MS, Date.now()),
    ]);
    if (!channels.length) return { probe, lot, missing: 'La sonda no tiene canales configurados.' };
    const profile = profiles.find(p => p.lot_id === lot.id) || null;
    const state = await buildState(profile, channels, readings);
    const history = state._model ? usefulWaterSeries(readings, channels, state._model) : [];

    // ---- Eventos de contexto: riegos del lote + lluvia observada ----
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
      probe,
      lot,
      channels,
      readings,
      profile,
      ...state,
      history,
      events: { irrigation: irrigationEvents, rain: rainEvents },
    };
  },

  // ---- Estados de las sondas vinculadas a perfiles por lote ----
  // Map<lot_id, estado> — lo consulta el forecast para usar la humedad
  // real de la sonda vinculada al perfil (Configuración → Vinculación).
  async getLinkedProbeStates(lotIds) {
    const [lots, profiles, probes] = await Promise.all([
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      sensorService.getProbes(),
    ]);
    const pairs = [];
    for (const profile of profiles) {
      if (!profile.probe_id || !lotIds.includes(profile.lot_id)) continue;
      const probe = probes.find(p => p.id === profile.probe_id);
      if (probe) pairs.push([profile.lot_id, stateForProbe(probe, lots, profiles)]);
    }
    return new Map(await Promise.all(pairs.map(async ([k, v]) => [k, await v])));
  },

  // ---- Historial diario de VWC de la zona radicular medida según la
  // sonda vinculada al perfil del lote (Vinculación de perfiles).
  // Devuelve [{date, vwc}] (última lectura de cada día) o null.
  async getLinkedProbeVwcHistory(lotId) {
    const state = await this._lotState(lotId);
    if (!state || state.missing || !state.probe || !state._model) return null;
    const { segs, depths, measuredDepth } = state._model;
    const [channels, readings] = await Promise.all([
      sensorService.getProbeChannels(state.probe.id),
      sensorService.getProbeReadings(state.probe.id, Date.now() - 95 * DAY_MS, Date.now()),
    ]);
    if (!channels.length || !readings.length) return null;
    const depthByChannel = new Map(channels.map(c => [c.id, c.depth_cm]));
    const byTs = new Map();
    for (const r of readings) {
      const d = depthByChannel.get(r.probe_channel_id);
      if (d == null) continue;
      const t = new Date(r.timestamp).getTime();
      if (!byTs.has(t)) byTs.set(t, new Map());
      byTs.get(t).set(d, r.value / 100);
    }
    // Último valor de cada día: VWC promedio de la zona radicular medida
    const byDay = new Map();
    [...byTs.entries()].sort((a, b) => a[0] - b[0]).forEach(([t, vals]) => {
      if (!depths.every(d => vals.has(d))) return;
      let mm = 0;
      for (const seg of segs) mm += vals.get(seg.sensor_depth_cm) * (seg.depth_bottom_cm - seg.depth_top_cm) * 10;
      byDay.set(new Date(t).toISOString().slice(0, 10), mm / (measuredDepth * 10));
    });
    return [...byDay.entries()].map(([date, vwc]) => ({ date, vwc }));
  },

  // ---- Estados hídricos (agua útil) de los lotes indicados ----
  // Map<lot_id, estado>: sonda vinculada al perfil del lote
  // (Vinculación de perfiles) o, en su defecto, la primera sonda
  // activa del lote. Es el insumo del forecast hídrico
  // (waterForecastService): estado inicial en mm de agua útil.
  async getStateForLots(lotIds) {
    const [lots, profiles, probes] = await Promise.all([
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      sensorService.getProbes(),
    ]);
    const pairs = [];
    for (const profile of profiles) {
      if (!lotIds.includes(profile.lot_id)) continue;
      const probe = profile.probe_id
        ? probes.find(p => p.id === profile.probe_id)
        : probes.find(p => p.lot_id === profile.lot_id && p.active !== false);
      if (probe) pairs.push([profile.lot_id, stateForProbe(probe, lots, profiles)]);
    }
    return new Map(await Promise.all(pairs.map(async ([k, v]) => [k, await v])));
  },

  // ---- Historial de AGUA ÚTIL (mm) del lote según su sonda ----
  // Serie [{t, mm}] (últimos ~95 días) para el gráfico de agua en
  // la zona radicular. Devuelve null si no hay sonda o lecturas.
  async getUsefulWaterHistory(lotId) {
    const state = await this._lotState(lotId);
    if (!state || state.missing || !state._model) return null;
    const [channels, readings] = await Promise.all([
      sensorService.getProbeChannels(state.probe.id),
      sensorService.getProbeReadings(state.probe.id, Date.now() - 95 * DAY_MS, Date.now()),
    ]);
    if (!channels.length || !readings.length) return null;
    return usefulWaterSeries(readings, channels, state._model);
  },

  // ---- Estado por lote (sonda vinculada al perfil o primera del lote) ----
  async _lotState(lotId) {
    const [lots, profiles, probes] = await Promise.all([
      base44.entities.Lot.list(),
      base44.entities.SoilProfile.list(),
      sensorService.getProbes(),
    ]);
    const profile = profiles.find(p => p.lot_id === lotId);
    const probe = profile?.probe_id
      ? probes.find(p => p.id === profile.probe_id)
      : probes.find(p => p.lot_id === lotId && p.active !== false);
    if (!probe) return null;
    return stateForProbe(probe, lots, profiles);
  },

  // ---- Getters conceptuales (nuevo motor: agua útil) ----
  async getRootZoneWater(lotId) {
    const s = await this._lotState(lotId);
    if (!s || s.missing || s.current_available_water_mm == null) return null;
    return {
      currentAvailableMm: s.current_available_water_mm,
      tawMm: s.total_available_water_capacity_mm,
      rootZoneDepthCm: s.root_zone_depth_cm,
      measuredProfileDepthCm: s.measured_profile_depth_cm,
    };
  },
  async getAvailableWaterPercent(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.available_water_percent : null;
  },
  async getWaterDeficitMm(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.water_deficit_mm : null;
  },
  async getRechargeThreshold(lotId) {
    const s = await this._lotState(lotId);
    return s && !s.missing ? s.recharge_threshold_mm : null;
  },
};