import test from 'node:test';
import assert from 'node:assert/strict';
import { perimeterAreas } from './perimeterAreas.js';
import { polygonArea } from './sectorGeometry.js';
const lots = [{ id: 'lot', name: 'Lote 1', polygon: [[-32,-68],[-32,-67],[-31,-67],[-31,-68]] }, { id: 'other', polygon: [[-33,-68],[-33,-67],[-32,-67],[-32,-68]] }];
const well = { id: 'well', kind: 'well', current_active: true };
const east = { id: 'east', kind: 'valve', parent_well_id: well.id, lot_ids: ['lot'], portion: 'E', current_active: true };
const west = { ...east, id: 'west', portion: 'O', current_active: false };

test('perimeters respect opposite sectors and update when the supplying well changes state', () => {
  const devices = [well, east, west];
  let areas = perimeterAreas(devices, devices, lots);
  assert.equal(areas.length, 2, 'combined view must not overlay a duplicate well boundary');
  assert.deepEqual(areas.map(a => a.status.color), ['#16a34a','#dc2626']);
  for (const a of areas) assert.ok(Math.abs(polygonArea(a.positions) - polygonArea(lots[0].polygon)/2) < 1e-8);
  const off = [{ ...well, current_active: false }, east, west];
  areas = perimeterAreas(off, off, lots);
  assert.equal(areas.find(a => a.device.id === east.id).status.color, '#f97316');
  assert.equal(areas.find(a => a.device.id === west.id).status.color, '#dc2626');
});

test('well filter colors and selects all linked sectors, including multi-lot valves', () => {
  const multi = { ...east, id: 'multi', portion: '', lot_ids: ['other', 'missing'] };
  for (const active of [true, false]) {
    const source = { ...well, current_active: active }, all = [source, east, west, multi];
    const areas = perimeterAreas([source], all, lots);
    assert.equal(areas.length, 3);
    assert.ok(areas.every(a => a.device.id === well.id && a.status.color === (active ? '#16a34a' : '#dc2626')));
    assert.equal(areas.find(a => a.valve.id === multi.id).positions.length, 4);
  }
  assert.deepEqual(perimeterAreas([well], [well], lots), [], 'unlinked wells must not invent a service area');
});
