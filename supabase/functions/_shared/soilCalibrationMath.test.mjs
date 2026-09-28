import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyProbeProfile, estimateProbeDynamics } from './soilCalibrationMath.js';

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

test('aprende la respuesta relativa del historial sin ubicación ni cultivo de la sonda', () => {
  const days = [];
  const weather = new Map();
  let mm = 300;
  for (let n = 0; n < 80; n++) {
    const day = new Date(Date.UTC(2026, 0, n + 1)).toISOString().slice(0, 10);
    if (n === 39) mm += 80; // recarga observada, sin saber cuántos mm se aplicaron
    else mm -= n < 40 ? 1 : 2;
    days.push({ day, mm });
    weather.set(day, { rain: 0, eto: 4 });
  }
  const learned = estimateProbeDynamics(days, weather);
  assert.equal(learned.profile_days, 80);
  assert.ok(learned.depletion_sample_count >= 70);
  assert.equal(learned.relative_drydown_factor, 0.7);
  assert.equal(learned.depletion_rate_mm_day, 2);
  assert.equal(estimateProbeDynamics(days.slice(0, 8), weather).relative_drydown_factor, null);
});
