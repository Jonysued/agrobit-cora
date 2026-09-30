import test from 'node:test';
import assert from 'node:assert/strict';
import { polygonArea, polygonCenter, sectorPolygon, devicePosition } from './sectorGeometry.js';
const rectangle = [[-32.20, -68.64], [-32.20, -68.62], [-32.22, -68.62], [-32.22, -68.64]];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test('cardinal halves preserve real area and orientation in southern/western coordinates', () => {
  for (const [a, b, axis] of [['N', 'S', 0], ['E', 'O', 1]]) {
    const first = sectorPolygon(rectangle, a), second = sectorPolygon(rectangle, b);
    close(polygonArea(first), polygonArea(rectangle) / 2);
    close(polygonArea(first) + polygonArea(second), polygonArea(rectangle));
    assert.ok(polygonCenter(first)[axis] > polygonCenter(second)[axis]);
  }
});
test('uneven rotated boundary is divided by area, not bounding box', () => {
  const polygon = [[-32, -68], [-32.001, -67.99], [-32.014, -67.994], [-32.013, -68.002]];
  for (const portion of ['N', 'S', 'E', 'O']) close(polygonArea(sectorPolygon(polygon, portion)), polygonArea(polygon) / 2);
  close(polygonArea(sectorPolygon([...polygon].reverse(), 'E')), polygonArea(polygon) / 2);
});
test('complete lots stay intact and their center is independent of vertex order', () => {
  assert.deepEqual(sectorPolygon(rectangle), rectangle);
  const center = polygonCenter(rectangle);
  close(center[0], -32.21); close(center[1], -68.63);
  polygonCenter([...rectangle].reverse()).forEach((n, i) => close(n, center[i]));
});
test('manual location overrides computed center and missing boundaries never invent coordinates', () => {
  const device = {kind:'valve',lot_ids:['lot'],portion:'E',location_origin:'sector_center',latitude:null,longitude:null};
  assert.deepEqual(devicePosition(device, [{id:'lot',polygon:rectangle}]), polygonCenter(sectorPolygon(rectangle, 'E')));
  assert.deepEqual(devicePosition({...device,latitude:-32.209,longitude:-68.622}, []), [-32.209,-68.622]);
  assert.equal(devicePosition(device, []), null);
  assert.equal(devicePosition({...device,kind:'well'}, [{id:'lot',polygon:rectangle}]), null);
  assert.deepEqual(sectorPolygon([[null, 0],[1,1],[2,2]]), []);
});
