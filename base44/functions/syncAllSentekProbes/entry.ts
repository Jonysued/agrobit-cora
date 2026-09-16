import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { syncSentekProbe } from '../../shared/sentekSync.ts';

// Sincroniza automáticamente TODAS las sondas Sentek activas con lote
// vinculado. La invoca la tarea programada "Sync Sondas Sentek" —
// corre con service role porque no hay usuario en el contexto.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const client = base44.asServiceRole;
    const probes = await client.entities.SoilProbe.filter({ provider: 'sentek', active: true });
    const results = [];
    for (const probe of probes) {
      if (!probe.lot_id) {
        results.push({ probe: probe.name, ok: false, skipped: 'Sin lote vinculado' });
        continue;
      }
      try {
        const r = await syncSentekProbe(client, probe);
        results.push({ probe: probe.name, ...r });
      } catch (e) {
        results.push({ probe: probe.name, ok: false, message: e.message });
      }
    }
    return Response.json({ ok: true, synced: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}