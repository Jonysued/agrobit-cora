import { fetchStationObservation } from './weatherAdapters.ts';

export const WEATHER_DELAYED_MS = 2 * 3600000;
export const WEATHER_DISCONNECTED_MS = 24 * 3600000;

export function weatherConnectionStatus(timestamp) {
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  if (!time || !Number.isFinite(time)) return 'disconnected';
  const age = Math.max(0, Date.now() - time);
  if (age > WEATHER_DISCONNECTED_MS) return 'disconnected';
  if (age > WEATHER_DELAYED_MS) return 'delayed';
  return 'connected';
}

const localDay = timestamp => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(timestamp));

// Sincronización compartida por el botón manual y la tarea automática.
// Persiste únicamente timestamps nuevos y convierte los acumulados diarios
// de lluvia/ET0 del proveedor en incrementos sin duplicarlos.
export async function syncWeatherStation(client, station) {
  const result = await fetchStationObservation(station);
  if (!result.ok) {
    await client.entities.WeatherStation.update(station.id, {
      connection_status: result.status || 'error',
    });
    return { ok: false, status: result.status || 'error', message: result.message };
  }

  const obs = result.observation;
  const status = weatherConnectionStatus(obs.timestamp);
  const farmIds = station.farm_ids || (station.farm_id ? [station.farm_id] : []);
  if (!farmIds.length) {
    await client.entities.WeatherStation.update(station.id, { connection_status: 'misconfigured' });
    return { ok: false, status: 'misconfigured', message: 'La estación no tiene fincas vinculadas.' };
  }

  const recents = await client.entities.WeatherObservation.filter(
    { weather_station_id: station.id }, '-timestamp', 500,
  );
  const latestTs = recents[0]?.timestamp;
  const isNew = !latestTs || new Date(latestTs).getTime() < new Date(obs.timestamp).getTime();
  let normalizedObservation = obs;

  if (isNew) {
    const dayKey = localDay(obs.timestamp);
    const seenDayTs = new Set();
    const sameDay = recents.filter(row => localDay(row.timestamp || '') === dayKey).filter(row => {
      const time = new Date(row.timestamp).getTime();
      if (Number.isNaN(time) || seenDayTs.has(time)) return false;
      seenDayTs.add(time);
      return true;
    });
    const storedToday = sameDay.reduce((sum, row) => sum + (row.rainfall_mm || 0), 0);
    const rainfall_mm = obs.rainfall_daily_mm != null
      ? Math.round(Math.max(0, obs.rainfall_daily_mm - storedToday) * 10) / 10
      : null;
    normalizedObservation = { ...obs, rainfall_mm };
    const storedTodayEto = sameDay.reduce((sum, row) => sum + (row.eto_mm || 0), 0);
    const eto_mm = obs.et_day_mm != null
      ? Math.round(Math.max(0, obs.et_day_mm - storedTodayEto) * 10) / 10
      : obs.eto_mm;
    const payload = {
      weather_station_id: station.id,
      timestamp: obs.timestamp,
      temperature_c: obs.temperature_c,
      relative_humidity_percent: obs.relative_humidity_percent,
      rainfall_mm,
      wind_speed_kmh: obs.wind_speed_kmh,
      wind_gust_kmh: obs.wind_gust_kmh,
      wind_direction_deg: obs.wind_direction_deg,
      solar_radiation_w_m2: obs.solar_radiation_w_m2,
      atmospheric_pressure_hpa: obs.atmospheric_pressure_hpa,
      eto_mm,
      et_day_mm: obs.et_day_mm ?? null,
      source: station.provider,
      quality_status: status === 'connected' ? 'ok' : 'stale',
    };
    await client.entities.WeatherObservation.bulkCreate(
      farmIds.map(farm_id => ({ ...payload, farm_id })),
    );
  }

  await client.entities.WeatherStation.update(station.id, {
    connection_status: status,
    last_data_at: obs.timestamp,
  });
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(obs.timestamp).getTime()) / 60000));
  const message = status === 'connected'
    ? 'Estación actualizada correctamente.'
    : `WeatherLink respondió, pero su último dato tiene ${ageMinutes} minutos de antigüedad.`;
  return {
    ok: true,
    observation: normalizedObservation,
    persisted: isNew,
    status,
    message,
    station: { name: station.name, provider: station.provider },
  };
}
