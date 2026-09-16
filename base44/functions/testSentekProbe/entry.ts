import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { testSentekProbe } from '../../shared/sentekAdapters.ts';

// Prueba la conexión de una sonda Sentek (IrriMAX Live): verifica la API
// key y que el logger exista en la cuenta, y reporta las profundidades
// reales de la sonda. Admin only — la API key vive como secret del
// backend y nunca se expone en el error.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { probe_id } = await req.json();
    if (!probe_id) return Response.json({ error: 'Falta probe_id' }, { status: 400 });
    const probe = await base44.entities.SoilProbe.get(probe_id);
    const result = await testSentekProbe(probe);
    const latest = await base44.entities.SensorReading.filter({ probe_id }, '-timestamp', 1);
    const last_reading_at = latest.length ? latest[0].timestamp : probe.last_reading_at || null;
    await base44.entities.SoilProbe.update(probe_id, {
      connection_status: result.ok ? 'connected' : result.status,
      last_reading_at: result.ok && last_reading_at ? last_reading_at : probe.last_reading_at,
    });
    return Response.json({ ok: result.ok, status: result.status, message: result.message, last_reading_at });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}