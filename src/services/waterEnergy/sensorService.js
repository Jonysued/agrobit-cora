import { backend } from '@/api/backendClient';

// ============================================================
// sensorService — lectura de sondas y series temporales.
// Estructura: FINCA → LOTE → PUNTO DE MONITOREO → SONDA →
//             CANALES/PROFUNDIDADES → LECTURAS.
// Las profundidades NUNCA están hardcodeadas: se generan
// dinámicamente desde los canales de cada sonda.
// FUTURO: conectar proveedores externos (WiseConn, IrriMAX,
// CropX, …) reemplazando la lectura por adapters — solo cambia
// este archivo, la interfaz se mantiene.
// ============================================================
const DAY_MS = 86400000;

export const sensorService = {
  async getSensors() { return backend.entities.Sensor.list(); },

  async createSensor(data) { return backend.entities.Sensor.create(data); },
  async updateSensor(id, data) { return backend.entities.Sensor.update(id, data); },
  async deleteSensor(id) {
    await backend.entities.SensorReading.deleteMany({ sensor_id: id });
    return backend.entities.Sensor.delete(id);
  },

  // ---- Puntos de monitoreo (ubicación física, sin profundidad fija) ----
  async getMonitoringPoints(lotId) {
    const points = await backend.entities.SoilMonitoringPoint.list();
    return lotId ? points.filter(p => p.lot_id === lotId) : points;
  },

  // ---- Sondas de un punto (cada modelo puede tener distinta
  //      cantidad de sensores y distintas profundidades) ----
  async getProbesForMonitoringPoint(monitoringPointId) {
    const probes = await backend.entities.SoilProbe.filter({ monitoring_point_id: monitoringPointId });
    return probes.filter(p => p.active !== false);
  },

  // ---- Canales/profundidades reales de una sonda (ordenadas por profundidad) ----
  async getProbeChannels(probeId) {
    const channels = await backend.entities.SoilProbeChannel.filter({ probe_id: probeId });
    return channels
      .filter(c => c.active !== false && c.sensor_type === 'soil_moisture')
      .sort((a, b) => a.depth_cm - b.depth_cm);
  },

  async getAllProbeChannels(probeId) {
    const channels = await backend.entities.SoilProbeChannel.filter({ probe_id: probeId });
    return channels.filter(c => c.active !== false).sort((a, b) => a.depth_cm - b.depth_cm);
  },

  // ---- Lecturas de una sonda dentro de un rango (ascendentes) ----
  // El rango de fechas se filtra en el SERVIDOR ($gte/$lte) para no
  // traer todo el histórico cuando crece (sondas con miles de filas).
  async getProbeReadings(probeId, from, to) {
    const query = { probe_id: probeId };
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from).toISOString();
      if (to) query.timestamp.$lte = new Date(to).toISOString();
    }
    const rows = await backend.entities.SensorReading.filter(query, '-timestamp', 5000);
    return rows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  },

  // ---- Última lectura de cada canal de la sonda ----
  async getLatestProbeReadings(probeId) {
    const [channels, readings] = await Promise.all([
      this.getProbeChannels(probeId),
      backend.entities.SensorReading.filter({ probe_id: probeId }, '-timestamp', 300),
    ]);
    return channels.map(c => ({ channel: c, reading: readings.find(r => r.probe_channel_id === c.id) || null }));
  },

  // ---- Serie histórica de una profundidad específica ----
  async getReadingsByDepth(probeId, depthCm, from, to) {
    const channels = await this.getProbeChannels(probeId);
    const target = channels.find(c => c.depth_cm === depthCm);
    if (!target) return [];
    const readings = await this.getProbeReadings(probeId, from, to);
    return readings.filter(r => r.probe_channel_id === target.id);
  },

  // ---- Sincronización con proveedores externos (preparado, sin API aún) ----
  // Cuando se conecten WiseConn / IrriMAX / CropX, este método traerá
  // lecturas de la API del proveedor y las persistirá evitando
  // duplicados por probe_channel_id + timestamp.
  async refreshSensorData(probeId) {
    return {
      probeId,
      status: 'not_connected',
      message: 'Sin proveedor externo conectado todavía. Se muestran los datos cargados (manual, CSV o demo).',
    };
  },

  // ---- Puntos de monitoreo y sondas: CRUD (Configuración → Sensores) ----
  async getProbes() { return backend.entities.SoilProbe.list(); },
  // Vincula una sonda a un lote (Vinculación de perfiles): le asigna el
  // lote y le asegura un punto de monitoreo en ese lote. Los puntos se
  // gestionan automáticamente — la UI nunca los manipula.
  async attachProbeToLot(probeId, lotId) {
    const probe = await backend.entities.SoilProbe.get(probeId);
    if (!probe) return null;
    let pointId = probe.monitoring_point_id;
    const lotPoints = await backend.entities.SoilMonitoringPoint.filter({ lot_id: lotId });
    if (!pointId || !lotPoints.some(p => p.id === pointId)) {
      pointId = lotPoints[0]?.id
        || (await backend.entities.SoilMonitoringPoint.create({ lot_id: lotId, name: `Punto ${probe.name}`, active: true })).id;
    }
    return backend.entities.SoilProbe.update(probeId, { lot_id: lotId, monitoring_point_id: pointId });
  },
  async createMonitoringPoint(data) { return backend.entities.SoilMonitoringPoint.create(data); },
  async updateMonitoringPoint(id, data) { return backend.entities.SoilMonitoringPoint.update(id, data); },
  async deleteMonitoringPoint(id) {
    const probes = await backend.entities.SoilProbe.filter({ monitoring_point_id: id });
    for (const probe of probes) await this.deleteProbe(probe.id);
    return backend.entities.SoilMonitoringPoint.delete(id);
  },
  async createProbe(data) { return backend.entities.SoilProbe.create(data); },
  async updateProbe(id, data) { return backend.entities.SoilProbe.update(id, data); },
  async deleteProbe(id) {
    await backend.entities.SoilProbeChannel.deleteMany({ probe_id: id });
    await backend.entities.SensorReading.deleteMany({ probe_id: id });
    return backend.entities.SoilProbe.delete(id);
  },

  // ---- Lecturas del esquema anterior (sensores simples por lote) ----
  // Map<lot_id, [{id, timestamp, value, depth_cm}]>
  async getRecentSoilReadings(days = 8) {
    const [sensors, readings] = await Promise.all([
      this.getSensors(),
      backend.entities.SensorReading.list('-timestamp', 1000),
    ]);
    const moisture = new Set(sensors.filter(s => s.sensor_type === 'soil_moisture').map(s => s.id));
    const from = Date.now() - days * DAY_MS;
    const byLot = new Map();
    readings
      .filter(r => moisture.has(r.sensor_id) && new Date(r.timestamp).getTime() >= from)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .forEach(r => {
        if (!byLot.has(r.lot_id)) byLot.set(r.lot_id, []);
        byLot.get(r.lot_id).push(r);
      });
    return byLot;
  },
};
