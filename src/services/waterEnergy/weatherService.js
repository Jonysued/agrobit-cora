import { base44 } from '@/api/base44Client';

// ============================================================
// weatherService — capa meteorológica desacoplada.
// Diferencia claramente dos fuentes de datos:
//  · OBSERVED WEATHER: datos reales de estaciones propias (WeatherObservation).
//  · FORECAST WEATHER: Open-Meteo usando la lat/lon de la finca,
//    o pronóstico simulado si la finca no tiene ubicación configurada.
// La UI nunca consulta proveedores externos: solo este servicio.
// ============================================================
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const round1 = n => Math.round(n * 10) / 10;

// Frescura del dato de estación — no es "online" cualquier dato viejo
const STALE_MINUTES = 30;
const stationStatusFor = ageMin => {
  if (ageMin == null) return 'offline';
  if (ageMin <= 60) return 'online';
  if (ageMin <= 24 * 60) return 'delayed';
  return 'offline';
};

// Pseudoaleatorio determinista (datos demo estables por lote/fecha)
const seeded01 = key => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ((h % 997) / 997 + (h % 89) / 89) / 2;
};

const kcFor = lot => {
  const c = (lot.crop || '').toLowerCase();
  if (c.includes('oli')) return 0.6;
  if (c.includes('gran')) return 0.7;
  return 0.65;
};

function simulateForLot(lot, dateStr) {
  const kc = kcFor(lot);
  const eto = round1(3.6 + 2.2 * seeded01(`${lot.id}|eto|${dateStr}`));
  const rainChance = seeded01(`${lot.id}|rain|${dateStr}`);
  const rainfall = rainChance > 0.85 ? round1(rainChance * 8) : 0;
  return {
    lot_id: lot.id,
    date: dateStr,
    eto_mm: eto,
    kc,
    etc_mm: round1(eto * kc),
    rainfall_mm: rainfall,
    effective_rainfall_mm: rainfall ? round1(rainfall * 0.7) : 0,
    temperature_min_c: round1(11 + 7 * seeded01(`${lot.id}|tmin|${dateStr}`)),
    temperature_max_c: round1(23 + 9 * seeded01(`${lot.id}|tmax|${dateStr}`)),
    simulated: true,
  };
}

// Pronóstico simulado a nivel finca (sin ubicación configurada)
function simulateFarmDay(dateStr) {
  const eto = round1(3.6 + 2.2 * seeded01(`farm|eto|${dateStr}`));
  const rainChance = seeded01(`farm|rain|${dateStr}`);
  const rainfall = rainChance > 0.85 ? round1(rainChance * 8) : 0;
  return {
    date: dateStr,
    temperature_min_c: round1(11 + 7 * seeded01(`farm|tmin|${dateStr}`)),
    temperature_max_c: round1(23 + 9 * seeded01(`farm|tmax|${dateStr}`)),
    rainfall_mm: rainfall,
    eto_mm: eto,
    source: 'simulado',
  };
}

