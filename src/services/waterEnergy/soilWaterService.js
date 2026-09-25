import { backend } from '@/api/backendClient';
import { sensorService } from './sensorService';
import { selectGaritaStation, aggregateGaritaObservations } from './garitaWeather';
import { measuredProbeProfile } from './engine/measuredProbeProfile';

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
const DAILY_LOOKBACK_MS = 2 * 3600000;

// Consultar ayer por fecha: el límite de filas de la API puede cubrir
// apenas unas horas cuando cada lectura trae muchos canales.
async function previousDayReadings(probeId, lastCompleteTs) {
  if (!Number.isFinite(lastCompleteTs)) return [];
  const target = lastCompleteTs - DAY_MS;
  return backend.entities.SensorReading.filter({
    probe_id: probeId,
    timestamp: {
      $gte: new Date(target - DAILY_LOOKBACK_MS).toISOString(),
      $lte: new Date(target).toISOString(),
    },
  }, '-timestamp', 1000);
}
const round1 = n => Math.round(n * 10) / 10;

// Etiquetas de la configuración faltante (para la UI)
export const CONFIG_LABELS = {
  soil_profile: 'perfil de suelo',
  root_zone_depth: 'profundidad radicular',
  field_capacity: 'capacidad de campo',
  wilting_point: 'punto de marchitez',
};

const CORE = [
  ['root_zone_depth', 'root_zone_depth_cm'],
  ['field_capacity', 'field_capacity_vwc'],
  ['wilting_point', 'wilting_point_vwc'],
];
// Configuración faltante del perfil (obligatoria)
function missingConfiguration(profile) {
  if (!profile) return ['soil_profile'];
  const missing = [];
  for (const [key, field] of CORE) if (profile[field] == null) missing.push(key);
  return missing;
}

