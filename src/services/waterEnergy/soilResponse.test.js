import test from 'node:test';
import assert from 'node:assert/strict';
import { drydownFactor } from './soilResponse.js';

const model = { calibration_diagnostics: {
  method: 'probe_history_relative_drydown', depletion_sample_count: 50,
  relative_drydown_factor: 0.8,
} };

test('modula solo la demanda de lotes secos, sin imponer humedad de la sonda', () => {
  assert.equal(drydownFactor(model, 80, 100), 1);
  assert.equal(drydownFactor(model, 45, 100), 0.9);
  assert.equal(drydownFactor(model, 20, 100), 0.8);
  assert.equal(drydownFactor(null, 20, 100), 1);
  assert.equal(drydownFactor(model, 20, null), 1);
  assert.equal(drydownFactor({ calibration_diagnostics: { ...model.calibration_diagnostics, depletion_sample_count: 8 } }, 20, 100), 1);
});
