import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceStatus, duration, liveSessionSeconds, parseQr, qrUrl } from './monitoringUtils.js';
import QRCode from 'qrcode';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const { QRCodeReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } = require('@zxing/library');
const well = { id: 'w', kind: 'well', current_active: true };
const valve = { id: 'v', kind: 'valve', current_active: true, parent_well_id: 'w' };
test('open valve requires a recorded powered well; off and closed use red', () => {
  assert.equal(deviceStatus(valve, [well]).effective, true);
  assert.equal(deviceStatus(valve, [{ ...well, current_active: false }]).color, '#f97316');
  assert.equal(deviceStatus({ ...valve, current_active: false }, [well]).color, '#dc2626');
  assert.equal(deviceStatus({ ...well, current_active: false }, []).color, '#dc2626');
  assert.equal(deviceStatus(valve, []).effective, false);
  assert.equal(deviceStatus({ ...well, current_active: null }, []).label, 'Sin registro');
});
test('live effective time pauses with well off and completed sessions stay fixed', () => {
  const session = { duration_seconds: 600, effective_seconds: 300, ended_at: null, calculated_at: '2026-10-01T02:59:50Z' };
  const now = Date.parse('2026-10-01T03:00:10Z');
  assert.deepEqual(liveSessionSeconds(session, valve, [well], now), { duration: 620, effective: 320 });
  assert.deepEqual(liveSessionSeconds(session, valve, [{ ...well, current_active: false }], now), { duration: 620, effective: 300 });
  assert.deepEqual(liveSessionSeconds({ ...session, ended_at: '2026-10-01T03:00:00Z' }, valve, [well], now), { duration: 600, effective: 300 });
});
test('QR token round trips without interpreting arbitrary URLs as equipment', () => {
  const token = '7e0c42c7-11b5-481c-83a7-b370865ba8a3';
  assert.equal(parseQr(qrUrl(token)), token);
  assert.equal(parseQr('https://example.com/not-a-device'), null);
  assert.equal(parseQr('javascript:alert(1)'), null);
  assert.equal(duration(90061), '25 h 01 min 01 s');
});
test('printed QR image decodes to the equipment deep link', async () => {
  const token = '7e0c42c7-11b5-481c-83a7-b370865ba8a3';
  const buffer = await QRCode.toBuffer(qrUrl(token), { width: 600, margin: 4, errorCorrectionLevel: 'M' });
  const png = PNG.sync.read(buffer);
  const pixels = new Uint8ClampedArray(png.width * png.height);
  for (let i = 0; i < pixels.length; i++) pixels[i] = png.data[i * 4];
  const image = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, png.width, png.height)));
  assert.equal(new QRCodeReader().decode(image).getText(), qrUrl(token));
});
