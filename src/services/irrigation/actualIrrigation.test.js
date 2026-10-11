import test from 'node:test';
import assert from 'node:assert/strict';
import { observedIrrigation, recordedPumpHours } from './actualIrrigation.js';
const at = hour => Date.parse(`2026-10-10T${String(hour).padStart(2, '0')}:00:00-03:00`);
const well = { id: 'w', kind: 'well', pump_id: 'p' };
const valve = { id: 'v', kind: 'valve', parent_well_id: 'w', lot_ids: ['a'] };
const lot = { id: 'a', row_spacing: 5, plant_spacing: 2 };
const design = { lot_id: 'a', emitter_flow_lh: 2, emitters_per_plant: 10 }; // 2 mm/h
const e = (device_id, active, hour, id = `${device_id}-${hour}`) => ({ id, device_id, active, occurred_at: new Date(at(hour)).toISOString() });
const calculate = (events, devices = [well, valve], designs = [design], now = at(12)) => observedIrrigation(devices, events, [lot], designs, now);
test('only overlapping open valve and running well irrigate linked lots', () => {
  const result = calculate([e('v', true, 6), e('w', true, 7), e('w', false, 9), e('v', false, 10)]);
  assert.equal(result.byLot.get('a').get('2026-10-10').mm, 4);
  assert.equal(result.byLot.has('unlinked'), false);
  assert.equal(calculate([e('v', true, 6)]).byLot.size, 0);
  assert.equal(calculate([e('w', true, 6)]).byLot.size, 0);
});
test('retries, repeated opening and out-of-order offline uploads do not duplicate water', () => {
  const events = [e('v', false, 10), e('w', true, 6), e('v', true, 6), e('v', true, 7), e('v', true, 6)];
  assert.equal(calculate(events).byLot.get('a').get('2026-10-10').mm, 8);
});
test('half lot, complementary halves, and duplicate same-sector valves', () => {
  const events = [e('w', true, 6), e('v', true, 6), e('v', false, 10), e('v2', true, 6), e('v2', false, 10)];
  const half = { ...valve, portion: 'N' };
  assert.equal(calculate(events, [well, half]).byLot.get('a').get('2026-10-10').mm, 4);
  assert.equal(calculate(events, [well, half]).byLot.get('a').get('2026-10-10').seconds, 4 * 3600);
  assert.equal(calculate(events, [well, half, { ...half, id: 'v2' }]).byLot.get('a').get('2026-10-10').mm, 4);
  assert.equal(calculate(events, [well, half, { ...half, id: 'v2', portion: 'S' }]).byLot.get('a').get('2026-10-10').mm, 8);
});
test('night irrigation is split at Argentina midnight, not server midnight', () => {
  const result = calculate([e('w', true, 23), e('v', true, 23)], undefined, undefined, at(23) + 3 * 3600000);
  assert.equal(result.byLot.get('a').get('2026-10-10').mm, 2);
  assert.equal(result.byLot.get('a').get('2026-10-11').mm, 4);
});
test('missing design records duration with unknown millimeters and quality warning', () => {
  const result = calculate([e('w', true, 6), e('v', true, 6)], undefined, []);
  assert.equal(result.byLot.get('a').get('2026-10-10').mm, null);
  assert.equal(result.byLot.get('a').get('2026-10-10').seconds, 21600);
  assert.ok(result.warnings.get('a').length);
});
test('corrected stop rebuilds water; a future event is never applied', () => {
  assert.equal(calculate([e('w', true, 6), e('v', true, 6), e('v', false, 8)]).byLot.get('a').get('2026-10-10').mm, 4);
  assert.equal(calculate([e('w', true, 6), e('v', true, 6), e('v', false, 15)]).byLot.get('a').get('2026-10-10').mm, 12);
});
test('well energy intervals are independent of number of valves or linked lots', () => {
  const result = calculate([e('w', true, 6), e('w', false, 10), e('v', true, 6), e('v2', true, 6)], [well, valve, { ...valve, id: 'v2', lot_ids: ['a', 'b'] }]);
  assert.deepEqual(result.pumpHours.get('p'), [[at(6), at(10)]]);
});
test('unclosed long irrigation is explicit rather than silently capped', () => {
  const result = calculate([e('w', true, 6), e('v', true, 6)], undefined, undefined, at(12) + 2 * 86400000);
  assert.ok(result.warnings.get('a').some(w => w.includes('24 h')));
});

test('an initialization within a running irrigation excludes water already in the anchor', () => {
  const result = observedIrrigation([well, valve], [e('w', true, 6), e('v', true, 6), e('v', false, 10)], [lot], [design], at(12), at(8));
  assert.equal(result.byLot.get('a').get('2026-10-10').mm, 4);
});
test('actual energy clips the window and merges overlapping pump intervals', () => {
  assert.equal(recordedPumpHours([[at(5), at(9)], [at(8), at(11)]], at(6), at(10)), 4);
  assert.equal(recordedPumpHours([], at(6), at(10)), 0);
});

test('a completed valve session does not inherit a well left running warning', () => {
  const result = calculate([e('w', true, 6), e('v', true, 6), e('v', false, 7)], undefined, undefined, at(12) + 2 * 86400000);
  assert.equal(result.warnings.has('a'), false);
  assert.equal(result.byLot.get('a').get('2026-10-10').inProgress, false);
});
