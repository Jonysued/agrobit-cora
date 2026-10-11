import { buildTurnPlan } from '../../irrigation/turnRecommendations.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// El adaptador de datos se usa únicamente en las operaciones de persistencia.
const source = (await readFile(new URL('../energyService.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '');
const { energyService: service } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const pumps = [
  { id: 'las', name: 'Pozo 1', farm: 'Las 500', power_kw: 100 },
  { id: 'glo', name: 'Pozo 1', farm: 'Glonet', power_kw: 50 },
  { id: '115', name: 'Pozo 7', farm: 'Las 115', power_kw: 90 },
];
const tariff = { price_per_kwh: 10 };
const window = service.projectionWindow(new Date('2026-10-09T09:00:00-03:00'));
const program = (overrides = {}) => ({ well: 'Pozo 1', date: '2026-10-10', start_time: '06:00', duration_min: 120, status: 'Programado', lot_ids: ['a', 'b'], ...overrides });
const scheduled = programs => service.getScheduledOverview(programs, pumps, [], tariff, window);

test('sin programas, energía programada es cero aunque exista recomendación', () => {
  assert.equal(scheduled([]).totalHours, 0);
  assert.equal(scheduled([]).totalKwh, 0);
  assert.equal(scheduled([]).totalCost, 0);
});
test('cuenta una vez el turno y une solapamientos sin mezclar fincas', () => {
  const result = scheduled([program(), program({ start_time: '07:00' }), program({ well: 'Glonet 1' }), program({ well: 'Pozo 7' })]);
  assert.deepEqual(result.pumpStats.map(p => p.hours), [3, 2, 2]);
  assert.equal(result.totalKwh, 580);
  assert.equal(result.totalCost, 5800);
});
test('recorta hoy y el límite de siete días; excluye pausados y finalizados', () => {
  const result = scheduled([
    program({ date: '2026-10-09', start_time: '08:00' }),
    program({ date: '2026-10-15', start_time: '23:00' }),
    program({ date: '2026-10-16' }),
    program({ status: 'Pausado' }), program({ status: 'Finalizado' }),
    program({ date: '2026-10-08', start_time: '23:00', duration_min: 120 }),
  ]);
  assert.equal(result.totalHours, 2);
});
test('un programa incompleto y potencia faltante no se presentan como consumo cero', () => {
  assert.equal(scheduled([program({ duration_min: null })]).incompletePrograms, 1);
  const result = service.getScheduledOverview([program()], [{ ...pumps[0], power_kw: null }], [], tariff, window);
  assert.equal(result.totalHours, 2);
  assert.equal(result.totalKwh, null);
  assert.equal(result.totalCost, null);
});
const turn = (start, hours=3, extra={}) => ({ well: { pump_id:'las' }, members: [{lotId:'a'}, {lotId:'b'}], recommendation: { feasible:true, start:Date.parse(start), end:Date.parse(start)+hours*3600000, ...extra } });
test('energía recomendada cuenta una vez el turno, recorta multiday y usa la misma ventana', () => {
  const result = service.getRecommendedOverview([turn('2026-10-09T08:00:00-03:00'), turn('2026-10-15T23:00:00-03:00',48), turn('2026-10-16T06:00:00-03:00')], window, tariff, pumps);
  assert.equal(result.totalHours, 3); // 2 h restantes hoy + 1 h al final de la ventana.
  assert.equal(result.totalKwh, 300);
});
test('no muestra cero ni total completo si falta disponibilidad o bomba', () => {
  const blocked = service.getRecommendedOverview([turn('2026-10-10T06:00:00-03:00',3,{feasible:false,start:null,end:null})], window, tariff, pumps);
  assert.equal(blocked.totalKwh,null); assert.equal(blocked.totalHours,null); assert.equal(blocked.unavailableTurns,1);
  const missing = service.getRecommendedOverview([{...turn('2026-10-10T06:00:00-03:00'),well:{}}],window,tariff,pumps);
  assert.equal(missing.totalHours,null); assert.equal(missing.incompletePrograms,1);
});

test('plan y energía comparten turnos simultáneos y nunca exceden las horas disponibles por bomba', () => {
  const devices=[{id:'w',kind:'well',name:'1',farm:'Las 500',pump_id:'las'},
    ...['a','b','c'].map((id,i)=>({id:'v'+id,kind:'valve',parent_well_id:'w',turno:i===2?'T2':'T1',lot_ids:[id],portion:''}))];
  const rows=['a','b','c'].map(id=>({lot:{id,name:id},forecast_status:'ok',forecast_quality:{level:'complete'},state:{available_water_percent:10,total_available_water_capacity_mm:100},application_rate_mm_h:1,efficiency:1,recommendation:{recommended_start_date:'2026-10-10',recommended_irrigation_mm:100}}));
  const groups=buildTurnPlan(devices,rows,[program({date:'2026-10-10',start_time:'00:00',duration_min:120})],window.now);
  assert.equal(groups.length,2);
  assert.equal(groups[0].recommendation.start,Date.parse('2026-10-10T02:00:00-03:00'));
  assert.equal(groups[1].recommendation.start,groups[0].recommendation.end);
  const result=service.getRecommendedOverview(groups,window,tariff,pumps);
  assert.equal(result.pumpStats[0].hours,142); // Available from Oct 10 02:00 to Oct 16 00:00, no duplicate lots.
  assert.ok(result.pumpStats[0].hours<=168);
});
