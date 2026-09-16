import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { syncSentekProbe } from '../../shared/sentekSync.ts';

// Sincroniza una sonda Sentek (IrriMAX Live) desde la app.
// Admin only — la API key vive como secret del backend.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { probe_id } = await req.json();
    if (!probe_id) return Response.json({ error: 'Falta probe_id' }, { status: 400 });
    const probe = await base44.entities.SoilProbe.get(probe_id);
    if (!probe.lot_id) {
      return Response.json({ ok: false, error: 'La sonda no tiene un lote vinculado — vinculá el lote en Configuración → Vinculación de perfiles antes de sincronizar.' }, { status: 400 });
    }
    const result = await syncSentekProbe(base44, probe);
    if (!result.ok) return Response.json(result, { status: 502 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}