import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyProbeProfile, estimateCalibration } from './soilCalibrationMath.js';

test('suma el perfil medido completo y descarta una lectura incompleta', () => {
  const channels = [
    { id: 'a', depth_cm: 5, sensor_type: 'soil_moisture' },
    { id: 'b', depth_cm: 15, sensor_type: 'soil_moisture' },
    { id: 't', depth_cm: 5, sensor_type: 'soil_temperature' },
  ];
  const readings = [
    { probe_channel_id: 'a', timestamp: '2026-09-01T18:00:00Z', value: 20 },
    { probe_channel_id: 'b', timestamp: '2026-09-01T18:00:00Z', value: 30 },
    { probe_channel_id: 'a', timestamp: '2026-09-01T21:00:00Z', value: 99 },
    { probe_channel_id: 'a', timestamp: '2026-09-02T18:00:00Z', value: 21 },
    { probe_channel_id: 'b', timestamp: '2026-09-02T18:00:00Z', value: 31 },
  ];
  assert.deepEqual(dailyProbeProfile(channels, readings).map(({ day, mm }) => [day, mm]), [
    ['2026-09-01', 50], ['2026-09-02', 52],
  ]);
});

test('aprende recarga y demanda solo con suficientes eventos limpios', () => {
  const days = [];
  const weather = new Map();
  const irrigation = new Map();
  let mm = 300;
  for (let d = 1; d <= 30; d++) {
    const day = `2026-09-${String(d).padStart(2, '0')}`;
    if ([5, 15, 25].includes(d)) {
      irrigation.set(day, 20);
      mm += 16;
    } else mm -= 2;
    days.push({ day, mm });
    weather.set(day, { rain: 0, eto: 5 });
  }
  const result = estimateCalibration(days, weather, irrigation, () => 0.5);
  assert.equal(result.recharge_sample_count, 3);
  assert.equal(result.recharge_efficiency, 0.8);
  assert.equal(result.etc_correction_factor, 0.8);
  assert.equal(result.depletion_rate_mm_day, 2);
  weather.set('2026-09-16', { rain: 5, eto: 5 });
  const contaminated = estimateCalibration(days, weather, irrigation, () => 0.5);
  assert.equal(contaminated.recharge_efficiency, null);
  assert.equal(estimateCalibration(days, weather, new Map(), null).etc_correction_factor, null);
});
