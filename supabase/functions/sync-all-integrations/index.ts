import { requireAdminOrCron, serviceBackend, withCors } from '../_shared/backend.ts';
import { resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';
import { syncWeatherStation } from '../_shared/weatherSync.ts';

// Punto único para la tarea programada: actualiza estaciones y sondas sin
// depender de que un usuario tenga la aplicación abierta. Los errores se
// aíslan por dispositivo para que una integración caída no frene al resto.
Deno.serve(withCors(async function (req) {
  try {
    await requireAdminOrCron(req);
    const client = serviceBackend;
    const [stations, probes] = await Promise.all([
      client.entities.WeatherStation.list('-created_date', 1000),
      client.entities.SoilProbe.filter({ provider: 'sentek', active: true }),
    ]);

    const weather = [];
    for (const station of stations.filter(item => item.active !== false && item.connection_type === 'api')) {
      try {
        weather.push({ station: station.name, ...(await syncWeatherStation(client, station)) });
      } catch (error) {
        await client.entities.WeatherStation.update(station.id, { connection_status: 'error' });
        weather.push({ station: station.name, ok: false, message: error.message });
      }
    }

    const sentek = await Promise.all(probes.map(async probe => {
      try {
        const lotId = await resolveProbeLotId(client, probe);
        if (!lotId) {
          await client.entities.SoilProbe.update(probe.id, { connection_status: 'misconfigured' });
          return { probe: probe.name, ok: false, skipped: 'Sin lote vinculado' };
        }
        return { probe: probe.name, ...(await syncSentekProbe(client, probe, lotId)) };
      } catch (error) {
        await client.entities.SoilProbe.update(probe.id, { connection_status: 'error' });
        return { probe: probe.name, ok: false, message: error.message };
      }
    }));

    const failed = [...weather, ...sentek].filter(item => !item.ok).length;
    return Response.json({
      ok: failed === 0,
      ran_at: new Date().toISOString(),
      summary: { weather: weather.length, sentek: sentek.length, failed },
      weather,
      sentek,
    }, { status: failed === 0 ? 200 : 207 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
