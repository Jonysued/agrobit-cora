import test from 'node:test';
import assert from 'node:assert/strict';
import { assignedPrograms, pendingLotSchedule, allocateTurns, dayStart } from './planning.js';
const devices = [{id:'w',kind:'well',name:'6',farm:'Las 500'}, ...['a','b'].map(id=>({id,kind:'valve',parent_well_id:'w',turno:'T1',lot_ids:[id],portion:''}))];
const p = {id:'p',well:'Pozo 6',turno:'T1',lot_ids:['wrong'],date:'2026-10-11',start_time:'23:00',duration_min:180,status:'Programado'};
test('Monitoreo reemplaza asignaciones antiguas por todos los lotes del turno',()=>{
 assert.deepEqual(assignedPrograms([p],devices)[0].lot_ids,['a','b']);
 assert.equal(assignedPrograms([{...p,turno:'T9'}],devices)[0]._assignment_missing,true);
});
test('incluye solo lo pendiente de hoy y reparte el riego nocturno sin duplicar programas',()=>{
 const programs=assignedPrograms([p,{...p,id:'p2'}],devices);
 const result=pendingLotSchedule(programs,{id:'a'},4,dayStart('2026-10-11')+23.5*3600000);
 assert.deepEqual(result.map(d=>[d.date,d.gross_mm]),[['2026-10-11',2],['2026-10-12',8]]);
 assert.deepEqual(pendingLotSchedule(programs,{id:'a'},4,dayStart('2026-10-12')+3*3600000),[]);
});
const group=(id,minutes=180)=>({id,well:devices[0],warnings:[],reference:{row:{state:{available_water_percent:10}}},recommendation:{date:'2026-10-11',minutes}});
test('ordena turnos sin superponer el mismo pozo y respeta programas existentes',()=>{
 const now=dayStart('2026-10-11');
 const groups=allocateTurns([group('a'),group('b')],[{...p,start_time:'00:00'}],now);
 assert.equal(groups[0].recommendation.start,now+3*3600000);
 assert.equal(groups[1].recommendation.start,now+6*3600000);
});
test('no inventa disponibilidad de un pozo en curso ni turnos fuera de capacidad',()=>{
 const now=dayStart('2026-10-11');
 assert.equal(allocateTurns([{...group('a'),well:{...devices[0],current_active:true}}],[],now)[0].recommendation.feasible,false);
 assert.equal(allocateTurns([group('a',16*24*60)],[],now)[0].recommendation.feasible,false);
});
