import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { testStation } from '../../shared/weatherAdapters.ts';

// Prueba la conexión con una estación meteorológica.
// Corre en el backend: las credenciales (API keys) viven como secrets
// y nunca llegan al frontend ni se exponen en el error.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { station_id } = await req.json();
    if (!station_id) return Response.json({ error: 'Falta station_id' }, { status: 400 });
    const station = await base44.entities.WeatherStation.get(station_id);
    const result = await testStation(station);
    const latest = await base44.entities.WeatherObservation.filter({ weather_station_id: station_id }, '-timestamp', 1);
    const last_data_at = latest.length ? latest[0].timestamp : station.last_data_at || null;
    await base44.entities.WeatherStation.update(station_id, {
      connection_status: result.ok ? 'connected' : result.status,
      last_data_at: result.ok && last_data_at ? last_data_at : station.last_data_at,
    });
    return Response.json({ ok: result.ok, status: result.status, message: result.message, last_data_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}