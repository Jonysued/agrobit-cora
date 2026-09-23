import { requireAdmin, serviceBackend, withCors } from '../_shared/backend.ts';
import { testSentekProbe } from '../_shared/sentekAdapters.ts';
import { STALE_MS } from '../_shared/sentekSync.ts';

// Prueba la conexión de una sonda Sentek (IrriMAX Live): verifica la API
// key y que el logger exista en la cuenta, y reporta las profundidades
// reales de la sonda. Admin only — la API key vive como secret del
// backend y nunca se expone en el error.
Deno.serve(withCors(async function (req) {
  try {
    const { backend } = await requireAdmin(req);
    const { probe_id } = await req.json();
    if (!probe_id) return Response.json({ error: 'Falta probe_id' }, { status: 400 });
    const probe = await backend.entities.SoilProbe.get(probe_id);
    const result = await testSentekProbe(probe);
    const latest = await backend.entities.SensorReading.filter({ probe_id }, '-timestamp', 1);
    const last_reading_at = latest.length ? latest[0].timestamp : probe.last_reading_at || null;
    // API conectada pero sin datos frescos ⇒ DESCONECTADA: el problema
    // es externo (logger sin transmitir), la app funciona bien.
    const lastMs = last_reading_at ? new Date(last_reading_at).getTime() : 0;
    const stale = !lastMs || Date.now() - lastMs > STALE_MS;
    const connection_status = !result.ok ? result.status : stale ? 'disconnected' : 'connected';
    await backend.entities.SoilProbe.update(probe_id, {
      connection_status,
      last_reading_at: result.ok && last_reading_at ? last_reading_at : probe.last_reading_at,
    });
    const message = result.ok && stale
      ? `${result.message} Pero no reporta lecturas nuevas: aparece como DESCONECTADA hasta que el logger vuelva a transmitir.`
      : result.message;
    return Response.json({ ok: result.ok, status: connection_status, message, last_reading_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
