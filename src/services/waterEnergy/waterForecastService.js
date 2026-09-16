import { base44 } from '@/api/base44Client';
import { sensorService } from './sensorService';
import { weatherService } from './weatherService';
import { energyService } from './energyService';
import { irrigationRecommendationService } from './irrigationRecommendationService';
import { runScenario, waterAvailablePercent, statusForVwc } from './engine/waterBalanceEngine';

// ============================================================
// waterForecastService — orquestador del módulo Water & Energy.
// Resuelve internamente de dónde viene cada dato (sensores,
// clima, perfiles) y devuelve el análisis listo para la UI.
// La interfaz solo llama: waterForecastService.getForecast(lotId)
// FUTURO: el forecast puede provenir de una API externa
// (https://api.[dominio]/water-forecast) — solo cambia este archivo.
// MODELO EXPERIMENTAL — no es una predicción agronómica validada.
// ============================================================

// Fila de análisis de un lote (compartida por dashboard y detalle)
function buildRow(lot, profile, allHist, weatherDays, pumps, tariffs) {
  // Vinculación del perfil: sensor de humedad definido en configuración.
  // Bomba y tarifa son globales: la misma tarifa energética aplica a todos los lotes.
  const hist = profile.sensor_id ? allHist.filter(r => r.sensor_id === profile.sensor_id) : allHist;
  const pump = energyService.getPumpForLot(pumps, lot);
  const tariff = energyService.getActiveTariff(tariffs);
  const currentVwc = hist.length ? hist[hist.length - 1].value : profile.initial_vwc;
  const inputs = weatherDays.map(w => ({ date: w.date, etcMm: w.etc_mm, rainMm: w.effective_rainfall_mm }));
  const scenarioA = runScenario(profile, currentVwc, inputs); // sin riego
  const { recommendation, scenarioB } = irrigationRecommendationService.withRecommendation(profile, lot, currentVwc, inputs, scenarioA);
  const energy = recommendation ? energyService.compute(recommendation.recommended_irrigation_m3, pump, tariff) : null;
  return {
    lot,
    profile,
    currentVwc,
    currentPct: Math.round(waterAvailablePercent(profile, currentVwc)),
    scenarioA,
    scenarioB,
    recommendation,
    energy,
    pump,
    tariff,
    weather: weatherDays,
    status: statusForVwc(profile, currentVwc),
    belowWilting: scenarioA.some(p => p.belowWilting),
  };
}

export const waterForecastService = {
  // ---- Datos base (lotes y perfiles) ----
  async getLots() { return base44.entities.Lot.list(); },
  async getProfiles() { return base44.entities.SoilProfile.list(); },
  async saveProfile(data) {
    return data.id ? base44.entities.SoilProfile.update(data.id, data) : base44.entities.SoilProfile.create(data);
  },
  async deleteProfile(id) { return base44.entities.SoilProfile.delete(id); },

  // ---- Dashboard: filas por lote + totales de 7 días ----
  async getFarmOverview() {
    const [lots, profiles, readings, pumps, tariffs] = await Promise.all([
      this.getLots(),
      this.getProfiles(),
      sensorService.getRecentSoilReadings(8),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const tariff = energyService.getActiveTariff(tariffs);
    const weather = await weatherService.getFarmForecast(lots);
    const rows = lots.map(lot => {
      const profile = profiles.find(p => p.lot_id === lot.id);
      if (!profile) return { lot, profile: null, status: 'sin-perfil' };
      return buildRow(lot, profile, readings.get(lot.id) || [], weather.get(lot.id) || [], pumps, tariffs);
    });
    const withProfile = rows.filter(r => r.profile);
    const totals = {
      lots: lots.length,
      monitored: withProfile.length,
      unprofiled: rows.length - withProfile.length,
      avgPct: withProfile.length ? Math.round(withProfile.reduce((s, r) => s + r.currentPct, 0) / withProfile.length) : null,
      volumeM3: Math.round(withProfile.reduce((s, r) => s + (r.recommendation?.recommended_irrigation_m3 || 0), 0)),
      kwh: Math.round(withProfile.reduce((s, r) => s + (r.energy?.kwh || 0), 0)),
      cost: Math.round(withProfile.reduce((s, r) => s + (r.energy?.cost || 0), 0)),
    };
    return { rows, totals, tariff };
  },

  // ---- Detalle de un lote: histórico + HOY + forecast a 7 días ----
  async getLotDetail(lotId) {
    const lots = await this.getLots();
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return null;
    const [profiles, readings, pumps, tariffs] = await Promise.all([
      this.getProfiles(),
      sensorService.getRecentSoilReadings(9),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    const profile = profiles.find(p => p.lot_id === lotId);
    const allHist = readings.get(lotId) || [];
    const hist = profile?.sensor_id ? allHist.filter(r => r.sensor_id === profile.sensor_id) : allHist;
    const history = hist.slice(0, -1).map(r => ({ date: r.timestamp.slice(0, 10), vwc: r.value }));
    if (!profile) return { lot, profile: null, history };
    const weather = await weatherService.getFarmForecast([lot]);
    const row = buildRow(lot, profile, hist, weather.get(lot.id) || [], pumps, tariffs);
    return { ...row, history };
  },
};