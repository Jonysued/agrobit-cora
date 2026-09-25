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

test('descarta la ET0 de ayer repetida a medianoche antes y después del reinicio', () => {
  const observed = aggregateGaritaObservations([
    // El backend devuelve las lecturas en orden descendente.
    { timestamp: '2026-09-25T03:30:03Z', et_day_mm: 0, eto_mm: 0 },
    { timestamp: '2026-09-25T03:00:03Z', et_day_mm: 5.2, eto_mm: 5.2 },
    { timestamp: '2026-09-25T02:30:03Z', et_day_mm: 5.2, eto_mm: 0 },
    { timestamp: '2026-09-24T03:30:03Z', et_day_mm: 0, eto_mm: 0 },
    { timestamp: '2026-09-24T03:00:03Z', et_day_mm: 4.5, eto_mm: 4.5 },
    { timestamp: '2026-09-24T02:30:03Z', et_day_mm: 4.5, eto_mm: 0 },
  ]);
  assert.equal(observed.byDay.get('2026-09-24').eto, 5.2);
  assert.equal(observed.byDay.get('2026-09-25').eto, 0);
  const beforeReset = aggregateGaritaObservations([
    { timestamp: '2026-09-24T22:00:00Z', et_day_mm: 5.2, eto_mm: 0.1 },
    { timestamp: '2026-09-25T03:00:03Z', et_day_mm: 5.2, eto_mm: 5.2 },
  ]);
  assert.equal(beforeReset.byDay.get('2026-09-25').eto, null);
});

test('tras el reinicio usa sólo la ET0 nueva y agrupa lluvia en fecha argentina', () => {
  const observed = aggregateGaritaObservations([
    { timestamp: '2026-09-25T02:30:00Z', et_day_mm: 5.2, rainfall_mm: 2 },
    { timestamp: '2026-09-25T03:00:00Z', et_day_mm: 5.2, rainfall_mm: 1 },
    { timestamp: '2026-09-25T03:30:00Z', et_day_mm: 0, rainfall_mm: 0 },
    { timestamp: '2026-09-25T13:00:00Z', et_day_mm: 1.3, rainfall_mm: 3 },
  ]);
  assert.deepEqual(observed.byDay.get('2026-09-24'), { rain: 2, eto: 5.2 });
  assert.deepEqual(observed.byDay.get('2026-09-25'), { rain: 4, eto: 1.3 });
});
