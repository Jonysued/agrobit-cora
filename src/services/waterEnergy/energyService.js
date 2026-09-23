import { backend } from '@/api/backendClient';
import { densityOf } from '@/lib/farmCalculations';

// ============================================================
// energyService — bombas, tarifas y cálculo energético.
// Fuente actual: tablas Supabase (Pump / EnergyTariff).
// FUTURO: el optimizador energético puede provenir de una API
// externa (https://api.[dominio]/energy-optimizer) — solo cambia
// este archivo, la interfaz se mantiene.
// Todos los resultados son ESTIMACIONES.
// ============================================================
const DEFAULT_TARIFF = { name: 'Tarifa por defecto', price_per_kwh: 150 };

export const energyService = {
  async getPumps() { return backend.entities.Pump.list(); },
  async savePump(data) {
    return data.id ? backend.entities.Pump.update(data.id, data) : backend.entities.Pump.create(data);
  },
  async deletePump(id) { return backend.entities.Pump.delete(id); },

  async getTariffs() { return backend.entities.EnergyTariff.list(); },
  async saveTariff(data) {
    return data.id ? backend.entities.EnergyTariff.update(data.id, data) : backend.entities.EnergyTariff.create(data);
  },
  async deleteTariff(id) { return backend.entities.EnergyTariff.delete(id); },

  getActiveTariff(tariffs) { return tariffs[0] || DEFAULT_TARIFF; },

  // Bomba asociada al lote: primero la vinculada al perfil de suelo,
  // luego por lote, por sector, o la general
  getPumpForLot(pumps, lot, profile) {
    if (profile?.pump_id) {
      const linked = pumps.find(p => p.id === profile.pump_id);
      if (linked) return linked;
    }
    const active = pumps.filter(p => p.active !== false);
    return active.find(p => p.lot_id === lot?.id)
      || active.find(p => p.irrigation_sector && p.irrigation_sector === lot?.sector)
      || active[0]
      || null;
  },

  // LÁMINA POR HORA del equipo de riego del lote (mm/h) — MISMA
  // fórmula que la vista previa de la pestaña Riego y que la lámina
  // de los programas en la curva hídrica (lotIrrigationMm): caudal
  // por planta (emisor × emisores por planta) repartido en el marco
  // de plantación. Una sola fórmula garantiza que las horas de la
  // recomendación coincidan con las horas de un programa de riego
  // para la misma lámina.
  applicationRateMmH(design, lot) {
    if (!design?.emitter_flow_lh || !design?.emitters_per_plant) return null;
    if (!lot?.row_spacing || !lot?.plant_spacing) return null;
    const mmh = design.emitter_flow_lh * design.emitters_per_plant * densityOf(lot) / 10000;
    return mmh > 0 ? Math.round(mmh * 100) / 100 : null;
  },

  // ESTIMACIÓN — energía para bombear volumeM3. Si el lote tiene
  // DISEÑO DE RIEGO, las horas se calculan con la lámina que el
  // equipo aplica por hora (mm/h); si no, con el caudal de la bomba.
  compute(volumeM3, pump, tariff, rateMmH = null, recommendedMm = null) {
    const hours = rateMmH && recommendedMm ? recommendedMm / rateMmH
      : (pump?.flow_m3_h && volumeM3 ? volumeM3 / pump.flow_m3_h : null);
    if (hours == null || !pump?.power_kw) return null;
    const kwh = hours * pump.power_kw;
    const cost = kwh * (tariff?.price_per_kwh ?? DEFAULT_TARIFF.price_per_kwh);
    return {
      hours: Math.round(hours * 10) / 10,
      kwh: Math.round(kwh),
      cost: Math.round(cost),
      kwhPerM3: pump.flow_m3_h ? Math.round((pump.power_kw / pump.flow_m3_h) * 1000) / 1000 : null,
      applicationRateMmH: rateMmH,
    };
  },

  // Proyección por bomba + métricas globales, a partir de las filas del forecast
  getEnergyOverview(rows) {
    const pumpMap = new Map();
    rows.filter(r => r.profile && r.pump).forEach(r => {
      const e = pumpMap.get(r.pump.id) || { pump: r.pump, hours: 0, kwh: 0, cost: 0, lots: 0 };
      if (r.energy) { e.hours += r.energy.hours; e.kwh += r.energy.kwh; e.cost += r.energy.cost; }
      e.lots += 1;
      pumpMap.set(r.pump.id, e);
    });
    const pumpStats = [...pumpMap.values()].map(e => ({
      ...e,
      kwhPerM3: e.pump.flow_m3_h ? Math.round((e.pump.power_kw / e.pump.flow_m3_h) * 1000) / 1000 : null,
    }));
    const profiled = rows.filter(r => r.profile);
    const totalArea = profiled.reduce((s, r) => s + (r.lot.area_ha || 0), 0);
    const totalKwh = pumpStats.reduce((s, e) => s + e.kwh, 0);
    return {
      pumpStats,
      totalKwh,
      totalHours: Math.round(pumpStats.reduce((s, e) => s + e.hours, 0) * 10) / 10,
      totalCost: pumpStats.reduce((s, e) => s + e.cost, 0),
      kwhPerHa: totalArea > 0 ? Math.round((totalKwh / totalArea) * 10) / 10 : null,
    };
  },
};
