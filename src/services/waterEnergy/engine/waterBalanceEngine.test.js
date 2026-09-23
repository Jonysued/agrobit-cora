import test from 'node:test';
import assert from 'node:assert/strict';
import { runUsefulWaterScenario, stepUsefulWaterDay } from './waterBalanceEngine.js';
import { netIrrigationNeeded } from './recommendationMath.js';

const config = {
  total_available_water_capacity_mm: 200,
  recharge_threshold_mm: 80,
  target_water_mm: 140,
};

test('incorpora lluvia efectiva y conserva la lluvia total solo como dato', () => {
  const result = stepUsefulWaterDay(100, config, {
    eto_mm: 5,
    kc: 1,
    rainfall_mm: 10,
    effective_rainfall_mm: 7,
  });
  assert.equal(result.availableMm, 102);
});

test('aplica la corrección observada sobre ETc una sola vez', () => {
  const result = stepUsefulWaterDay(100, config, {
    eto_mm: 5,
    kc: 0.8,
    etc_correction_factor: 1.25,
  });
  assert.equal(result.etcMm, 5);
  assert.equal(result.availableMm, 95);
});

test('la lluvia y el riego del día X ingresan en X+1', () => {
  const scenario = runUsefulWaterScenario(100, config, [
    { date: '2026-09-24', eto_mm: 5, kc: 1, rainfall_mm: 10, effective_rainfall_mm: 7, irrigation_mm: 8 },
    { date: '2026-09-25', eto_mm: 5, kc: 1, rainfall_mm: 0, effective_rainfall_mm: 0, irrigation_mm: 0 },
  ]);
  assert.equal(scenario[0].available_water_mm, 95);
  assert.equal(scenario[1].available_water_mm, 105);
});

test('la recomendación descuenta solo entradas que llegan a X+1', () => {
  const needed = netIrrigationNeeded(
    140,
    100,
    { irrigation_mm: 10, rainfall_mm: 20, effective_rainfall_mm: 14 },
    { etc_mm: 5, irrigation_mm: 50, effective_rainfall_mm: 30 },
  );
  // 140 - 100 - 10 - 14 + 5. No descuenta las entradas del día siguiente.
  assert.equal(needed, 21);
});
