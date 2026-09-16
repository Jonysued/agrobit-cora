import { densityOf } from '@/lib/farmCalculations';
import { dataProvider } from './dataProvider';

// Valores por defecto cuando el lote no tiene configuración propia
const DEFAULTS = {
  useful_water_mm: 120, // agua útil total del suelo (mm)
  threshold_mm: 60,     // umbral mínimo de agua disponible (mm)
  etc_mm_day: null,     // ETc manual; null = dato simulado del proveedor
  pump_flow_m3h: 40,    // caudal de bomba (m³/h)
  pump_power_kw: 15,    // potencia de bomba (kW)
  energy_price: 120,    // tarifa energética ($/kWh)
};

const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

// mm que aporta un programa de riego a un lote — reutiliza IrrigationProgram
// (duración y porciones), IrrigationDesign (gotero) y la densidad del lote
function programMmForLot(program, lot, design, lotId) {
  if (!design || !program.duration_min) return null;
  const mmh = (design.emitter_flow_lh || 0) * (design.emitters_per_plant || 0) * densityOf(lot) / 10000;
  const hrs = Number(program.duration_min) / 60;
  if (!mmh || !hrs) return null;
  if (Array.isArray(program.items) && program.items.length) {
    return program.items
      .filter(i => i.lot_id === lotId)
      .reduce((s, i) => s + mmh * hrs * (i.factor != null ? i.factor : (i.portion && i.portion !== 'Completo' ? 0.5 : 1)), 0);
  }
  return mmh * hrs;
}

// ============================================================
// Capa de servicios — la interfaz nunca consulta Base44 ni fuentes
// externas directamente: recibe los datos de la app y devuelve el análisis.
// Flujo: ESTADO ACTUAL → FORECAST 7 DÍAS → NECESIDAD DE RIEGO → ENERGÍA
// ============================================================
export const waterEnergyService = {
  getLotWaterEnergy(lot, config, farmData) {
    const cfg = { ...DEFAULTS, ...(config || {}) };
    const design = (farmData.IrrigationDesign || []).find(d => d.lot_id === lot.id);
    const todayStr = isoDate(new Date());
    const horizonEnd = isoDate(addDays(7));

    // Programas de los próximos 7 días que incluyen a este lote
    const scheduled = (farmData.IrrigationProgram || []).filter(p =>
      ['Programado', 'Activo'].includes(p.status)
      && p.date >= todayStr && p.date <= horizonEnd
      && (p.lot_ids || []).includes(lot.id)
    );

    // 1. Estado actual
    const currentMm = dataProvider.getSoilWaterMm(lot, todayStr, cfg.useful_water_mm);
    const currentPct = currentMm / cfg.useful_water_mm;

    // 2. Forecast 7 días: ETc resta agua; riegos programados suman
    let ad = currentMm;
    const series = [{ day: 0, label: 'Hoy', date: todayStr, ad_mm: currentMm, irrigation_mm: 0, etc_mm: 0 }];
    const forecast = [];
    for (let i = 1; i <= 7; i++) {
      const dateStr = isoDate(addDays(i));
      const etc = cfg.etc_mm_day != null ? cfg.etc_mm_day : dataProvider.getDailyEtcMm(lot, dateStr);
      const irrigation = scheduled
        .filter(p => p.date === dateStr)
        .reduce((s, p) => { const mm = programMmForLot(p, lot, design, lot.id); return mm ? s + mm : s; }, 0);
      ad = Math.max(0, Math.min(cfg.useful_water_mm, ad - etc + irrigation));
      const point = {
        day: i,
        label: addDays(i).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }),
        date: dateStr,
        ad_mm: ad,
        irrigation_mm: irrigation,
        etc_mm: etc,
      };
      forecast.push(point);
      series.push(point);
    }

    // 3. Cuándo se alcanza el umbral y necesidad de riego (reponer hasta agua útil total)
    const hit = forecast.find(f => f.ad_mm <= cfg.threshold_mm);
    const daysToThreshold = hit ? hit.day : null;
    const needMm = hit ? Math.max(0, cfg.useful_water_mm - hit.ad_mm) : 0;

    // 4. Volumen → horas de bomba → energía → costo
    const volumeM3 = needMm * lot.area_ha * 10; // 1 mm sobre 1 ha = 10 m³
    const pumpHours = volumeM3 / cfg.pump_flow_m3h;
    const kwh = pumpHours * cfg.pump_power_kw;
    const cost = kwh * cfg.energy_price;

    const status = currentMm <= cfg.threshold_mm || (daysToThreshold != null && daysToThreshold <= 2)
      ? 'crítico'
      : daysToThreshold != null && daysToThreshold <= 4 ? 'alerta' : 'ok';

    return {
      lot, config: config || null, cfg,
      currentMm, currentPct,
      useful: cfg.useful_water_mm, threshold: cfg.threshold_mm,
      forecast, series,
      hit, daysToThreshold,
      needMm, volumeM3, pumpHours, kwh, cost,
      status, hasDesign: !!design, scheduledCount: scheduled.length,
    };
  },

  // Agregados de toda la operación
  getOverview(results) {
    return {
      lots: results.length,
      alerts: results.filter(r => r.status !== 'ok').length,
      mm: results.reduce((s, r) => s + r.needMm, 0),
      volumeM3: results.reduce((s, r) => s + r.volumeM3, 0),
      pumpHours: results.reduce((s, r) => s + r.pumpHours, 0),
      kwh: results.reduce((s, r) => s + r.kwh, 0),
      cost: results.reduce((s, r) => s + r.cost, 0),
    };
  },
};