// ---- SoilLayers del perfil; sin capas → perfil uniforme temporal ----
async function getLayersFor(profile) {
  if (!profile?.id) return { layers: [], uniform_profile: true };
  const layers = await backend.entities.SoilLayer.filter({ soil_profile_id: profile.id });
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

  // PERFIL COMPLETO DE LA SONDA: todas las profundidades medidas, sin
  // recorte a la zona radicular. Tanto el indicador "Agua en el perfil"
  // como el estado hídrico del cultivo (agua útil, umbrales y estado)
  // se calculan sobre TODO el perfil medido (0 → fondo del sensor más
  // profundo, ej. 0–120 cm).
  const allDepths = [...new Set(channels.map(c => c.depth_cm))].sort((a, b) => a - b);
  const fullSegs = sensorSegments(allDepths, Infinity);
  const fullDepth = fullSegs.length ? fullSegs[fullSegs.length - 1].depth_bottom_cm : 0;
  // Capas efectivas extendidas al perfil completo: por debajo de la
  // última capa configurada se usan los valores generales del perfil.
  const lastLayer = layers[layers.length - 1] || null;
  const deepFc = profile.field_capacity_vwc ?? lastLayer?.field_capacity_vwc ?? null;
  const deepWp = profile.wilting_point_vwc ?? lastLayer?.wilting_point_vwc ?? null;
  const fullLayers = fullDepth > (lastLayer?.depth_bottom_cm ?? 0) && deepFc != null && deepWp != null
    ? [...layers, { depth_top_cm: lastLayer?.depth_bottom_cm ?? 0, depth_bottom_cm: fullDepth, field_capacity_vwc: deepFc, wilting_point_vwc: deepWp }]
    : layers;

  // Desglose auditable (sensor × capa) del PERFIL COMPLETO
  const layer_breakdown = [];
  let currentAvailableMm = 0;
  let tawMm = 0;
  let fullWaterMm = 0;
  let fullWiltingMm = 0;
  let fullFcMm = 0;
  for (const seg of fullSegs) {
    const theta = byDepth.get(seg.sensor_depth_cm)?.v;
    if (theta == null) continue; // profundidad sin lectura: no se contabiliza
    for (const part of splitSegmentWithLayers(seg, fullLayers)) {
      const thicknessMm = (part.depth_bottom_cm - part.depth_top_cm) * 10;
      const fc = part.layer.field_capacity_vwc;
      const wp = part.layer.wilting_point_vwc;
      // Agua almacenada del perfil completo (indicador principal, en mm)
      fullWaterMm += theta * thicknessMm;
      fullWiltingMm += wp * thicknessMm;
      fullFcMm += fc * thicknessMm;
      // ESTADO HÍDRICO DEL CULTIVO sobre el perfil completo medido:
      // agua útil y capacidad útil en la misma escala (0–fullDepth).
      const availableMm = Math.max(0, (theta - wp) * thicknessMm);
      const totalMm = (fc - wp) * thicknessMm;
      currentAvailableMm += availableMm;
      tawMm += totalMm;
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

  // Umbral de recarga / objetivo / déficit: derivados de la ZONA
  // OBJETIVO (Target mín / máx) del perfil — sin MAD ni % de recarga.
  const tmin = profile.target_min_vwc;
  const tmax = profile.target_max_vwc;
  const rechargeStorageMm = tmin != null ? round1(tmin * fullDepth * 10) : null;
  const targetStorageMm = tmax != null ? round1(tmax * fullDepth * 10) : null;
  const rechargeMm = rechargeStorageMm != null ? round1(Math.max(0, rechargeStorageMm - fullWiltingMm)) : null;
  const targetMm = targetStorageMm != null ? round1(Math.max(0, targetStorageMm - fullWiltingMm)) : null;
  const deficitMm = targetMm != null ? round1(Math.max(0, targetMm - currentAvailableMm)) : null;

  // Escala de ALMACENAMIENTO del PERFIL COMPLETO (0–fullDepth): el
  // indicador "Agua en el perfil", el estado hídrico del cultivo y sus
  // umbrales (recarga, objetivo, capacidad de campo) en la misma
  // escala de mm almacenados — sin promedios.
  const totalProfileMm = round1(fullWaterMm);
  const wiltingStorage = round1(fullWiltingMm);
  const fcStorage = round1(fullFcMm);
  const rechargeStorage = rechargeStorageMm;
  const targetStorage = targetStorageMm;

  let status = null;
  if (rechargeMm != null) {
    status = currentAvailableMm < rechargeMm ? 'RECARGAR' : (targetMm != null && currentAvailableMm >= targetMm) ? 'LLENO' : 'ÓPTIMO';
  }

  return {
    configuration_status: missing_configuration.length ? 'incomplete' : 'complete',
    missing_configuration,
    uniform_profile,
    root_zone_depth_cm: rootDepth,
    measured_profile_depth_cm: fullDepth,
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
    currentVwc: fullDepth > 0 ? round1((fullWaterMm / (fullDepth * 10)) * 1000) / 1000 : null,
    lastReadingAt: lastTs > -Infinity ? new Date(lastTs).toISOString() : null,
    source: lastSource,
    layer_breakdown,
    // Modelo interno (segmentos × capas) — auditoría e historial
    _model: { segs, layers, depths, rootDepth, measuredDepth, allDepths, fullSegs, fullLayers, fullDepth },
  };
}

// Lotes vinculados a una sonda: la vinculación DIRECTA (probe.lot_id)
// o, a través del MODELO de suelo del que la sonda es referencia, los
// lotes cuyos perfiles usan ese modelo (flujo de "Vinculación de
// perfiles"). Una sonda de referencia puede servir a varios lotes.
export function linkedLotsFor(probe, lots, profiles, models) {
  const modelIds = new Set((models || []).filter(m => m.reference_probe_id === probe.id).map(m => m.id));
  const ids = [...new Set([
    probe.lot_id,
    ...(profiles || []).filter(p => modelIds.has(p.soil_behavior_model_id) || p.probe_id === probe.id).map(p => p.lot_id),
  ].filter(Boolean))];
  const lotsById = new Map(lots.map(l => [l.id, l]));
  return ids.filter(id => lotsById.has(id)).map(id => lotsById.get(id)).sort((a, b) => a.name.localeCompare(b.name));
}

// Lecturas propias de una sonda sin lote: integrar solamente las
// profundidades medidas. No se calculan umbrales ni estado agronómico.
function unlinkedProbeState(probe, channels, readings) {
  const { history, measuredDepth } = measuredProbeProfile(channels, readings);
  const latest = history.at(-1);
  return {
    probe, probeId: probe.id, lot: null, lotName: 'Sin lote vinculado',
    probeProvider: probe.provider, connectionStatus: probe.connection_status,
    configuration_status: 'unlinked', measured_profile_depth_cm: measuredDepth,
    total_profile_water_mm: latest?.profile ?? null,
    lastReadingAt: latest ? new Date(latest.t).toISOString() : null,
    last_signal_ts: latest?.t ?? null,
    source: readings.find(reading => new Date(reading.timestamp).getTime() === latest?.t)?.source || null,
    history,
    daily_change_mm: latest && Date.now() - latest.t <= 26 * 3600000 ? (() => {
      const previous = [...history].reverse().find(h => h.t <= latest.t - DAY_MS);
      return previous ? round1(latest.profile - previous.profile) : null;
    })() : null,
  };
}

// Estado de una sonda (compartido por listado, detalle, forecast y getters)
async function stateForProbe(probe, lots, profiles, models) {
  const linkedLots = linkedLotsFor(probe, lots, profiles, models);
  const lot = linkedLots[0] || null;
  if (!lot) {
    const [channels, readings] = await Promise.all([
      sensorService.getAllProbeChannels(probe.id),
      backend.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 1000),
    ]);
    if (!channels.some(channel => channel.sensor_type === 'soil_moisture')) return { probe, probeId: probe.id, lotName: 'Sin lote vinculado', missing: 'Sonda sin canales de humedad — sincronizá sus lecturas en Configuración → Sensores.' };
    if (!readings.length) return { probe, probeId: probe.id, lotName: 'Sin lote vinculado', missing: 'Sin lecturas — sincronizá la sonda en Configuración → Sensores.' };
    const current = unlinkedProbeState(probe, channels, readings);
    const yesterday = await previousDayReadings(probe.id, current.last_signal_ts);
    return unlinkedProbeState(probe, channels, [...readings, ...yesterday]);
  }
  const lotName = linkedLots.length > 1 ? `${lot.name} (+${linkedLots.length - 1} lotes)` : lot.name;
  const channels = await sensorService.getProbeChannels(probe.id);
  if (!channels.length) return { probe, probeId: probe.id, lot, lotName, missing: 'Sonda sin canales/profundidades configurados.' };
  // El estado actual usa lecturas recientes; ayer se consulta por fecha
  // para no depender de cuántos canales entran en el límite de filas.
  const readings = await backend.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 600);
  if (!readings.length) return { probe, probeId: probe.id, lot, lotName, missing: 'Sin lecturas — la sonda todavía no reporta datos.' };
  const profile = profiles.find(p => p.lot_id === lot.id) || null;
  const state = await buildState(profile, channels, readings);
  // Variación del agua del PERFIL COMPLETO de la sonda (escala Suma de
  // perfil, mm) en las últimas 24 h: último punto completo vs el
  // último punto 24 h antes. Sin un punto ≥ 24 h atrás no hay
  // variación calculable (—).
  let dailyChange = null;
  let lastSignalTs = null;
  if (state._model) {
    const recentHistory = usefulWaterSeries(readings, channels, state._model);
    const last = recentHistory.at(-1);
    lastSignalTs = last?.t ?? null;
    // No calcular una variación diaria con una señal antigua.
    if (last && Date.now() - last.t <= 26 * 3600000) {
      const yesterday = await previousDayReadings(probe.id, last.t);
      const history = usefulWaterSeries([...readings, ...yesterday], channels, state._model);
      const prev = [...history].reverse().find(h => h.t <= last.t - DAY_MS);
      if (prev) dailyChange = round1(last.profile - prev.profile);
    }
  }
  return { probe, probeId: probe.id, lot, lotName, probeProvider: probe.provider, connectionStatus: probe.connection_status, last_signal_ts: lastSignalTs, daily_change_mm: dailyChange, ...state };
}

