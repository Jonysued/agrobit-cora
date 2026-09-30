import { deviceStatus } from './monitoringUtils.js';
import { sectorPolygon } from './sectorGeometry.js';

// Normal view shows each valve's sector. A well-only view shows all sectors
// supplied by that well, without drawing competing outlines on the same area.
export function perimeterAreas(devices, allDevices, lots) {
  const visibleValves = new Set(devices.filter(d => d.kind === 'valve').map(d => d.id));
  const areas = [];
  const add = (device, valve) => {
    for (const lotId of valve.lot_ids || []) {
      const lot = lots.find(l => l.id === lotId);
      const positions = sectorPolygon(lot?.polygon, valve.portion || '');
      if (positions.length < 3) continue;
      areas.push({ key: `${device.id}:${valve.id}:${lotId}`, device, valve, lot, positions, status: deviceStatus(device, allDevices) });
    }
  };
  for (const device of devices) {
    if (device.kind === 'valve') add(device, device);
    else if (device.kind === 'well') {
      for (const valve of allDevices.filter(d => d.kind === 'valve' && d.parent_well_id === device.id && !visibleValves.has(d.id))) add(device, valve);
    }
  }
  return areas;
}
