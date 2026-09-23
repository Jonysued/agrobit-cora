import { requireAdmin, serviceBackend, withCors } from '../_shared/backend.ts';
import { fetchStationObservation } from '../_shared/weatherAdapters.ts';

// Trae el dato en vivo de una estación meteorológica, lo normaliza al
// formato interno unificado y lo persiste como WeatherObservation para
// cada finca vinculada a la estación. Admin only — las credenciales
// viven como secrets del backend y nunca llegan al frontend.
Deno.serve(withCors(async function (req) {
  try {
    const { backend } = await requireAdmin(req);
    const { station_id } = await req.json();
    if (!station_id) return Response.json({ error: 'Falta station_id' }, { status: 400 });
    const station = await backend.entities.WeatherStation.get(station_id);
    const result = await fetchStationObservation(station);
    if (!result.ok) {
      await backend.entities.WeatherStation.update(station_id, { connection_status: result.status || 'error' });
      return Response.json({ ok: false, error: result.message }, { status: 502 });
    }
    const obs = result.observation;
    const farmIds = station.farm_ids || (station.farm_id ? [station.farm_id] : []);
    if (!farmIds.length) return Response.json({ ok: false, error: 'La estación no tiene fincas vinculadas.' }, { status: 400 });

    // Trae TODAS las observaciones necesarias del día local en curso
    // (no un tope fijo de 30): el acumulado ya persistido se calcula
    // sobre el día COMPLETO para no contabilizar dos veces.
    const recents = await backend.entities.WeatherObservation.filter({ weather_station_id: station_id }, '-timestamp', 500);
    const latestTs = recents[0]?.timestamp;
    if (latestTs && new Date(latestTs).getTime() >= new Date(obs.timestamp).getTime()) {
      return Response.json({ ok: true, observation: obs, persisted: false, station: { name: station.name, provider: station.provider } });
    }

    // Lluvia incremental del día: acumulado diario actual − lo ya guardado hoy.
    // El acumulado de la estación se reinicia a medianoche LOCAL de la
    // finca: se agrupa por día de Argentina, no por día UTC (si no, la
    // lluvia de la madrugada se descuenta mal y la curva no sube).
    const localDay = (ts: string) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ts));
    const dayKey = localDay(obs.timestamp);
    // Sin duplicados: observaciones repetidas del mismo timestamp (por
    // ejemplo, re-sincronizaciones o copias por finca vinculada) se
    // cuentan UNA sola vez al acumular lo ya persistido del día.
    const seenDayTs = new Set<number>();
    const sameDay = recents.filter(r => localDay(r.timestamp || '') === dayKey).filter(r => {
      const t = new Date(r.timestamp).getTime();
      if (Number.isNaN(t) || seenDayTs.has(t)) return false;
      seenDayTs.add(t);
      return true;
    });
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
      // ET0 acumulada del día a la fecha: fuente autoritativa de la
      // ET0 diaria (el balance toma el mayor acumulado del día, no la
      // suma de incrementos, que duplica valores repetidos de la API).
      et_day_mm: obs.et_day_mm ?? null,
      source: station.provider,
      quality_status: 'ok',
    };
    await backend.entities.WeatherObservation.bulkCreate(farmIds.map(farm_id => ({ ...payload, farm_id })));
    await backend.entities.WeatherStation.update(station_id, { connection_status: 'connected', last_data_at: obs.timestamp });
    return Response.json({ ok: true, observation: { ...obs, rainfall_mm }, persisted: true, station: { name: station.name, provider: station.provider } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
