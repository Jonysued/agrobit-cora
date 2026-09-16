import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { fetchStationObservation } from '../../shared/weatherAdapters.ts';

// Trae el dato en vivo de una estación meteorológica, lo normaliza al
// formato interno unificado y lo persiste como WeatherObservation para
// cada finca vinculada a la estación. Admin only — las credenciales
// viven como secrets del backend y nunca llegan al frontend.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { station_id } = await req.json();
    if (!station_id) return Response.json({ error: 'Falta station_id' }, { status: 400 });
    const station = await base44.entities.WeatherStation.get(station_id);
    const result = await fetchStationObservation(station);
    if (!result.ok) {
      await base44.entities.WeatherStation.update(station_id, { connection_status: result.status || 'error' });
      return Response.json({ ok: false, error: result.message }, { status: 502 });
    }
    const obs = result.observation;
    const farmIds = station.farm_ids || (station.farm_id ? [station.farm_id] : []);
    if (!farmIds.length) return Response.json({ ok: false, error: 'La estación no tiene fincas vinculadas.' }, { status: 400 });

    // Evita duplicar la última lectura ya guardada
    const recents = await base44.entities.WeatherObservation.filter({ weather_station_id: station_id }, '-timestamp', 30);
    const latestTs = recents[0]?.timestamp;
    if (latestTs && new Date(latestTs).getTime() >= new Date(obs.timestamp).getTime()) {
      return Response.json({ ok: true, observation: obs, persisted: false, station: { name: station.name, provider: station.provider } });
    }

    // Lluvia incremental del día: acumulado diario actual − lo ya guardado hoy
    const dayKey = obs.timestamp.slice(0, 10);
    const sameDay = recents.filter(r => (r.timestamp || '').slice(0, 10) === dayKey);
    const storedToday = sameDay.reduce((s, r) => s + (r.rainfall_mm || 0), 0);
    const rainfall_mm = obs.rainfall_daily_mm != null
      ? Math.round(Math.max(0, obs.rainfall_daily_mm - storedToday) * 10) / 10
      : null;

    // ET0 incremental del día (et_day acumulado que entrega la estación)
    // o el ET del intervalo de archivo — nunca se inventa un valor.
    const storedTodayEto = sameDay.reduce((s, r) => s + (r.eto_mm || 0), 0);
    const eto_increment = obs.et_day_mm != null
      ? Math.round(Math.max(0, obs.et_day_mm - storedTodayEto) * 10) / 10
      : obs.eto_mm;

    const payload = {
      weather_station_id: station_id,
      timestamp: obs.timestamp,
      temperature_c: obs.temperature_c,
      relative_humidity_percent: obs.relative_humidity_percent,
      rainfall_mm,
      wind_speed_kmh: obs.wind_speed_kmh,
      wind_gust_kmh: obs.wind_gust_kmh,
      wind_direction_deg: obs.wind_direction_deg,
      solar_radiation_w_m2: obs.solar_radiation_w_m2,
      atmospheric_pressure_hpa: obs.atmospheric_pressure_hpa,
      eto_mm: eto_increment,
      source: station.provider,
      quality_status: 'ok',
    };
    await base44.entities.WeatherObservation.bulkCreate(farmIds.map(farm_id => ({ ...payload, farm_id })));
    await base44.entities.WeatherStation.update(station_id, { connection_status: 'connected', last_data_at: obs.timestamp });
    return Response.json({ ok: true, observation: { ...obs, rainfall_mm }, persisted: true, station: { name: station.name, provider: station.provider } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}