import { requireAdminOrCron, serviceBackend, withCors } from '../_shared/backend.ts';
import { resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';

// Sincroniza automáticamente TODAS las sondas Sentek activas con lote
// vinculado. La invoca la tarea programada "Sync Sondas Sentek" —
// corre con service role porque no hay usuario en el contexto.
Deno.serve(withCors(async function (req) {
  try {
    await requireAdminOrCron(req);
    const client = serviceBackend;
    const probes = await client.entities.SoilProbe.filter({ provider: 'sentek', active: true });
    const results = await Promise.all(probes.map(async probe => {
      // Lote vinculado: DIRECTO o derivado del modelo de suelo del que
      // la sonda es referencia (mismo criterio que la app).
      const lotId = await resolveProbeLotId(client, probe);
      if (!lotId) {
        return { probe: probe.name, ok: false, skipped: 'Sin lote vinculado' };
      }
      try {
        const r = await syncSentekProbe(client, probe, lotId);
        return { probe: probe.name, ...r };
      } catch (e) {
        return { probe: probe.name, ok: false, message: e.message };
      }
    }));
    return Response.json({ ok: true, synced: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
