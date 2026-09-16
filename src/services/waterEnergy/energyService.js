import { base44 } from '@/api/base44Client';

// ============================================================
// energyService — bombas, tarifas y cálculo energético.
// Fuente actual: entidades Base44 (Pump / EnergyTariff).
// FUTURO: el optimizador energético puede provenir de una API
// externa (https://api.[dominio]/energy-optimizer) — solo cambia
// este archivo, la interfaz se mantiene.
// Todos los resultados son ESTIMACIONES.
// ============================================================
const DEFAULT_TARIFF = { name: 'Tarifa por defecto', price_per_kwh: 150 };

export const energyService = {
  async getPumps() { return base44.entities.Pump.list(); },
  async savePump(data) {
    return data.id ? base44.entities.Pump.update(data.id, data) : base44.entities.Pump.create(data);
  },
  async deletePump(id) { return base44.entities.Pump.delete(id); },

  async getTariffs() { return base44.entities.EnergyTariff.list(); },
  async saveTariff(data) {
    return data.id ? base44.entities.EnergyTariff.update(data.id, data) : base44.entities.EnergyTariff.create(data);
  },
  async deleteTariff(id) { return base44.entities.EnergyTariff.delete(id); },

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

  // ESTIMACIÓN — energía para bombear volumeM3
  compute(volumeM3, pump, tariff) {
    if (!pump || !pump.flow_m3_h || !volumeM3) return null;
    const hours = volumeM3 / pump.flow_m3_h;
    const kwh = hours * pump.power_kw;
    const cost = kwh * (tariff?.price_per_kwh ?? DEFAULT_TARIFF.price_per_kwh);
    return {
      hours: Math.round(hours * 10) / 10,
      kwh: Math.round(kwh),
      cost: Math.round(cost),
      kwhPerM3: Math.round((pump.power_kw / pump.flow_m3_h) * 1000) / 1000,
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