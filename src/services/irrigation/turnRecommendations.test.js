import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnRecommendations } from './turnRecommendations.js';

const today = '2026-10-09';
const well = (id = 'w1', farm = 'Las 500') => ({ id, farm, kind: 'well', name: '1' });
const valve = (id, lots, extra = {}) => ({ id, kind: 'valve', parent_well_id: 'w1', turno: 'T1', lot_ids: lots, ...extra });
const row = (id, pct, extra = {}) => ({
  lot: { id, name: id }, forecast_status: 'ok', forecast_quality: { level: 'complete' },
  state: { available_water_percent: pct, total_profile_water_mm: 200, total_available_water_capacity_mm: 100 },
  application_rate_mm_h: 5, efficiency: 0.8,
  recommendation: { recommended_start_date: today, recommended_irrigation_mm: 20 },
  scenarioWithoutIrrigation: [{ date: '2026-10-10', available_water_mm: pct }], ...extra,
});

test('el porcentaje de agua útil determina el lote seco y una sola duración para todo el turno', () => {
  const dry = row('A', 20); // Perfil en mm mayor, pero porcentaje útil menor.
  const wet = row('B', 90, { application_rate_mm_h: 10, state: { available_water_percent: 90, total_profile_water_mm: 140, total_available_water_capacity_mm: 100 } });
  const [group] = buildTurnRecommendations([well(), valve('v1', ['A', 'B'])], [dry, wet], today);
  assert.equal(group.reference.lotId, 'A');
  assert.equal(group.recommendation.minutes, 240);
  assert.deepEqual(group.recommendation.impacts.map(i => i.appliedMm), [20, 40]);
  assert.ok(group.warnings.some(w => w.includes('capacidad de campo')));
  assert.equal(group.recommendation.hours, 4); // No se reduce por el lote húmedo.
});

test('los turnos se separan por pozo, aun con el mismo nombre y turno', () => {
  const groups = buildTurnRecommendations([well(), well('w2', 'Glonet'), valve('v1', ['A']), valve('v2', ['B'], { parent_well_id: 'w2' })], [row('A', 20), row('B', 30)], today);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map(g => g.members.length), [1, 1]);
});

test('dos mitades cuentan como un lote y una válvula duplicada no duplica la lámina', () => {
  const north = valve('v1', ['A'], { portion: 'N' });
  const [group] = buildTurnRecommendations([well(), north, north, valve('v2', ['A'], { portion: 'S' }), valve('v3', ['B'], { portion: 'N' })], [row('A', 20), row('B', 50)], today);
  assert.equal(group.reference.factor, 1);
  assert.equal(group.recommendation.minutes, 240);
  assert.equal(group.recommendation.impacts[1].appliedMm, 10);
  const [half] = buildTurnRecommendations([well(), north], [row('A', 20)], today);
  assert.equal(half.recommendation.minutes, 480);
});

test('sin turno, humedad o diseño no inventa una duración', () => {
  const [unassigned] = buildTurnRecommendations([well(), valve('v1', ['A'], { turno: null })], [row('A', 20)], today);
  assert.equal(unassigned.recommendation, null);
  const [blocked] = buildTurnRecommendations([well(), valve('v1', ['A'])], [row('A', 20, { forecast_quality: { level: 'blocked' } })], today);
  assert.equal(blocked.recommendation, null);
  const [noRate] = buildTurnRecommendations([well(), valve('v1', ['A', 'B'])], [row('A', 10, { application_rate_mm_h: null }), row('B', 20)], today);
  assert.equal(noRate.reference.lotId, 'A');
  assert.equal(noRate.recommendation, null);
});

test('riegos ya cubiertos por cronograma y fechas pasadas no agregan una recomendación', () => {
  const rows = [row('A', 10, { recommendation: null }), row('B', 20, { recommendation: { recommended_start_date: '2026-10-08', recommended_irrigation_mm: 30 } })];
  const [group] = buildTurnRecommendations([well(), valve('v1', ['A', 'B'])], rows, today);
  assert.equal(group.recommendation, null);
  assert.equal(group.status, 'Sin riego adicional en 15 días');
});

test('una evaluación parcial conserva todos los lotes y advierte los datos faltantes', () => {
  const [group] = buildTurnRecommendations([well(), valve('v1', ['A', 'B'])], [row('A', 20)], today);
  assert.equal(group.members.length, 2);
  assert.equal(group.recommendation.impacts[1].appliedMm, null);
  assert.ok(group.warnings.some(w => w.includes('parcial')));
});

test('redondea hacia arriba a minutos completos sin reducir el riego requerido', () => {
  const [group] = buildTurnRecommendations([well(), valve('v1', ['A'])], [row('A', 20, { application_rate_mm_h: 3, recommendation: { recommended_start_date: today, recommended_irrigation_mm: 10.01 } })], today);
  assert.equal(group.recommendation.minutes, 201);
});
