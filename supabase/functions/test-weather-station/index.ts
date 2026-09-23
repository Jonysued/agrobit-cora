import { requireAdmin, serviceBackend, withCors } from '../_shared/backend.ts';
import { testStation } from '../_shared/weatherAdapters.ts';

// Prueba la conexión con una estación meteorológica.
// Corre en el backend: las credenciales (API keys) viven como secrets
// y nunca llegan al frontend ni se exponen en el error.
Deno.serve(withCors(async function (req) {
  try {
    const { backend } = await requireAdmin(req);
    const { station_id } = await req.json();
    if (!station_id) return Response.json({ error: 'Falta station_id' }, { status: 400 });
    const station = await backend.entities.WeatherStation.get(station_id);
    const result = await testStation(station);
    const latest = await backend.entities.WeatherObservation.filter({ weather_station_id: station_id }, '-timestamp', 1);
    const last_data_at = latest.length ? latest[0].timestamp : station.last_data_at || null;
    await backend.entities.WeatherStation.update(station_id, {
      connection_status: result.ok ? 'connected' : result.status,
      last_data_at: result.ok && last_data_at ? last_data_at : station.last_data_at,
    });
    return Response.json({ ok: result.ok, status: result.status, message: result.message, last_data_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
