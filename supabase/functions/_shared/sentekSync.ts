// ============================================================
// Sincronización de sondas Sentek: lógica compartida entre la
// función invocada desde la app (fetchSentekProbeData) y la tarea
// programada automática (syncAllSentekProbes).
// ============================================================
import { fetchSentekReadings } from './sentekAdapters.ts';

// Una sonda que demora más de 3 h queda visible como DEMORADA; recién
// después de 12 h pasa a DESCONECTADA. Así una lectura de 10 h nunca
// vuelve a mostrarse engañosamente como "conectada".
export const DELAYED_MS = 3 * 3600000;
export const DISCONNECTED_MS = 12 * 3600000;

export function probeConnectionStatus(timestamp) {
  const time = timestamp ? new Date(timestamp).getTime() : 0;
  if (!time || !Number.isFinite(time)) return 'disconnected';
  const age = Math.max(0, Date.now() - time);
  if (age > DISCONNECTED_MS) return 'disconnected';
  if (age > DELAYED_MS) return 'delayed';
  return 'connected';
}

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
    const connection_status = probeConnectionStatus(refMs ? new Date(refMs).toISOString() : null);
    await client.entities.SoilProbe.update(probe.id, { connection_status });
    return connection_status;
  };
  if (!result.rows.length) {
    return { ok: true, ingested: 0, connection_status: await markConnection(), message: staleDataMessage(), last_reading_at: probe.last_reading_at || null };
  }

  // Canales reales de la sonda: humedad, temperatura y conductividad/
  // salinidad, exactamente como los describe IrriMAX Live.
  const measurements = result.rows.flatMap(row => row.measurements || []);
  const definitions = [...new Map(measurements.map(item => [
    `${item.sensor_type}|${item.depth_cm}|${item.external_channel_id}`,
    item,
  ])).values()];
  const existing = await client.entities.SoilProbeChannel.filter({ probe_id: probe.id });
  const channels = new Map();
  const newChannels = [];
  for (const definition of definitions) {
    const key = `${definition.sensor_type}|${definition.depth_cm}|${definition.external_channel_id}`;
    const ch = existing.find(c => c.sensor_type === definition.sensor_type && c.depth_cm === definition.depth_cm);
    if (ch) channels.set(key, ch);
    else newChannels.push({
      probe_id: probe.id,
      external_channel_id: definition.external_channel_id,
      sensor_type: definition.sensor_type,
      depth_cm: definition.depth_cm,
      unit: definition.unit,
      active: true,
      _key: key,
    });
  }
  if (newChannels.length) {
    const created = await client.entities.SoilProbeChannel.bulkCreate(newChannels.map(({ _key, ...channel }) => channel));
    created.forEach((channel, i) => channels.set(newChannels[i]._key, channel));
  }

  // Persistencia incremental: solo lecturas posteriores a la última guardada
  const recents = await client.entities.SensorReading.filter({ probe_id: probe.id }, '-timestamp', 1000);
  const lastByChannel = new Map();
  for (const reading of recents) {
    const timestamp = new Date(reading.timestamp).getTime();
    if (timestamp > (lastByChannel.get(reading.probe_channel_id) || 0)) lastByChannel.set(reading.probe_channel_id, timestamp);
  }
  const payload = [];
  let maxTs = 0;
  for (const row of result.rows) {
    const t = new Date(row.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > maxTs) maxTs = t;
    for (const measurement of row.measurements || []) {
      const key = `${measurement.sensor_type}|${measurement.depth_cm}|${measurement.external_channel_id}`;
      const ch = channels.get(key);
      if (!ch) continue;
      if (t <= (lastByChannel.get(ch.id) || 0)) continue;
      const rec = {
        probe_id: probe.id,
        probe_channel_id: ch.id,
        lot_id: effectiveLotId,
        timestamp: row.timestamp,
        value: measurement.value,
        depth_cm: measurement.depth_cm,
        unit: measurement.unit,
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
    const last_reading_at = new Date(maxTs).toISOString();
    const connection_status = probeConnectionStatus(last_reading_at);
    await client.entities.SoilProbe.update(probe.id, {
      connection_status,
      last_reading_at,
    });
    return {
      ok: true,
      ingested,
      timestamps: result.rows.length,
      channels: definitions.length,
      connection_status,
      last_reading_at,
    };
  }
  return {
    ok: true,
    ingested,
    timestamps: result.rows.length,
    channels: definitions.length,
    last_reading_at: maxTs ? new Date(maxTs).toISOString() : (probe.last_reading_at || null),
  };
}
