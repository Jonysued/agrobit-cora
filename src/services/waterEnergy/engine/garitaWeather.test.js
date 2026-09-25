import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGaritaStation, aggregateGaritaObservations } from '../garitaWeather.js';

test('elige únicamente la estación Garita activa, no otra estación de la finca', () => {
  assert.equal(selectGaritaStation([
    { id: 'retamito', name: 'Estación Retamito', active: true },
    { id: 'garita', name: ' Garita ', active: true },
  ])?.id, 'garita');
  assert.equal(selectGaritaStation([{ id: 'retamito', name: 'Estación Retamito' }]), null);
});

test('Garita suma la lluvia, toma el acumulado diario de ET0 y no duplica lecturas', () => {
  const observed = aggregateGaritaObservations([
    { timestamp: '2026-09-25T02:30:00Z', rainfall_mm: 2, et_day_mm: 3, eto_mm: 1 },
    { timestamp: '2026-09-25T02:30:00Z', rainfall_mm: 2, et_day_mm: 3, eto_mm: 1 },
    { timestamp: '2026-09-25T03:30:00Z', rainfall_mm: 1, et_day_mm: 1, eto_mm: 1 },
  ]);
  assert.deepEqual(observed.byDay.get('2026-09-24'), { rain: 2, eto: 3 });
  assert.deepEqual(observed.byDay.get('2026-09-25'), { rain: 1, eto: 1 });
  assert.equal(observed.meanEto, 2);
  assert.equal(observed.lastObservationAt, '2026-09-25T03:30:00Z');
});

test('sin lecturas de Garita no fabrica ET0 observada', () => {
  const observed = aggregateGaritaObservations([]);
  assert.equal(observed.meanEto, null);
  assert.equal(observed.lastObservationAt, null);
});
