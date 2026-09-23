import { backend } from '@/api/backendClient';
import { soilWaterService } from './soilWaterService';
import { kcService } from './kcService';

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
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function observedEtoByDate(lot) {
  if (!lot) return new Map();
  const farms = await backend.entities.Farm.list();
  const farm = farms.find(f => f.name === lot.farm);
  if (!farm) return new Map();
  const observations = await backend.entities.WeatherObservation.filter({ farm_id: farm.id }, '-timestamp', 2000);
  const daily = new Map();
  for (const observation of observations) {
    if (!observation.timestamp) continue;
    const date = isoDay(new Date(observation.timestamp));
    const current = daily.get(date) || { accumulated: null, increments: 0 };
    if (observation.et_day_mm != null) current.accumulated = Math.max(current.accumulated ?? 0, observation.et_day_mm);
    else if (observation.eto_mm > 0) current.increments += observation.eto_mm;
    daily.set(date, current);
  }
  return new Map([...daily].map(([date, value]) => [date, round1(value.accumulated ?? value.increments)]));
}

// Lámina de un programa que corresponde a un lote (mm × factor del lote)
function lotIrrigationMm(program, lotId, baseMm) {
  const item = (program.items || []).find(i => i.lot_id === lotId);
  return (baseMm ?? program.mm ?? 0) * (item?.factor ?? 1);
}

// Riego EJECUTADO en el sitio de referencia (lote de la sonda), por
// fecha. Solo IrrigationLog: un programa sin log no prueba que el
// riego realmente ocurrió.
async function referenceExecutedIrrigationByDate(lotId) {
  if (!lotId) return new Map();
  const [logs, programs] = await Promise.all([
    backend.entities.IrrigationLog.list(),
    backend.entities.IrrigationProgram.list(),
  ]);
  const programById = new Map(programs.map(p => [p.id, p]));
  const byDate = new Map();
  for (const log of logs) {
    const p = programById.get(log.program_id);
    if (!p || !log.date || !(p.lot_ids || []).includes(lotId)) continue;
    byDate.set(log.date, round1((byDate.get(log.date) || 0) + lotIrrigationMm(p, lotId, log.applied_mm)));
  }
  return byDate;
}

