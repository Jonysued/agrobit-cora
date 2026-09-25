import test from 'node:test';
import assert from 'node:assert/strict';
import { measuredProbeProfile } from './measuredProbeProfile.js';

test('una sonda sin lote suma solo mediciones completas, sin inventar zona radicular', () => {
  const channels = [
    { id: 'top', depth_cm: 5, sensor_type: 'soil_moisture' },
    { id: 'deep', depth_cm: 15, sensor_type: 'soil_moisture' },
    { id: 'temp', depth_cm: 5, sensor_type: 'soil_temperature' },
  ];
  const readings = [
    { probe_channel_id: 'top', timestamp: '2026-09-24T10:00:00Z', value: 10 },
    { probe_channel_id: 'deep', timestamp: '2026-09-24T10:00:00Z', value: 20 },
    { probe_channel_id: 'top', timestamp: '2026-09-24T11:00:00Z', value: 15 },
    { probe_channel_id: 'temp', timestamp: '2026-09-24T11:00:00Z', value: 25 },
  ];
  const result = measuredProbeProfile(channels, readings);
  assert.equal(result.measuredDepth, 20);
  assert.deepEqual(result.history, [{ t: Date.parse('2026-09-24T10:00:00Z'), profile: 30, mm: null }]);
});
