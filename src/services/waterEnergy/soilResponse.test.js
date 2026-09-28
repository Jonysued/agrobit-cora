import test from 'node:test';
import assert from 'node:assert/strict';
import { drydownFactor, afterRiseFactor, forecastDrydownFactor, probeProfileLoss } from './soilResponse.js';

const model = { calibration_diagnostics: {
  method: 'probe_history_rise_and_fall', depletion_sample_count: 5,
  recharge_sample_count: 2, trend_factor: 0.8, post_rise_factor: 1.1,
} };

test('aplica tendencias y dinámica después de la recarga sin percentiles húmedo/seco', () => {
  assert.equal(drydownFactor(model), 0.8);
  assert.equal(afterRiseFactor(model), 1.1);
  assert.equal(drydownFactor(null), 1);
  assert.equal(afterRiseFactor(null), 1);
  assert.equal(drydownFactor({ calibration_diagnostics: { ...model.calibration_diagnostics, method: 'probe_history_relative_drydown' } }), 1);
});

test('la proyección sigue las fases aprendidas por la sonda y reinicia tras una recarga prevista', () => {
  const recent = { calibration_diagnostics: {
    ...model.calibration_diagnostics, trend_factor: 0.88,
    recent_24h_factor: 2.9,
    daily_drydown_factors: [{ day: '2026-09-28', factor: 2.9 }],
    last_probe_day: '2026-09-28',
    current_drydown_phase: 1,
    drydown_cycle: [
      { day: 1, factor: 2.7, samples: 4 },
      { day: 2, factor: 1.4, samples: 3 },
      { day: 3, factor: 1.1, samples: 3 },
      { day: 4, factor: 0.95, samples: 2 },
    ],
  } };
  assert.equal(drydownFactor(recent, '2026-09-28'), 2.9);
  assert.equal(drydownFactor(recent, '2026-09-27'), 0.88);
  assert.equal(forecastDrydownFactor(recent, 0), 1.4);
  assert.equal(forecastDrydownFactor(recent, 1), 1.1);
  assert.equal(forecastDrydownFactor(recent, 2, 2), 2.7);
  assert.equal(forecastDrydownFactor(recent, 3, 2), 1.4);
  assert.equal(forecastDrydownFactor(recent, 5), 0.88);
  // La intensidad reciente modifica la forma aprendida del mismo
  // episodio. Una recarga del lote la reinicia, y un dato viejo no la
  // conserva artificialmente en el pronóstico.
  assert.equal(forecastDrydownFactor(recent, 0, null, '2026-09-28'), 1.5);
  assert.equal(forecastDrydownFactor(recent, 1, null, '2026-09-28'), 1.18);
  assert.equal(forecastDrydownFactor(recent, 2, 2, '2026-09-28'), 2.7);
  assert.equal(forecastDrydownFactor(recent, 0, null, '2026-09-29'), 1.4);
  assert.equal(afterRiseFactor(recent), 1);
});

test('BARNEA mantiene la intensidad observada al continuar el ciclo actual', () => {
  const barnea = { calibration_diagnostics: {
    method: 'probe_history_rise_and_fall', depletion_sample_count: 20,
    last_probe_day: '2026-09-28', current_drydown_phase: 1,
    recent_24h_factor: 2.92,
    trend_factor: 0.88,
    drydown_cycle: [
      { day: 1, factor: 1.73, samples: 6 },
      { day: 2, factor: 1.25, samples: 3 },
      { day: 3, factor: 1.1, samples: 2 },
    ],
  } };
  assert.equal(forecastDrydownFactor(barnea, 0, null, '2026-09-28'), 2.11);
  assert.equal(forecastDrydownFactor(barnea, 1, null, '2026-09-28'), 1.86);
  assert.equal(forecastDrydownFactor(barnea, 0, 0, '2026-09-28'), 1.73);
});

test('una fase observada una sola vez también influye, sin imponerla por completo', () => {
  const glonet = { calibration_diagnostics: {
    method: 'probe_history_rise_and_fall', depletion_sample_count: 3,
    trend_factor: 1, current_drydown_phase: 0, last_probe_day: '2026-09-28',
    drydown_cycle: [
      { day: 1, factor: 0.7, samples: 1 },
      { day: 2, factor: 1.6, samples: 1 },
    ],
  } };
  assert.equal(forecastDrydownFactor(glonet, 0, null, '2026-09-28'), 0.85);
  assert.equal(forecastDrydownFactor(glonet, 1, null, '2026-09-28'), 1.3);
});

test('una fase actual sin continuación aprendida se atenúa; la recarga propia reinicia', () => {
  const probe = { calibration_diagnostics: {
    method: 'probe_history_rise_and_fall', depletion_sample_count: 4,
    trend_factor: 1, last_probe_day: '2026-09-28', current_drydown_phase: 3,
    recent_24h_factor: 1.82,
    drydown_cycle: [{ day: 1, factor: 0.7, samples: 2 }, { day: 3, factor: 1.82, samples: 1 }],
  } };
  assert.equal(forecastDrydownFactor(probe, 0, null, '2026-09-28'), 1.53);
  assert.equal(forecastDrydownFactor(probe, 1, null, '2026-09-28'), 1.35);
  assert.equal(forecastDrydownFactor(probe, 0, 0, '2026-09-28'), 0.7);
  assert.equal(forecastDrydownFactor(probe, 0, null, '2026-09-29'), 1);
});

test('la caída del perfil parte de los mm de la sonda y ajusta el cultivo de forma aditiva', () => {
  const barnea = { calibration_diagnostics: {
    method: 'probe_history_rise_and_fall', depletion_rate_mm_day: 3,
    daily_drydown_factors: [{ day: '2026-09-28', fall_mm: 8.6 }],
  } };
  const common = { date: '2026-09-28', eto: 5.2, referenceKc: 0.547, meanEto: 5 };
  assert.equal(probeProfileLoss(barnea, { ...common, kc: 0.547 }), 8.6);
  assert.equal(probeProfileLoss(barnea, { ...common, kc: 0.137 }), 6.5);
  assert.equal(probeProfileLoss(barnea, { ...common, date: '2026-09-27', kc: 0.547 }), null);
  assert.equal(probeProfileLoss(null, { ...common, kc: 0.137 }), null);
});
