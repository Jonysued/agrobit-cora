import { requireAdmin, serviceBackend, withCors } from '../_shared/backend.ts';
import { resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';

// Sincroniza automáticamente TODAS las sondas Sentek activas con lote
// vinculado. La invoca la tarea programada "Sync Sondas Sentek" —
// corre con service role porque no hay usuario en el contexto.
Deno.serve(withCors(async function (req) {
  try {
    await requireAdmin(req);
    const client = serviceBackend;
    const probes = await client.entities.SoilProbe.filter({ provider: 'sentek', active: true });
    const results = [];
    for (const probe of probes) {
      // Lote vinculado: DIRECTO o derivado del modelo de suelo del que
      // la sonda es referencia (mismo criterio que la app).
      const lotId = await resolveProbeLotId(client, probe);
      if (!lotId) {
        results.push({ probe: probe.name, ok: false, skipped: 'Sin lote vinculado' });
        continue;
      }
      try {
        const r = await syncSentekProbe(client, probe, lotId);
        results.push({ probe: probe.name, ...r });
      } catch (e) {
        results.push({ probe: probe.name, ok: false, message: e.message });
      }
    }
    return Response.json({ ok: true, synced: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}));