// Serie temporal de agua ÚTIL (mm) en la zona radicular medida
function usefulWaterSeries(readings, channels, model) {
  const { segs, layers, depths, allDepths, fullSegs, fullLayers } = model;
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
  // Timestamp completo = TODAS las profundidades REALES de la sonda
  // (perfil completo observado). La zona radicular NO recorta la
  // serie: el SoilBehaviorModel aprende de todo el perfil medido.
  const requiredDepths = (allDepths || []).length ? allDepths : depths;
  byTs.forEach((vals, t) => {
    if (!requiredDepths.every(d => vals.has(d))) return; // timestamp incompleto
    // Agua útil de la zona radicular (mm) — base de la calibración del
    // modelo de suelo. La serie de almacenamiento ("profile") integra el
    // PERFIL COMPLETO medido por la sonda (misma escala del indicador).
    let useful = 0;
    let profile = 0;
    for (const seg of segs) {
      const theta = vals.get(seg.sensor_depth_cm);
      for (const part of splitSegmentWithLayers(seg, layers)) {
        const th = (part.depth_bottom_cm - part.depth_top_cm) * 10;
        useful += Math.max(0, (theta - part.layer.wilting_point_vwc) * th);
      }
    }
    for (const seg of fullSegs || []) {
      const theta = vals.get(seg.sensor_depth_cm);
      if (theta == null) continue;
      for (const part of splitSegmentWithLayers(seg, fullLayers || layers)) {
        profile += theta * (part.depth_bottom_cm - part.depth_top_cm) * 10;
      }
    }
    series.push({ t, mm: round1(useful), profile: round1(profile) });
  });
  return series.sort((a, b) => a.t - b.t);
}

