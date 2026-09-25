import { requireAdminOrCron, serviceBackend, withCors } from '../_shared/backend.ts';
import { resolveProbeLotId, syncSentekProbe } from '../_shared/sentekSync.ts';

// Sincroniza automáticamente TODAS las sondas Sentek activas, incluso
// antes de asignarlas a un lote. La invoca la tarea programada —
// corre con service role porque no hay usuario en el contexto.
Deno.serve(withCors(async function (req) {
  try {
    await requireAdminOrCron(req);
    const client = serviceBackend;
    const probes = await client.entities.SoilProbe.filter({ provider: 'sentek', active: true });
    const results = await Promise.all(probes.map(async probe => {
      const lotId = await resolveProbeLotId(client, probe);
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
