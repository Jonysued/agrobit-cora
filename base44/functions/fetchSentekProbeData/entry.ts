import { createClientFromRequest } from 'npm:@base44/sdk@0.8.48';
import { fetchSentekReadings } from '../../shared/sentekAdapters.ts';

// Sincroniza una sonda Sentek (IrriMAX Live): descubre las profundidades
// reales de la sonda, crea los canales si no existen e ingiere las
// lecturas desde la última sincronización (o 14 días la primera vez),
// persistiéndolas sin duplicados. Admin only — la API key vive como
// secret del backend y nunca llega al frontend.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const { probe_id } = await req.json();
    if (!probe_id) return Response.json({ error: 'Falta probe_id' }, { status: 400 });
    const probe = await base44.entities.SoilProbe.get(probe_id);
    const result = await fetchSentekReadings(probe, probe.last_reading_at);
    if (!result.ok) {
      await base44.entities.SoilProbe.update(probe_id, { connection_status: result.status || 'error' });
      return Response.json({ ok: false, error: result.message }, { status: 502 });
    }
    if (!result.rows.length) {
      return Response.json({ ok: true, ingested: 0, message: result.message, last_reading_at: probe.last_reading_at || null });
    }

    // Canales reales de la sonda: uno por profundidad con sensor de humedad
    const depths = [...new Set(result.rows.flatMap(r => Object.keys(r.values).map(Number)))].sort((a, b) => a - b);
    const existing = await base44.entities.SoilProbeChannel.filter({ probe_id });
    const channels = new Map();
    const newChannels = [];
    for (const d of depths) {
      const ch = existing.find(c => c.depth_cm === d && c.sensor_type === 'soil_moisture');
      if (ch) channels.set(d, ch);
      else newChannels.push({ probe_id, external_channel_id: `A${d}`, sensor_type: 'soil_moisture', depth_cm: d, unit: '%', active: true });
    }
    if (newChannels.length) {
      const created = await base44.entities.SoilProbeChannel.bulkCreate(newChannels);
      created.forEach((c, i) => channels.set(newChannels[i].depth_cm, c));
    }

    // Persistencia incremental: solo lecturas posteriores a la última guardada
    const recents = await base44.entities.SensorReading.filter({ probe_id }, '-timestamp', 50);
    const lastTs = recents.length ? new Date(recents[0].timestamp).getTime() : 0;
    let payload = [];
    let maxTs = 0;
    for (const row of result.rows) {
      const t = new Date(row.timestamp).getTime();
      if (!Number.isFinite(t) || t <= lastTs) continue;
      if (t > maxTs) maxTs = t;
      for (const [depth, value] of Object.entries(row.values)) {
        const ch = channels.get(Number(depth));
        if (!ch) continue;
        payload.push({
          probe_id,
          probe_channel_id: ch.id,
          lot_id: probe.lot_id || null,
          monitoring_point_id: probe.monitoring_point_id || null,
          timestamp: row.timestamp,
          value,
          depth_cm: Number(depth),
          unit: '%',
          source: 'LIVE',
          quality_status: 'ok',
        });
      }
    }
    let ingested = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const batch = payload.slice(i, i + 500);
      await base44.entities.SensorReading.bulkCreate(batch);
      ingested += batch.length;
    }
    if (maxTs) {
      await base44.entities.SoilProbe.update(probe_id, { connection_status: 'connected', last_reading_at: new Date(maxTs).toISOString() });
    }
    return Response.json({
      ok: true,
      ingested,
      timestamps: result.rows.length,
      channels: depths.length,
      last_reading_at: maxTs ? new Date(maxTs).toISOString() : (probe.last_reading_at || null),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}