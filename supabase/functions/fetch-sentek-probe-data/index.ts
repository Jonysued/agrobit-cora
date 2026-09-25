import { requireAdmin, serviceBackend, withCors } from '../_shared/backend.ts';
import { resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';

// Sincroniza una sonda Sentek (IrriMAX Live) desde la app.
// Admin only — la API key vive como secret del backend.
Deno.serve(withCors(async function (req) {
  try {
    const { backend } = await requireAdmin(req);
    const { probe_id } = await req.json();
    if (!probe_id) return Response.json({ error: 'Falta probe_id' }, { status: 400 });
    const probe = await backend.entities.SoilProbe.get(probe_id);
    // El lote es contexto opcional: la sonda puede sincronizar sin vínculo.
    const lotId = await resolveProbeLotId(backend, probe);
    const result = await syncSentekProbe(backend, probe, lotId);
    if (!result.ok) return Response.json(result, { status: 502 });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
