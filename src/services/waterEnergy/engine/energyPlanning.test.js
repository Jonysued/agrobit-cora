import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El adaptador de datos se usa únicamente en las operaciones de persistencia.
const source = (await readFile(new URL('../energyService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const { energyService: service } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const pumps = [
  { id: 'las', name: 'Pozo 1', farm: 'Las 500', power_kw: 100 },
  { id: 'glo', name: 'Pozo 1', farm: 'Glonet', power_kw: 50 },
  { id: '115', name: 'Pozo 7', farm: 'Las 115', power_kw: 90 },
];
const tariff = { price_per_kwh: 10 };
const window = service.projectionWindow(new Date('2026-10-09T09:00:00-03:00'));
const program = (overrides = {}) => ({ well: 'Pozo 1', date: '2026-10-10', start_time: '06:00', duration_min: 120, status: 'Programado', lot_ids: ['a', 'b'], ...overrides });
const scheduled = programs => service.getScheduledOverview(programs, pumps, [], tariff, window);

test('sin programas, energía programada es cero aunque exista recomendación', () => {
  assert.equal(scheduled([]).totalHours, 0);
  assert.equal(scheduled([]).totalKwh, 0);
  assert.equal(scheduled([]).totalCost, 0);
});
test('cuenta una vez el turno y une solapamientos sin mezclar fincas', () => {
  const result = scheduled([program(), program({ start_time: '07:00' }), program({ well: 'Glonet 1' }), program({ well: 'Pozo 7' })]);
  assert.deepEqual(result.pumpStats.map(p => p.hours), [3, 2, 2]);
  assert.equal(result.totalKwh, 580);
  assert.equal(result.totalCost, 5800);
});
test('recorta hoy y el límite de siete días; excluye pausados y finalizados', () => {
  const result = scheduled([
    program({ date: '2026-10-09', start_time: '08:00' }),
    program({ date: '2026-10-15', start_time: '23:00' }),
    program({ date: '2026-10-16' }),
    program({ status: 'Pausado' }), program({ status: 'Finalizado' }),
    program({ date: '2026-10-08', start_time: '23:00', duration_min: 120 }),
  ]);
  assert.equal(result.totalHours, 2);
});
test('un programa incompleto y potencia faltante no se presentan como consumo cero', () => {
  assert.equal(scheduled([program({ duration_min: null })]).incompletePrograms, 1);
  const result = service.getScheduledOverview([program()], [{ ...pumps[0], power_kw: null }], [], tariff, window);
  assert.equal(result.totalHours, 2);
  assert.equal(result.totalKwh, null);
  assert.equal(result.totalCost, null);
});
test('recomendaciones usan la misma ventana de siete días', () => {
  const row = date => ({ lot: { area_ha: 6 }, profile: {}, pump: pumps[0], recommendation: { recommended_start_date: date }, energy: { hours: 3, kwh: 300, cost: 3000 } });
  const result = service.getRecommendedOverview([row('2026-10-09'), row('2026-10-15'), row('2026-10-16')], window);
  assert.equal(result.totalHours, 6);
  assert.equal(result.totalKwh, 600);
});