// Fondo del perfil de cálculo cuando NO hay sonda de referencia:
// estándar 0–120 cm (independiente de la profundidad radicular).
export const DEFAULT_FULL_PROFILE_DEPTH_CM = 120;

// ---- Fondo del PERFIL COMPLETO medido por una sonda ----
// El sensor más profundo se extiende en forma simétrica (misma
// lógica que sensorSegments para el perfil completo de la sonda):
// sonda Sentek 10–115 cm → fondo 120 cm.
export function fullProfileDepthCm(depths) {
  const ds = [...new Set(depths)].filter(d => d != null).sort((a, b) => a - b);
  if (!ds.length) return null;
  const d = ds[ds.length - 1];
  const top = ds.length > 1 ? (ds[ds.length - 2] + d) / 2 : 0;
  return round1(d + (d - top));
}

// ---- Configuración estática del perfil — función PURA ----
// Capacidad útil (TAW), agua almacenada en marchitez / capacidad de
// campo y umbrales derivados (recarga, objetivo). Integra sobre el
// PERFIL COMPLETO (0–fullDepthCm, ej. 0–120 cm definido por la sonda
// de referencia) cuando fullDepthCm está disponible; sin sonda de
// referencia, sobre el perfil estándar 0–120 cm — JAMÁS sobre la zona
// radicular: la profundidad de la sonda y la radicular son variables
// independientes. Por debajo de la
// última capa configurada se usan los valores generales del perfil.
// Se usa con las capas PRECARGADAS para evitar una consulta a
// SoilLayer por cada perfil.
export function computeProfileConfig(profile, layers = [], fullDepthCm) {
  const missing_configuration = missingConfiguration(profile);
  const coreOk = !missing_configuration.some(k => k === 'soil_profile' || CORE.some(([key]) => key === k));
  if (!coreOk || !profile) {
    return {
      configuration_status: 'incomplete',
      missing_configuration: missing_configuration.length ? missing_configuration : ['soil_profile'],
      root_zone_depth_cm: profile?.root_zone_depth_cm ?? null,
      profile_depth_cm: null,
      total_available_water_capacity_mm: null,
      wilting_storage_mm: null,
      field_capacity_storage_mm: null,
      recharge_threshold_mm: null,
      target_water_mm: null,
      recharge_storage_mm: null,
      target_storage_mm: null,
    };
  }
  const rootDepth = profile.root_zone_depth_cm;
  const profileDepth = fullDepthCm ?? DEFAULT_FULL_PROFILE_DEPTH_CM;
  let effLayers = layers.length
    ? layers.slice().sort((a, b) => a.depth_top_cm - b.depth_top_cm)
    : [{
        depth_top_cm: 0,
        depth_bottom_cm: profileDepth,
        field_capacity_vwc: profile.field_capacity_vwc,
        wilting_point_vwc: profile.wilting_point_vwc,
      }];
  const lastBottom = effLayers[effLayers.length - 1].depth_bottom_cm;
  if (profileDepth > lastBottom && profile.field_capacity_vwc != null && profile.wilting_point_vwc != null) {
    effLayers = [...effLayers, {
      depth_top_cm: lastBottom,
      depth_bottom_cm: profileDepth,
      field_capacity_vwc: profile.field_capacity_vwc,
      wilting_point_vwc: profile.wilting_point_vwc,
    }];
  }
  let tawMm = 0, wiltingMm = 0, fcMm = 0;
  for (const L of effLayers) {
    const top = Math.max(0, L.depth_top_cm);
    const bottom = Math.min(profileDepth, L.depth_bottom_cm);
    const thicknessMm = (bottom - top) * 10;
    if (thicknessMm <= 0) continue;
    tawMm += (L.field_capacity_vwc - L.wilting_point_vwc) * thicknessMm;
    wiltingMm += L.wilting_point_vwc * thicknessMm;
    fcMm += L.field_capacity_vwc * thicknessMm;
  }
  const tmin = profile.target_min_vwc;
  const tmax = profile.target_max_vwc;
  const rechargeMm = tmin != null ? round1(Math.max(0, tmin * profileDepth * 10 - wiltingMm)) : null;
  const targetMm = tmax != null ? round1(Math.max(0, tmax * profileDepth * 10 - wiltingMm)) : null;
  return {
    configuration_status: missing_configuration.length ? 'incomplete' : 'complete',
    missing_configuration,
    root_zone_depth_cm: rootDepth,
    profile_depth_cm: profileDepth,
    total_available_water_capacity_mm: round1(tawMm),
    wilting_storage_mm: round1(wiltingMm),
    field_capacity_storage_mm: round1(fcMm),
    recharge_threshold_mm: rechargeMm,
    target_water_mm: targetMm,
    recharge_storage_mm: rechargeMm != null ? round1(wiltingMm + rechargeMm) : null,
    target_storage_mm: targetMm != null ? round1(wiltingMm + targetMm) : null,
  };
}

