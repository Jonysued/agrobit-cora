// Coordinates follow Leaflet: [latitude, longitude]. Cardinal halves have equal
// area within the real boundary, rather than splitting its bounding rectangle.
export function cleanPolygon(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) return [];
  const ring = points.map(p => [...p]);
  if (ring.length > 3 && ring[0].every((v, i) => v === ring.at(-1)[i])) ring.pop();
  return ring;
}
export function polygonArea(points) {
  if (points.length < 3) return 0;
  const [lat, lng] = points[0];
  return Math.abs(points.reduce((a, p, i) => {
    const q = points[(i + 1) % points.length];
    return a + (p[0] - lat) * (q[1] - lng) - (q[0] - lat) * (p[1] - lng);
  }, 0)) / 2;
}
function clip(points, axis, cut, upper) {
  const result = [], inside = p => upper ? p[axis] >= cut : p[axis] <= cut;
  for (let i = 0; i < points.length; i++) {
    const p = points[i], q = points[(i + 1) % points.length];
    if (inside(p)) result.push(p);
    if (inside(p) !== inside(q)) {
      const t = (cut - p[axis]) / (q[axis] - p[axis]);
      result.push(p.map((v, j) => v + t * (q[j] - v)));
    }
  }
  return result;
}
export function sectorPolygon(points, portion = '') {
  const ring = cleanPolygon(points), area = polygonArea(ring);
  if (!area) return [];
  if (!['N', 'S', 'E', 'O'].includes(portion)) return ring;
  const axis = ['N', 'S'].includes(portion) ? 0 : 1;
  let low = Math.min(...ring.map(p => p[axis])), high = Math.max(...ring.map(p => p[axis]));
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (polygonArea(clip(ring, axis, mid, false)) < area / 2) low = mid; else high = mid;
  }
  return clip(ring, axis, (low + high) / 2, ['N', 'E'].includes(portion));
}
export function polygonCenter(points) {
  if (!polygonArea(points)) return null;
  const origin = points[0];
  let sum = 0, lat = 0, lng = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i].map((v, j) => v - origin[j]), q = points[(i + 1) % points.length].map((v, j) => v - origin[j]);
    const cross = p[0] * q[1] - q[0] * p[1];
    sum += cross; lat += (p[0] + q[0]) * cross; lng += (p[1] + q[1]) * cross;
  }
  return [origin[0] + lat / (3 * sum), origin[1] + lng / (3 * sum)];
}
export function deviceSector(device, lots) {
  if (device.kind !== 'valve' || device.lot_ids?.length !== 1) return [];
  const lot = lots.find(l => l.id === device.lot_ids[0]);
  return sectorPolygon(lot?.polygon, device.portion || '');
}
export function devicePosition(device, lots) {
  if (Number.isFinite(device.latitude) && Number.isFinite(device.longitude)) return [device.latitude, device.longitude];
  if (device.location_origin === 'sector_center') return polygonCenter(deviceSector(device, lots));
  return null;
}
