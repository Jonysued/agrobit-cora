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
    if (n === 49) mm += 80; // recarga observada, sin saber cuántos mm se aplicaron
    else mm -= n < 50 ? 1 : 2;
    days.push({ day, mm });
    weather.set(day, { rain: n === 49 ? 5 : 0, eto: 4 });
  }
  const learned = estimateProbeDynamics(days, weather);
  assert.equal(learned.profile_days, 80);
  assert.equal(learned.depletion_sample_count, 78);
  assert.equal(learned.recharge_sample_count, 1);
  assert.equal(learned.rise_with_garita_rain, 1);
  assert.equal(learned.trend_factor, 1.15);
  assert.equal(learned.post_rise_factor, 1.15);
  assert.equal(learned.depletion_rate_mm_day, 1);
  const short = estimateProbeDynamics([
    { day: '2026-09-01', mm: 100 }, { day: '2026-09-02', mm: 98 },
    { day: '2026-09-03', mm: 102 }, { day: '2026-09-04', mm: 101 },
  ]);
  assert.equal(short.depletion_sample_count, 2);
  assert.equal(short.recharge_sample_count, 1);
  assert.equal(short.rise_without_weather, 1);
  assert.equal(short.post_rise_factor, 0.89);
});

test('reconoce bajada de 24 horas oculta por recarga en el cierre diario', () => {
  const days = [
    { day: '2026-09-24', mm: 200 }, { day: '2026-09-25', mm: 197 },
    { day: '2026-09-26', mm: 194 }, { day: '2026-09-27', mm: 212 },
    { day: '2026-09-28', mm: 209 },
  ];
  const snapshots = [
    { day: '2026-09-27', time: Date.parse('2026-09-27T15:00:00Z'), mm: 218 },
    { day: '2026-09-27', time: Date.parse('2026-09-28T02:30:00Z'), mm: 212 },
    { day: '2026-09-28', time: Date.parse('2026-09-28T15:00:00Z'), mm: 209 },
  ];
  const learned = estimateProbeDynamics(days, new Map(), snapshots);
  assert.equal(learned.depletion_rate_mm_day, 3);
  assert.equal(learned.recent_24h_fall_mm, 9);
  assert.equal(learned.recent_24h_factor, 3);
  assert.equal(learned.daily_drydown_factors.at(-1).day, '2026-09-28');
});

test('aprende repetidos ciclos de recarga y extracción sin fijar el retorno en cinco días', () => {
  const falls = [-10, 8, 4, 3, 2, -9, 7, 5, 3, 2, -8, 9];
  let mm = 100;
  const firstDay = '2026-09-01';
  const snapshots = [{ day: firstDay, time: Date.parse(`${firstDay}T12:00:00Z`), mm }];
  falls.forEach((fall, index) => {
    mm -= fall;
    const day = new Date(Date.UTC(2026, 8, index + 2)).toISOString().slice(0, 10);
    snapshots.push({ day, time: Date.parse(`${day}T12:00:00Z`), mm });
  });
  const learned = estimateProbeDynamics(snapshots, new Map(), snapshots);
  assert.equal(learned.current_drydown_phase, 1);
  assert.equal(learned.drydown_cycle.find(p => p.day === 1).fall_mm, 8);
  assert.equal(learned.drydown_cycle.find(p => p.day === 1).samples, 3);
  assert.equal(learned.drydown_cycle.find(p => p.day === 2).fall_mm, 4.5);
  assert.equal(learned.drydown_cycle.find(p => p.day === 3).fall_mm, 3);
});