// ---- Open-Meteo: pronóstico real por lat/lon, sin API key ----
async function fetchOpenMeteoForecast(latitude, longitude) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,rain_sum,et0_fao_evapotranspiration&timezone=auto&forecast_days=16`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Open-Meteo no disponible');
  const json = await res.json();
  return json.daily.time.slice(1).map((date, i) => ({
    date,
    temperature_max_c: round1(json.daily.temperature_2m_max[i + 1] ?? 0),
    temperature_min_c: round1(json.daily.temperature_2m_min[i + 1] ?? 0),
    rainfall_mm: round1(json.daily.rain_sum[i + 1] ?? 0),
    eto_mm: round1(json.daily.et0_fao_evapotranspiration[i + 1] ?? 0),
    source: 'open-meteo',
  }));
}

export const weatherService = {
  // ---- Fincas: ubicación y fuente meteorológica ----
  async getFarms() { return base44.entities.Farm.list(); },
  async ensureFarms(lotFarms) {
    const farms = await base44.entities.Farm.list();
    const existing = new Set(farms.map(f => f.name));
    const missing = [...new Set((lotFarms || []).filter(n => n && !existing.has(n)))];
    if (missing.length) await base44.entities.Farm.bulkCreate(missing.map(name => ({ name, weather_source: 'FORECAST_ONLY' })));
    return base44.entities.Farm.list();
  },
  async saveFarmLocation(id, latitude, longitude) { return base44.entities.Farm.update(id, { latitude, longitude }); },
  async createFarmLocation(name, latitude, longitude) { return base44.entities.Farm.create({ name, latitude, longitude }); },
  async saveFarmSource(id, weather_source) { return base44.entities.Farm.update(id, { weather_source }); },
  async createFarmSource(name, weather_source) { return base44.entities.Farm.create({ name, weather_source }); },
  async getConfig(lotFarms) {
    const farms = await this.ensureFarms(lotFarms).catch(() => base44.entities.Farm.list());
    const stations = await base44.entities.WeatherStation.list();
    return { farms, stations };
  },

  // ---- OBSERVED WEATHER: datos reales de estación ----
  // La estación vinculada es la fuente principal del dato observado:
  // weatherService pide el dato en vivo al backend (credenciales en
  // secrets) y lo persiste; si la estación no responde, se usa lo último
  // guardado — nunca se sustituye por el forecast en el período observado.
  async getStationForFarm(farmId) {
    const stations = await base44.entities.WeatherStation.list();
    const linked = stations.filter(s => (s.farm_ids || (s.farm_id ? [s.farm_id] : [])).includes(farmId));
    return linked.find(s => s.active !== false) || linked[0] || null;
  },
  async refreshStationData(stationId) {
    const res = await base44.functions.invoke('fetchWeatherStationData', { station_id: stationId });
    return res.data;
  },
  async refreshIfStale(farmId, station) {
    try {
      station = station || await this.getStationForFarm(farmId);
      if (!station || station.connection_type === 'webhook' || station.connection_type === 'manual') return null;
      const [latest] = await base44.entities.WeatherObservation.filter({ farm_id: farmId }, '-timestamp', 1);
      const ageMin = latest ? (Date.now() - new Date(latest.timestamp).getTime()) / 60000 : Infinity;
      if (ageMin <= STALE_MINUTES) return null;
      return await this.refreshStationData(station.id);
    } catch { return null; } // estación caída → se usa el último dato guardado
  },
  async getObservedWeather(farmId, limit = 96) {
    // SOLO LECTURA: el histórico nunca dispara la sincronización con la
    // estación (esa acción vive en getLatestObservation, con límite de
    // frescura de 30 min, y en los botones de Configuración).
    return base44.entities.WeatherObservation.filter({ farm_id: farmId }, '-timestamp', limit);
  },
  async getLatestObservation(farmId) {
    await this.refreshIfStale(farmId);
    const [latest] = await base44.entities.WeatherObservation.filter({ farm_id: farmId }, '-timestamp', 1);
    return latest || null;
  },
  async getWeatherHistory(farmId, from, to) {
    const obs = await this.getObservedWeather(farmId, 500);
    return obs.filter(o => (!from || o.timestamp >= from) && (!to || o.timestamp <= to));
  },
  async saveObservation(data) { return base44.entities.WeatherObservation.create(data); },

  // Diagnóstico de una estación real: último dato en vivo, variables
  // disponibles y no disponibles, ET0, proveedor, status y antigüedad.
  async getStationDiagnostics(stationId) {
    const data = await this.refreshStationData(stationId);
    if (!data?.ok) return data || null;
    const obs = data.observation;
    const data_age_minutes = obs?.timestamp ? Math.round((Date.now() - new Date(obs.timestamp).getTime()) / 60000) : null;
    return {
      station: data.station,
      status: stationStatusFor(data_age_minutes),
      last_observation_at: obs.timestamp,
      data_age_minutes,
      variables: {
        temperature_c: obs.temperature_c,
        relative_humidity_percent: obs.relative_humidity_percent,
        rainfall_daily_mm: obs.rainfall_daily_mm,
        rain_rate_mm_h: obs.rain_rate_mm_h,
        wind_speed_kmh: obs.wind_speed_kmh,
        wind_gust_kmh: obs.wind_gust_kmh,
        wind_direction_deg: obs.wind_direction_deg,
        solar_radiation_w_m2: obs.solar_radiation_w_m2,
        atmospheric_pressure_hpa: obs.atmospheric_pressure_hpa,
        uv_index: obs.uv_index,
        et_day_mm: obs.et_day_mm,
      },
      eto_mm: obs.et_day_mm ?? obs.eto_mm,
      eto_source: (obs.et_day_mm != null || obs.eto_mm != null) ? 'weather_station' : 'unavailable',
    };
  },

  // ---- FORECAST WEATHER: 15 días a partir de mañana ----
  // Con lat/lon de la finca: Open-Meteo real. Sin ubicación: simulado.
  async getForecast(farm) {
    if (typeof farm === 'string') {
      const farms = await base44.entities.Farm.list();
      farm = farms.find(f => f.id === farm) || null;
    }
    const dates = Array.from({ length: 15 }, (_, i) => isoDate(addDays(i + 1)));
    if (farm?.latitude != null && farm?.longitude != null) {
      try {
        return await fetchOpenMeteoForecast(farm.latitude, farm.longitude);
      } catch { /* sin conexión a Open-Meteo → pronóstico simulado */ }
    }
    return dates.map(simulateFarmDay);
  },

  // ---- Vista combinada según el modo de la finca ----
  // PASADO Y PRESENTE → estación propia (dato real observado)
  // FUTURO 7 DÍAS → proveedor de forecast. Nunca se mezclan.
  async getCombinedWeather(farm) {
    if (typeof farm === 'string') {
      const farms = await base44.entities.Farm.list();
      farm = farms.find(f => f.id === farm) || null;
    }
    const mode = farm?.weather_source || 'FORECAST_ONLY';
    const forecast = await this.getForecast(farm);
    let station = null;
    let current = null;
    if (mode !== 'FORECAST_ONLY') {
      station = await this.getStationForFarm(farm.id);
      current = await this.getLatestObservation(farm.id);
    }
    const data_age_minutes = current?.timestamp ? Math.round((Date.now() - new Date(current.timestamp).getTime()) / 60000) : null;
    return {
      mode,
      station,
      current,
      forecast,
      forecastSource: forecast[0]?.source === 'open-meteo' ? 'Open-Meteo' : 'Pronóstico simulado',
      // Observado vs pronosticado, siempre identificado por origen
      observed_source: current ? 'weather_station' : null,
      last_observation_at: current?.timestamp || null,
      data_age_minutes,
      station_status: station ? stationStatusFor(data_age_minutes) : null,
      eto_source: current ? (current.eto_mm != null ? 'weather_station' : 'unavailable') : null,
      forecast_eto_source: 'forecast_provider',
    };
  },

  // Map<lot_id, [pronóstico × 15 días a partir de mañana]>
  // Con ubicación de finca: Open-Meteo real (ETc calculado por cultivo).
  // Sin ubicación: registros guardados o demo simulado.
  async getFarmForecast(lots) {
    const [stored, farms] = await Promise.all([base44.entities.WeatherForecast.list(), base44.entities.Farm.list()]);
    const daysByFarm = new Map();
    await Promise.all([...new Set(lots.map(l => l.farm))].map(async name => {
      const farm = farms.find(f => f.name === name);
      daysByFarm.set(name, farm?.latitude != null && farm?.longitude != null ? await this.getForecast(farm) : null);
    }));
    const map = new Map();
    for (const lot of lots) {
      const farmDays = daysByFarm.get(lot.farm);
      const days = [];
      for (let i = 1; i <= 15; i++) {
        const dateStr = isoDate(addDays(i));
        const fd = farmDays?.find(d => d.date === dateStr);
        if (fd) {
          const kc = kcFor(lot);
          days.push({ lot_id: lot.id, ...fd, kc, etc_mm: round1(fd.eto_mm * kc), effective_rainfall_mm: fd.rainfall_mm ? round1(fd.rainfall_mm * 0.7) : 0, simulated: false });
          continue;
        }
        const rec = stored.find(r => r.lot_id === lot.id && r.date === dateStr);
        days.push(rec ? { ...rec, simulated: false } : simulateForLot(lot, dateStr));
      }
      map.set(lot.id, days);
    }
    return map;
  },

  async saveForecast(data) { return base44.entities.WeatherForecast.create(data); },
};