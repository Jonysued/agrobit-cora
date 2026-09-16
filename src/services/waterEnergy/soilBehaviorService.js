import { base44 } from '@/api/base44Client';
import { soilWaterService } from './soilWaterService';

// ============================================================
// soilBehaviorService — MODELO DE COMPORTAMIENTO DEL SUELO.
//
// LA SONDA NO MIDE LA HUMEDAD DE LOS LOTES. La sonda es una
// REFERENCIA para aprender cómo responde un suelo:
//
//   SONDA → APRENDER COMPORTAMIENTO → SoilBehaviorModel
//         → se aplica a cada lote → curva particular del lote
//
// El modelo aprende, a partir del histórico de la sonda de
// referencia y de eventos conocidos (riegos del sitio de
// referencia, lluvia observada):
//   · recharge_efficiency: cuánta agua de un riego queda
//     realmente almacenada en el perfil (ej. 0.80 = 80%).
//   · depletion_rate_mm_day: agotamiento diario observado en
//     días sin eventos.
// V1 experimental: la calibración se dispara desde la página de
// configuración; el forecast usa los valores aprendidos (si el
// modelo no está calibrado, eficiencia de recarga por defecto 1).
// ============================================================
const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;
const CALIBRATION_MAX_AGE_MS = 7 * 86400000;
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAfter = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };

// Lámina de un programa que corresponde a un lote (mm × factor del lote)
function lotIrrigationMm(program, lotId) {
  const item = (program.items || []).find(i => i.lot_id === lotId);
  return (program.mm || 0) * (item?.factor ?? 1);
}

// Riego aplicado en el sitio de referencia (lote de la sonda), por fecha
async function referenceIrrigationByDate(lotId) {
  if (!lotId) return new Map();
  const programs = await base44.entities.IrrigationProgram.list();
  const byDate = new Map();
  for (const p of programs) {
    if (!p.date || !(p.lot_ids || []).includes(lotId)) continue;
    byDate.set(p.date, round1((byDate.get(p.date) || 0) + lotIrrigationMm(p, lotId)));
  }
  return byDate;
}

// ---- Calibración: aprender el comportamiento del suelo de referencia ----
// Cruza el histórico de agua útil de la sonda con los eventos conocidos
// (riegos con lámina conocida + lluvia observada) y estima:
//  · eficiencia de recarga = subida observada / agua ingresada
//  · tasa de agotamiento en días sin eventos
async function calibrateModel(model, probes) {
  const probe = probes.find(p => p.id === model.reference_probe_id);
  if (!probe) return { calibration_status: 'sin_sonda' };
  const analysis = await soilWaterService.getProbeAnalysis(probe.id).catch(() => null);
  const history = analysis?.history || [];
  if (history.length < 3) return { calibration_status: 'sin_datos', sample_count: 0 };

  // Serie diaria de agua útil (mm) del perfil de referencia
  const byDay = new Map();
  for (const h of history) byDay.set(new Date(h.t).toISOString().slice(0, 10), h.mm);
  const days = [...byDay.keys()].sort();

  // Eventos de entrada de agua con lámina conocida
  const irrByDate = await referenceIrrigationByDate(probe.lot_id);
  const events = [
    ...(analysis.events?.irrigation || []).map(d => ({ date: d, mm: irrByDate.get(d) || 0 })),
    ...(analysis.events?.rain || []),
  ].filter(e => e.mm > 0);

  // Eficiencia de recarga: subida del perfil tras cada evento
  const effSamples = [];
  for (const ev of events) {
    const before = [...days].reverse().find(d => d < ev.date);
    const after = days.find(d => d >= ev.date && d <= dayAfter(ev.date, 2));
    if (!before || !after) continue;
    const rise = byDay.get(after) - byDay.get(before);
    if (rise > 0) effSamples.push(Math.min(1, rise / ev.mm));
  }
  // Agotamiento diario medio en días sin eventos
  const eventDays = new Set(events.map(e => e.date));
  const depletionSamples = [];
  for (let i = 1; i < days.length; i++) {
    if (eventDays.has(days[i]) || eventDays.has(days[i - 1])) continue;
    const delta = byDay.get(days[i]) - byDay.get(days[i - 1]);
    if (delta < 0 && delta > -10) depletionSamples.push(-delta);
  }
  const recharge_efficiency = effSamples.length
    ? round2(effSamples.reduce((s, v) => s + v, 0) / effSamples.length)
    : null;
  const depletion_rate_mm_day = depletionSamples.length
    ? round1(depletionSamples.reduce((s, v) => s + v, 0) / depletionSamples.length)
    : null;
  const sample_count = effSamples.length + depletionSamples.length;
  const calibration_status = effSamples.length >= 3 ? 'calibrated' : effSamples.length ? 'partial' : 'uncalibrated';
  return { recharge_efficiency, depletion_rate_mm_day, sample_count, calibration_status };
}

export const soilBehaviorService = {
  async getModels() { return base44.entities.SoilBehaviorModel.list(); },

  // Asegura que exista un modelo de suelo por cada sonda (la sonda es
  // la referencia del modelo) y recalibra los modelos con calibración
  // vencida (> 7 días). Devuelve la lista completa de modelos.
  async ensureModelsForProbes(probes, { recalibrate = true } = {}) {
    const models = await this.getModels();
    const out = [...models];
    for (const probe of (probes || [])) {
      let m = out.find(x => x.reference_probe_id === probe.id);
      if (!m) {
        m = await base44.entities.SoilBehaviorModel.create({
          name: `Modelo de suelo · ${probe.name}`,
          reference_probe_id: probe.id,
          calibration_status: 'uncalibrated',
          sample_count: 0,
        });
        out.push(m);
      }
      const stale = !m.last_calibration_at
        || (Date.now() - new Date(m.last_calibration_at).getTime()) > CALIBRATION_MAX_AGE_MS;
      if (recalibrate && stale) {
        const learned = await calibrateModel(m, probes || []);
        const updated = await base44.entities.SoilBehaviorModel.update(m.id, {
          ...learned,
          last_calibration_at: new Date().toISOString(),
        });
        out[out.indexOf(m)] = updated;
      }
    }
    return out;
  },

  // Modelo de suelo vinculado a un perfil: explícito
  // (soil_behavior_model_id) o derivado del vínculo histórico con la
  // sonda (probe_id → modelo con esa referencia).
  getModelForProfile(profile, models) {
    if (!profile) return null;
    return (models || []).find(m => m.id === profile.soil_behavior_model_id)
      || (models || []).find(m => m.reference_probe_id === profile.probe_id)
      || null;
  },
};