// ============================================================
// Sincronización de sondas Sentek: lógica compartida entre la
// función invocada desde la app (fetchSentekProbeData) y la tarea
// programada automática (syncAllSentekProbes).
// ============================================================
import { fetchSentekReadings } from './sentekAdapters.ts';

// Sincroniza una sonda: descubre profundidades, crea canales y
// persiste solo lecturas nuevas (incremental, sin duplicados).
// `client` es un cliente Base44 (usuario admin o service role).
export async function syncSentekProbe(client, probe) {
  const result = await fetchSentekReadings(probe, probe.last_reading_at);
  if (!result.ok) {
    await client.entities.SoilProbe.update(probe.id, { connection_status: result.status || 'error' });
    return { ok: false, status: result.status || 'error', message: result.message };
  }
  if (!result.rows.length) {
    return { ok: true, ingested: 0, message: result.message, last_reading_at: probe.last_reading_at || null };
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
        lot_id: probe.lot_id,
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