export const soilWaterService = {
  // ---- Configuración estática del perfil (SIN sonda) ----
  async getProfileConfig(profile, fullDepthCm) {
    const { layers } = await getLayersFor(profile);
    return computeProfileConfig(profile, layers, fullDepthCm);
  },

  // ---- Estado de UNA sonda puntual (referencia de un modelo de
  //      suelo / pantalla Sensores). NUNCA representa la humedad de
  //      un lote: es la medición de esa sonda. ----
  async getProbeWaterState(probeId) {
    const [probes, lots, profiles, models] = await Promise.all([
      backend.entities.SoilProbe.list(),
      backend.entities.Lot.list(),
      backend.entities.SoilProfile.list(),
      backend.entities.SoilBehaviorModel.list(),
    ]);
    const probe = probes.find(p => p.id === probeId);
    if (!probe) return null;
    return stateForProbe(probe, lots, profiles, models);
  },

  // ---- Listado de sondas (pantalla Sensores) ----
  async getProbeSummaries() {
    const [probes, lots, profiles, models] = await Promise.all([
      sensorService.getProbes(),
      backend.entities.Lot.list(),
      backend.entities.SoilProfile.list(),
      backend.entities.SoilBehaviorModel.list(),
    ]);
    // En paralelo: cada sonda pide canales + lecturas — sin esperas
    // secuenciales que multiplican la latencia de la pantalla.
    return Promise.all(probes.filter(p => p.active !== false).map(p => stateForProbe(p, lots, profiles, models)));
  },

  // ---- Detalle completo de una sonda (solo monitoreo) ----
  async getProbeAnalysis(probeId) {
    const probes = await sensorService.getProbes();
    const probe = probes.find(p => p.id === probeId);
    if (!probe) return null;
    const [lots, profiles, models] = await Promise.all([backend.entities.Lot.list(), backend.entities.SoilProfile.list(), backend.entities.SoilBehaviorModel.list()]);
    const lot = linkedLotsFor(probe, lots, profiles, models)[0] || null;
    const [allChannels, readings] = await Promise.all([
      sensorService.getAllProbeChannels(probe.id),
      sensorService.getProbeReadings(probe.id, Date.now() - 95 * DAY_MS, Date.now()),
    ]);
    const channels = allChannels.filter(channel => channel.sensor_type === 'soil_moisture');
    if (!channels.length) return { probe, lot, missing: 'La sonda no tiene canales configurados.' };
    if (!lot) {
      if (!readings.length) return { probe, lot: null, missing: 'Sin lecturas — sincronizá la sonda en Configuración → Sensores.' };
      return { ...unlinkedProbeState(probe, channels, readings), channels, measurement_channels: allChannels, readings, events: { irrigation: [], rain: [] } };
    }
    const profile = profiles.find(p => p.lot_id === lot.id) || null;
    const state = await buildState(profile, channels, readings);
    const history = state._model ? usefulWaterSeries(readings, channels, state._model) : [];

    // ---- Eventos de contexto: riegos EJECUTADOS (IrrigationLog) + lluvia ----
    // Solo riegos con log: un programa sin log no prueba que el riego
    // ocurrió (para aprender el suelo se usan riegos reales).
    const [logs, programs] = await Promise.all([
      backend.entities.IrrigationLog.list(),
      backend.entities.IrrigationProgram.list(),
    ]);
    const programById = new Map(programs.map(p => [p.id, p]));
    const irrigationEvents = [...new Set(logs
      .filter(l => l.date && (programById.get(l.program_id)?.lot_ids || []).includes(lot.id))
      .map(l => l.date))].sort();
    // La calibración cruza la sonda con la MISMA lluvia observada que
    // alimenta las curvas: Garita para todos los lotes, por ID de
    // estación y día local, sin tomar otra estación de la finca.
    const garita = selectGaritaStation(await backend.entities.WeatherStation.list());
    const observations = garita
      ? await backend.entities.WeatherObservation.filter({ weather_station_id: garita.id }, '-timestamp', 2000)
      : [];
    const { byDay } = aggregateGaritaObservations(observations);
    const rainEvents = [...byDay.entries()]
      .filter(([, value]) => value.rain > 0)
      .map(([date, value]) => ({ date, mm: value.rain }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      probe,
      lot,
      channels,
      measurement_channels: allChannels,
      readings,
      profile,
      ...state,
      history,
      events: { irrigation: irrigationEvents, rain: rainEvents },
    };
  },

  // El ESTADO HÍDRICO DE UN LOTE vive EXCLUSIVAMENTE en
  // lotWaterStateService (curva calculada con los eventos propios del
  // lote: origen explícito + riegos ejecutados + lluvia − ETc). Este
  // servicio queda reducido a: analizar una sonda, calcular el agua
  // del perfil de ESA sonda (monitoreo) y aportar la configuración
  // estática (umbrales) para la curva del lote y el modelo de
  // comportamiento del suelo. Las funciones que interpretaban la
  // sonda vinculada como estado hídrico del lote fueron eliminadas:
  // una sola arquitectura conceptual.
};
