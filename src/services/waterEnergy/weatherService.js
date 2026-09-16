import { base44 } from '@/api/base44Client';

// ============================================================
// weatherService — pronóstico meteorológico y ET0/ETc.
// Fuente actual: registros WeatherForecast cargados manualmente;
// si un lote no tiene registros, se generan datos DEMO simulados.
// FUTURO: reemplazar por una API meteorológica externa —
// solo cambia este archivo, la interfaz se mantiene.
// ============================================================
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const round1 = n => Math.round(n * 10) / 10;

// Pseudoaleatorio determinista (datos demo estables por lote/fecha)
const seeded01 = key => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ((h % 997) / 997 + (h % 89) / 89) / 2;
};

const kcFor = lot => {
  const c = (lot.crop || '').toLowerCase();
  if (c.includes('oli')) return 0.6;
  if (c.includes('gran')) return 0.7;
  return 0.65;
};

function simulateForLot(lot, dateStr) {
  const kc = kcFor(lot);
  const eto = round1(3.6 + 2.2 * seeded01(`${lot.id}|eto|${dateStr}`));
  const rainChance = seeded01(`${lot.id}|rain|${dateStr}`);
  const rainfall = rainChance > 0.85 ? round1(rainChance * 8) : 0;
  return {
    lot_id: lot.id,
    date: dateStr,
    eto_mm: eto,
    kc,
    etc_mm: round1(eto * kc),
    rainfall_mm: rainfall,
    effective_rainfall_mm: rainfall ? round1(rainfall * 0.7) : 0,
    temperature_min_c: round1(11 + 7 * seeded01(`${lot.id}|tmin|${dateStr}`)),
    temperature_max_c: round1(23 + 9 * seeded01(`${lot.id}|tmax|${dateStr}`)),
    simulated: true,
  };
}

export const weatherService = {
  async saveForecast(data) { return base44.entities.WeatherForecast.create(data); },

  // Devuelve Map<lot_id, [pronóstico × 7 días a partir de mañana]>
  async getFarmForecast(lots) {
    const stored = await base44.entities.WeatherForecast.list();
    const map = new Map();
    for (const lot of lots) {
      const days = [];
      for (let i = 1; i <= 7; i++) {
        const dateStr = isoDate(addDays(i));
        const rec = stored.find(r => r.lot_id === lot.id && r.date === dateStr);
        days.push(rec ? { ...rec, simulated: false } : simulateForLot(lot, dateStr));
      }
      map.set(lot.id, days);
    }
    return map;
  },
};