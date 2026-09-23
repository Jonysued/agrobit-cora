import { requireAdmin, serviceBackend } from '../_shared/backend.ts';
import { testSentekProbe } from '../_shared/sentekAdapters.ts';
import { probeConnectionStatus, resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';
import { testStation } from '../_shared/weatherAdapters.ts';
import { syncWeatherStation, weatherConnectionStatus } from '../_shared/weatherSync.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body, status = 200) => Response.json(body, { status, headers: cors });
const cronActions = new Set(['syncAllSentekProbes', 'syncAllWeatherStations', 'syncAllIntegrations']);

async function syncAllWeatherStations() {
  const stations = await serviceBackend.entities.WeatherStation.list('-created_date', 1000);
  const synced = [];
  for (const station of stations.filter(item => item.active !== false && item.connection_type === 'api')) {
    try {
      synced.push({ station: station.name, ...(await syncWeatherStation(serviceBackend, station)) });
    } catch (error) {
      await serviceBackend.entities.WeatherStation.update(station.id, { connection_status: 'error' });
      synced.push({ station: station.name, ok: false, message: error.message });
    }
  }
  return { ok: synced.every(item => item.ok), synced, ran_at: new Date().toISOString() };
}

async function syncAllSentekProbes() {
  const probes = await serviceBackend.entities.SoilProbe.filter({ provider: 'sentek', active: true });
  // Los proveedores externos pueden tardar varios segundos por logger.
  // Se ejecutan en paralelo para no agotar el tiempo máximo de la función.
  const synced = await Promise.all(probes.map(async probe => {
    try {
      const lotId = await resolveProbeLotId(serviceBackend, probe);
      if (!lotId) {
        await serviceBackend.entities.SoilProbe.update(probe.id, { connection_status: 'misconfigured' });
        return { probe: probe.name, ok: false, skipped: 'Sin lote vinculado' };
      }
      return { probe: probe.name, ...(await syncSentekProbe(serviceBackend, probe, lotId)) };
    } catch (error) {
      await serviceBackend.entities.SoilProbe.update(probe.id, { connection_status: 'error' });
      return { probe: probe.name, ok: false, message: error.message };
    }
  }));
  return { ok: synced.every(item => item.ok), synced, ran_at: new Date().toISOString() };
}

async function handle(action, payload) {
  if (action === 'syncAllWeatherStations') return syncAllWeatherStations();
  if (action === 'syncAllSentekProbes') return syncAllSentekProbes();
  if (action === 'syncAllIntegrations') {
    const [weather, sentek] = await Promise.all([syncAllWeatherStations(), syncAllSentekProbes()]);
    return { ok: weather.ok && sentek.ok, weather, sentek, ran_at: new Date().toISOString() };
  }
  if (action === 'fetchWeatherStationData') {
    if (!payload.station_id) return { ok: false, error: 'Falta station_id' };
    const station = await serviceBackend.entities.WeatherStation.get(payload.station_id);
    return syncWeatherStation(serviceBackend, station);
  }
  if (action === 'testWeatherStation') {
    if (!payload.station_id) return { ok: false, error: 'Falta station_id' };
    const station = await serviceBackend.entities.WeatherStation.get(payload.station_id);
    const result = await testStation(station);
    const latest = await serviceBackend.entities.WeatherObservation.filter(
      { weather_station_id: station.id }, '-timestamp', 1,
    );
    const last_data_at = latest[0]?.timestamp || station.last_data_at || null;
    const status = result.ok ? weatherConnectionStatus(last_data_at) : result.status;
    await serviceBackend.entities.WeatherStation.update(station.id, {
      connection_status: status,
      last_data_at: result.ok && last_data_at ? last_data_at : station.last_data_at,
    });
    return { ok: result.ok, status, message: result.message, last_data_at };
  }
  if (action === 'fetchSentekProbeData') {
    if (!payload.probe_id) return { ok: false, error: 'Falta probe_id' };
    const probe = await serviceBackend.entities.SoilProbe.get(payload.probe_id);
    const lotId = await resolveProbeLotId(serviceBackend, probe);
    if (!lotId) {
      await serviceBackend.entities.SoilProbe.update(probe.id, { connection_status: 'misconfigured' });
      return { ok: false, error: 'La sonda no tiene un lote vinculado.' };
    }
    return syncSentekProbe(serviceBackend, probe, lotId);
  }
  if (action === 'testSentekProbe') {
    if (!payload.probe_id) return { ok: false, error: 'Falta probe_id' };
    const probe = await serviceBackend.entities.SoilProbe.get(payload.probe_id);
    const result = await testSentekProbe(probe);
    const latest = await serviceBackend.entities.SensorReading.filter(
      { probe_id: probe.id }, '-timestamp', 1,
    );
    const last_reading_at = latest[0]?.timestamp || probe.last_reading_at || null;
    const status = result.ok ? probeConnectionStatus(last_reading_at) : result.status;
    await serviceBackend.entities.SoilProbe.update(probe.id, {
      connection_status: status,
      last_reading_at: result.ok && last_reading_at ? last_reading_at : probe.last_reading_at,
    });
    const message = result.ok && status !== 'connected'
      ? `${result.message} La conexión responde, pero el logger no está enviando datos recientes.`
      : result.message;
    return { ok: result.ok, status, message, last_reading_at };
  }
  return { ok: false, error: `Acción no soportada: ${action || '—'}` };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { action, payload = {} } = await req.json();
    const cronSecret = Deno.env.get('CRON_SECRET') || '';
    const cron = cronActions.has(action) && cronSecret && req.headers.get('x-cron-secret') === cronSecret;
    if (!cron) await requireAdmin(req);
    return json(await handle(action, payload));
  } catch (error) {
    console.error(error);
    return json({ error: error.message || 'Unexpected error' }, Number(error?.status) || 500);
  }
});
