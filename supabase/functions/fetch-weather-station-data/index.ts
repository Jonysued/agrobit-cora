import { requireAdmin, withCors } from '../_shared/backend.ts';
import { syncWeatherStation } from '../_shared/weatherSync.ts';

// Sincronización manual de una estación. Las credenciales permanecen en
// Edge Function Secrets y la misma lógica se reutiliza en el cron.
Deno.serve(withCors(async function (req) {
  try {
    const { backend } = await requireAdmin(req);
    const { station_id } = await req.json();
    if (!station_id) return Response.json({ error: 'Falta station_id' }, { status: 400 });
    const station = await backend.entities.WeatherStation.get(station_id);
    const result = await syncWeatherStation(backend, station);
    return Response.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
