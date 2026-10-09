import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateTransferDynamics } from './probeTransfer.js';
const series = values => values.map((mm, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, mm }));
test('excluye recarga y drenaje rápido, conserva secado previo sin aprender del futuro', () => {
  const d = estimateTransferDynamics(series([200,198,196,220,210,204,202,200,198]));
  assert.deepEqual(d.daily.map(x => x.loss_mm), [2,2,2,2,2,2,2,2]);
  assert.equal(d.daily[2].excluded_reason, 'probe_recharge');
  assert.equal(d.daily[3].excluded_reason, 'post_recharge_drainage');
  assert.equal(d.daily[4].excluded_reason, 'post_recharge_drainage');
  assert.equal(d.daily[6].source, 'observed');
  assert.equal(d.recent_loss_mm_day, 2);
  assert.deepEqual(estimateTransferDynamics(series([200,198,196,220])).daily, d.daily.slice(0,3));
});
test('detecta subida intradiaria aunque el día termina más seco', () => {
  const days = series([200,198,196,194,192]);
  const snapshots = [
    {day:days[3].day,time:Date.parse('2026-10-04T10:00Z'),mm:195},
    {day:days[3].day,time:Date.parse('2026-10-04T11:00Z'),mm:210},
    {day:days[3].day,time:Date.parse('2026-10-04T12:00Z'),mm:194},
  ];
  assert.equal(estimateTransferDynamics(days,snapshots).daily[2].excluded_reason,'probe_recharge');
});
test('cero secado es válido; un hueco no se trata como pérdida diaria', () => {
  assert.equal(estimateTransferDynamics(series([200,200,200])).recent_loss_mm_day,0);
  const d=estimateTransferDynamics([{day:'2026-10-01',mm:200},{day:'2026-10-03',mm:180}]);
  assert.equal(d.daily[0].loss_mm,null);
  assert.equal(d.daily[0].excluded_reason,'missing_readings');
});
