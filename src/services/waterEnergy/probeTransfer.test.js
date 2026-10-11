import test from 'node:test';
import assert from 'node:assert/strict';
import { closedProbeDays, estimateTransferDynamics as estimate } from './probeTransfer.js';
const estimateTransferDynamics = (days, snapshots, weather, options = {}) => estimate(days, snapshots, weather,
  { asOf: '2026-11-01T12:00:00Z', ...options });
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

test('aprende después de estabilizarse aunque el historial comience con una recarga', () => {
  const d = estimateTransferDynamics(series([180,220,208,201,196,194,192,190]));
  assert.equal(d.daily[0].loss_mm,null);
  assert.equal(d.daily.at(-1).source,'observed');
  assert.equal(d.recent_loss_mm_day,2);
});

test('OPERACION1: acepta secado estabilizado sin copiar recarga ni caída rápida', () => {
  const days = series([135,136.7,130.6,128.1,127,125.3]);
  const d = estimateTransferDynamics(days);
  assert.equal(d.daily[0].excluded_reason, 'probe_recharge');
  assert.equal(d.daily[1].loss_mm, null);
  assert.equal(d.daily[2].loss_mm, null);
  assert.equal(d.daily.at(-1).source, 'observed');
  assert.equal(d.daily.at(-1).loss_mm, 1.7);
  assert.deepEqual(estimateTransferDynamics(days.slice(0, -1)).daily, d.daily.slice(0, -1));
});

test('la estabilización contempla demanda climática y sigue excluyendo drenaje acelerado', () => {
  const days = series([100,130,118,111,109,105]);
  const weather = new Map(days.map((d, i) => [d.day, { eto: i === 5 ? 4 : 2 }]));
  const result = estimateTransferDynamics(days, [], weather);
  assert.equal(result.daily.at(-1).loss_mm, 4);
  const draining = estimateTransferDynamics(series([100,150,130,118,112,110]));
  assert.equal(draining.clean_sample_count, 0);
});

test('hoy se muestra pero no se aprende, y un cierre temprano no cuenta como jornada completa', () => {
  const days = series([200,198,197.9]).map(d => ({ ...d, time: Date.parse(`${d.day}T23:30:00-03:00`) }));
  const asOf = '2026-10-03T03:45:00Z'; // 00:45 en Argentina
  days[2].time = Date.parse('2026-10-03T03:00:00Z');
  const closed = closedProbeDays(days, asOf);
  assert.deepEqual(closed.map(d => d.day), ['2026-10-01','2026-10-02']);
  const d = estimateTransferDynamics(days, [], new Map(), { asOf });
  assert.equal(d.clean_sample_count, 1);
  assert.equal(d.recent_loss_mm_day, 2);
  assert.equal(d.last_clean_day, '2026-10-02');
  assert.equal(d.daily_profile.at(-1).mm, 197.9);
  assert.equal(d.incomplete_days, 1);
  days[1].time = Date.parse('2026-10-02T15:00:00-03:00');
  assert.equal(estimateTransferDynamics(days, [], new Map(), { asOf }).clean_sample_count, 0);
});

test('un cierre interrumpido no convierte una pérdida parcial en secado diario', () => {
  const days = series([200,180]).map((d,i) => ({ ...d, time: Date.parse(`${d.day}T${i ? '20:55' : '23:55'}:00-03:00`) }));
  const d = estimateTransferDynamics(days);
  assert.equal(d.incomplete_days, 1);
  assert.equal(d.clean_sample_count, 0);
});

test('una referencia antigua de secado cero no bloquea un nuevo ciclo', () => {
  const days = [{ day:'2026-09-01', mm:100 },{ day:'2026-09-02', mm:100 },
    ...series([100,130,118,111,108.5,107])];
  const d = estimateTransferDynamics(days);
  assert.equal(d.daily.at(-1).source, 'observed');
  assert.equal(d.daily.at(-1).loss_mm, 1.5);
  assert.equal(d.recent_loss_mm_day, 1.5);
  assert.equal(d.recent_clean_sample_count, 1);
});