// ---- Calibración: aprender el comportamiento del suelo de referencia ----
// Cruza la serie de agua del PERFIL COMPLETO observado por la sonda
// (todas las profundidades medidas: 0 → fondo del sensor más
// profundo, SIN recorte a la zona radicular) con los eventos
// conocidos (riegos EJECUTADOS con lámina conocida + lluvia
// observada) y estima:
//  · eficiencia de recarga = subida máxima estabilizada del perfil
//    tras el evento / agua ingresada (ej. perfil +16 mm con un riego
//    de 20 mm → 16/20 = 0.80; nunca se asume que la lámina aplicada
//    se almacena completa).
//  · velocidad de bajada = variación diaria del perfil completo en
//    días sin riego ni lluvia significativa.
async function calibrateModel(model, probes) {
  const probe = probes.find(p => p.id === model.reference_probe_id);
  if (!probe) return { calibration_status: 'sin_sonda' };
  const analysis = await soilWaterService.getProbeAnalysis(probe.id).catch(e => {
    console.error('[soilBehaviorService] No se pudo analizar la sonda de referencia:', e);
    return null;
  });
  const history = analysis?.history || [];
  if (history.length < 3) return { calibration_status: 'sin_datos', sample_count: 0 };

  // Serie diaria de agua del PERFIL COMPLETO de la sonda (mm
  // almacenados), una lectura por día LOCAL (la última del día). La
  // profundidad radicular es información agronómica del perfil: NO
  // recorta esta serie — el modelo aprende de todo el perfil que la
  // sonda realmente observa.
  const byDay = new Map();
  for (const h of history) {
    const d = isoDay(new Date(h.t));
    const cur = byDay.get(d);
    if (!cur || h.t >= cur.t) byDay.set(d, { t: h.t, mm: h.profile });
  }
  const days = [...byDay.keys()].sort();
  const profileAt = d => byDay.get(d)?.mm;

  // Eventos de entrada de agua con lámina conocida: solo riegos
  // EJECUTADOS (IrrigationLog) del lote de la sonda + lluvia observada.
  const lots = await backend.entities.Lot.list();
  const referenceLot = lots.find(l => l.id === probe.lot_id) || null;
  const [irrByDate, etoByDate] = await Promise.all([
    referenceExecutedIrrigationByDate(probe.lot_id),
    observedEtoByDate(referenceLot),
  ]);
  const events = [
    ...(analysis.events?.irrigation || []).map(d => ({ date: d, mm: irrByDate.get(d) || 0 })),
    ...(analysis.events?.rain || []),
  ].filter(e => e.mm > 0);

  // Eficiencia de recarga: perfil antes del evento vs MÁXIMO
  // estabilizado de los 3 días del evento (el agua tarda en
  // distribuirse); subida observada / mm ingresados.
  const effSamples = [];
  for (const ev of events) {
    const before = [...days].reverse().find(d => d < ev.date);
    if (!before || profileAt(before) == null) continue;
    const afterWindow = days.filter(d => d >= ev.date && d <= dayAfter(ev.date, 2)).map(profileAt).filter(v => v != null);
    if (!afterWindow.length) continue;
    const rise = Math.max(...afterWindow) - profileAt(before);
    if (rise > 0) effSamples.push(Math.min(1, rise / ev.mm));
  }
  // Velocidad de bajada: variación diaria del perfil completo en días
  // sin eventos (ni el día ni el anterior con riego o lluvia). Es la
  // tasa de descenso observada del suelo — queda preparada para
  // relacionarse después con ET0, ETc, clima y época del año.
  const eventDays = new Set(events.map(e => e.date));
  const depletionSamples = [];
  const etcFactorSamples = [];
  for (let i = 1; i < days.length; i++) {
    if (eventDays.has(days[i]) || eventDays.has(days[i - 1])) continue;
    const delta = profileAt(days[i]) - profileAt(days[i - 1]);
    if (delta < 0 && delta > -10) {
      const depletion = -delta;
      depletionSamples.push(depletion);
      const eto = etoByDate.get(days[i]);
      const kc = referenceLot ? kcService.kcForCropDate(referenceLot.crop, days[i]) : null;
      const etc = eto != null && kc != null ? eto * kc : null;
      if (etc != null && etc >= 0.5) etcFactorSamples.push(depletion / etc);
    }
  }
  const recharge_efficiency = effSamples.length
    ? round2(effSamples.reduce((s, v) => s + v, 0) / effSamples.length)
    : null;
  const depletion_rate_mm_day = depletionSamples.length
    ? round1(depletionSamples.reduce((s, v) => s + v, 0) / depletionSamples.length)
    : null;
  // La bajada observada se normaliza contra ETc del mismo día. Se usa
  // la mediana y un rango conservador para impedir que un sensor o un
  // evento no registrado multiplique de forma extrema la demanda.
  const rawEtcFactor = median(etcFactorSamples);
  const etc_correction_factor = etcFactorSamples.length >= 3
    ? round2(Math.max(0.5, Math.min(1.5, rawEtcFactor)))
    : null;
  const sample_count = effSamples.length + depletionSamples.length;
  const calibration_status = effSamples.length >= 3 && etcFactorSamples.length >= 3
    ? 'calibrated'
    : (effSamples.length || etcFactorSamples.length) ? 'partial' : 'uncalibrated';
  return {
    recharge_efficiency,
    depletion_rate_mm_day,
    etc_correction_factor,
    recharge_sample_count: effSamples.length,
    depletion_sample_count: etcFactorSamples.length,
    sample_count,
    calibration_status,
  };
}

export const soilBehaviorService = {
  async getModels() { return backend.entities.SoilBehaviorModel.list(); },

  // Calibración EXPLÍCITA de un modelo de suelo (acción del usuario,
  // nunca automática al abrir una pantalla). Aprende el comportamiento
  // de la sonda de referencia (eficiencia de recarga, agotamiento) y
  // actualiza el modelo. Sin sonda o sin lecturas devuelve el estado
  // de calibración correspondiente para que la UI lo informe.
  async calibrate(modelId) {
    const models = await this.getModels();
    const model = models.find(m => m.id === modelId);
    if (!model) throw new Error('Modelo de suelo no encontrado.');
    const probes = await backend.entities.SoilProbe.list();
    const learned = await calibrateModel(model, probes);
    return backend.entities.SoilBehaviorModel.update(modelId, {
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
