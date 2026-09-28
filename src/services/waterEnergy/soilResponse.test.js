import test from 'node:test';
import assert from 'node:assert/strict';
import { drydownFactor, afterRiseFactor } from './soilResponse.js';

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
