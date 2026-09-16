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
// V1 experimental: la calibración es una acción EXPLÍCITA del usuario
// (botón "Calibrar modelo" en Configuración → Vinculación de perfiles);
// el forecast usa los valores aprendidos (si el modelo no está
// calibrado, eficiencia de recarga por defecto 1).
// ============================================================
const round1 = n => Math.round(n * 10) / 10;
const round2 = n => Math.round(n * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAfter = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };

// Lámina de un programa que corresponde a un lote (mm × factor del lote)
function lotIrrigationMm(program, lotId) {
  const item = (program.items || []).find(i => i.lot_id === lotId);
  return (program.mm || 0) * (item?.factor ?? 1);
}

// Riego EJECUTADO en el sitio de referencia (lote de la sonda), por
// fecha. Solo IrrigationLog: un programa sin log no prueba que el
// riego realmente ocurrió.
async function referenceExecutedIrrigationByDate(lotId) {
  if (!lotId) return new Map();
  const [logs, programs] = await Promise.all([
    base44.entities.IrrigationLog.list(),
    base44.entities.IrrigationProgram.list(),
  ]);
  const programById = new Map(programs.map(p => [p.id, p]));
  const byDate = new Map();
  for (const log of logs) {
    const p = programById.get(log.program_id);
    if (!p || !log.date || !(p.lot_ids || []).includes(lotId)) continue;
    byDate.set(log.date, round1((byDate.get(log.date) || 0) + lotIrrigationMm(p, lotId)));
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
  const analysis = await soilWaterService.getProbeAnalysis(probe.id).catch(e => {
    console.error('[soilBehaviorService] No se pudo analizar la sonda de referencia:', e);
    return null;
  });
  const history = analysis?.history || [];
  if (history.length < 3) return { calibration_status: 'sin_datos', sample_count: 0 };

  // Serie diaria de agua útil (mm) del perfil de referencia
  const byDay = new Map();
  for (const h of history) byDay.set(new Date(h.t).toISOString().slice(0, 10), h.mm);
  const days = [...byDay.keys()].sort();

  // Eventos de entrada de agua con lámina conocida
  const irrByDate = await referenceExecutedIrrigationByDate(probe.lot_id);
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

  // Calibración EXPLÍCITA de un modelo de suelo (acción del usuario,
  // nunca automática al abrir una pantalla). Aprende el comportamiento
  // de la sonda de referencia (eficiencia de recarga, agotamiento) y
  // actualiza el modelo. Sin sonda o sin lecturas devuelve el estado
  // de calibración correspondiente para que la UI lo informe.
  async calibrate(modelId) {
    const models = await this.getModels();
    const model = models.find(m => m.id === modelId);
    if (!model) throw new Error('Modelo de suelo no encontrado.');
    const probes = await base44.entities.SoilProbe.list();
    const learned = await calibrateModel(model, probes);
    return base44.entities.SoilBehaviorModel.update(modelId, {
      ...learned,
      last_calibration_at: new Date().toISOString(),
    });
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