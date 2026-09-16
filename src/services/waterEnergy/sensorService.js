import { base44 } from '@/api/base44Client';

// ============================================================
// sensorService — lectura de sensores y series temporales.
// Fuente actual: entidades Base44 (Sensor / SensorReading).
// FUTURO: reemplazar la lectura por una API IoT externa —
// solo cambia este archivo, la interfaz se mantiene.
// ============================================================
const DAY_MS = 86400000;

export const sensorService = {
  async getSensors() { return base44.entities.Sensor.list(); },

  async createSensor(data) { return base44.entities.Sensor.create(data); },
  async updateSensor(id, data) { return base44.entities.Sensor.update(id, data); },
  async deleteSensor(id) {
    await base44.entities.SensorReading.deleteMany({ sensor_id: id });
    return base44.entities.Sensor.delete(id);
  },

  // Lecturas recientes de sensores de humedad, agrupadas por lote y orden ascendente.
  // Devuelve Map<lot_id, [{id, timestamp, value, depth_cm}]>
  async getRecentSoilReadings(days = 8) {
    const [sensors, readings] = await Promise.all([
      this.getSensors(),
      base44.entities.SensorReading.list('-timestamp', 1000),
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