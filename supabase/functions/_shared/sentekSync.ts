// ============================================================
// Sincronización de sondas Sentek: lógica compartida entre la
// función invocada desde la app (fetchSentekProbeData) y la tarea
// programada automática (syncAllSentekProbes).
// ============================================================
import { fetchSentekReadings } from './sentekAdapters.ts';

// Umbral de obsolesciedad: si el último dato disponible en IrriMAX
// es más viejo que esto, la sonda aparece DESCONECTADA — el logger
// dejó de transmitir por un problema externo, no de la app.
export const STALE_MS = 12 * 3600000;

// Lote EFECTIVO de una sonda: el vínculo DIRECTO (probe.lot_id) o, si
// no hay, el derivado de los perfiles que la referencian — directo
// (profile.probe_id) o como referencia de su modelo de suelo
// (SoilBehaviorModel.reference_probe_id). Mismo criterio que
// linkedLotsFor en la app (soilWaterService): una sonda de referencia
// está vinculada a los lotes que usan su modelo.
export async function resolveProbeLotId(client, probe) {
  if (probe.lot_id) return probe.lot_id;
  const [directProfiles, models] = await Promise.all([
    client.entities.SoilProfile.filter({ probe_id: probe.id }),
    client.entities.SoilBehaviorModel.filter({ reference_probe_id: probe.id }),
  ]);
  const direct = directProfiles.find(p => p.lot_id);
  if (direct) return direct.lot_id;
  const modelIds = new Set(models.map(m => m.id));
  if (!modelIds.size) return null;
  const profiles = await client.entities.SoilProfile.list();
  const viaModel = profiles.find(p => modelIds.has(p.soil_behavior_model_id) && p.lot_id);
  return viaModel ? viaModel.lot_id : null;
}

// Sincroniza una sonda: descubre profundidades, crea canales y
// persiste solo lecturas nuevas (incremental, sin duplicados).
// `client` es un cliente de datos (usuario admin o service role).
// `lotId` (opcional) es el lote efectivo resuelto por el llamador —
// las lecturas lo registran como contexto.
export async function syncSentekProbe(client, probe, lotId) {
  const effectiveLotId = lotId || probe.lot_id || null;
  const result = await fetchSentekReadings(probe, probe.last_reading_at);
  if (!result.ok) {
    await client.entities.SoilProbe.update(probe.id, { connection_status: result.status || 'error' });
    return { ok: false, status: result.status || 'error', message: result.message };
  }
  // Sin novedades: mensaje claro con la antigüedad del último dato
  // disponible en IrriMAX (guía al usuario hacia el logger si no reporta).
  const apiLastMs = result.rows.reduce((m, r) => Math.max(m, new Date(r.timestamp).getTime() || 0), 0);
  const refMs = apiLastMs || (probe.last_reading_at ? new Date(probe.last_reading_at).getTime() : 0);
  const staleDataMessage = () => {
    const when = refMs ? new Date(refMs).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    const ageH = refMs ? Math.max(0, Math.round((Date.now() - refMs) / 3600000)) : null;
    return `Sin lecturas nuevas en IrriMAX Live — el último dato disponible es del ${when}${ageH ? ` (hace ${ageH} h)` : ''}. Si no se actualiza, verificá que el logger "${probe.name}" esté encendido y transmitiendo.`;
  };
  // Sin lecturas nuevas: el estado de conexión refleja la antigüedad
  // del último dato disponible — obsoleto (o inexistente) ⇒
  // DESCONECTADA, dato fresco ⇒ conectada.
  const markConnection = async () => {
    const stale = !refMs || Date.now() - refMs > STALE_MS;
    const connection_status = stale ? 'disconnected' : 'connected';
    await client.entities.SoilProbe.update(probe.id, { connection_status });
    return connection_status;
  };
  if (!result.rows.length) {
    return { ok: true, ingested: 0, connection_status: await markConnection(), message: staleDataMessage(), last_reading_at: probe.last_reading_at || null };
  }

  // Canales reales de la sonda: uno por profundidad con sensor de humedad
  const depths = [...new Set(result.rows.flatMap(r => Object.keys(r.values).map(Number)))].sort((a, b) => a - b);
  const existing = await client.entities.SoilProbeChannel.filter({ probe_id: probe.id });
  const channels = new Map();
  const newChannels = [];
  for (const d of depths) {
    const ch = existing.find(c => c.depth_cm === d && c.sensor_type === 'soil_moisture');
    if (ch) channels.set(d, ch);
    else newChannels.push({ probe_id: probe.id, external_channel_id: `A${d}`, sensor_type: 'soil_moisture', depth_cm: d, unit: '%', active: true });
  }
  if (newChannels.length) {
    const created = await client.entities.SoilProbeChannel.bulkCreate(newChannels);
    created.forEach((c, i) => channels.set(newChannels[i].depth_cm, c));
  }

  // Persistencia incremental: solo lecturas posteriores a la última guardada
  const recents = await client.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 50);
  const lastTs = recents.length ? new Date(recents[0].timestamp).getTime() : 0;
  const payload = [];
  let maxTs = 0;
  for (const row of result.rows) {
    const t = new Date(row.timestamp).getTime();
    if (!Number.isFinite(t) || t <= lastTs) continue;
    if (t > maxTs) maxTs = t;
    for (const [depth, value] of Object.entries(row.values)) {
      const ch = channels.get(Number(depth));
      if (!ch) continue;
      const rec = {
        probe_id: probe.id,
        probe_channel_id: ch.id,
        lot_id: effectiveLotId,
        timestamp: row.timestamp,
        value,
        depth_cm: Number(depth),
        unit: '%',
        source: 'LIVE',
        quality_status: 'ok',
      };
      if (probe.monitoring_point_id) rec.monitoring_point_id = probe.monitoring_point_id;
      payload.push(rec);
    }
  }
  if (!payload.length) {
    return { ok: true, ingested: 0, connection_status: await markConnection(), message: staleDataMessage(), last_reading_at: probe.last_reading_at || null };
  }
  let ingested = 0;
  for (let i = 0; i < payload.length; i += 500) {
    const batch = payload.slice(i, i + 500);
    await client.entities.SensorReading.bulkCreate(batch);
    ingested += batch.length;
  }
  if (maxTs) {
    await client.entities.SoilProbe.update(probe.id, { connection_status: 'connected', last_reading_at: new Date(maxTs).toISOString() });
  }
  return {
    ok: true,
    ingested,
    timestamps: result.rows.length,
    channels: depths.length,
    last_reading_at: maxTs ? new Date(maxTs).toISOString() : (probe.last_reading_at || null),
  };
}