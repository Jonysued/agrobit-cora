import test from 'node:test';
import assert from 'node:assert/strict';
import { durationMinutes, programOverlaps } from './programTiming.js';
const program = { id: 'p', well: 'Pozo 1', date: '2026-10-11', start_time: '23:00', duration_min: 180, status: 'Programado' };
const draft = { well: 'Pozo 1', date: '2026-10-12', start_time: '01:00', end_time: '03:00' };
test('bloquea cruces de medianoche en ambas direcciones', () => {
  assert.equal(programOverlaps(program, draft), true);
  assert.equal(programOverlaps({ ...program, date: '2026-10-12', start_time: '01:00' }, { ...draft, date: '2026-10-11', start_time: '23:00', end_time: '02:00' }), true);
});
test('permite horarios contiguos, otros pozos y programas inactivos o el mismo editado', () => {
  assert.equal(programOverlaps(program, { ...draft, start_time: '02:00' }), false);
  assert.equal(programOverlaps(program, { ...draft, well: 'Pozo 2' }), false);
  assert.equal(programOverlaps({ ...program, status: 'Finalizado' }, draft), false);
  assert.equal(programOverlaps(program, draft, 'p'), false);
});
test('rechaza duración cero y relojes inválidos; conserva riegos nocturnos', () => {
  assert.equal(durationMinutes('06:00', '06:00'), 0);
  assert.equal(durationMinutes('24:00', '02:00'), 0);
  assert.equal(durationMinutes('06:00', ''), 0);
  assert.equal(durationMinutes('23:00', '02:00'), 180);
});

test('permite turnos de varios días y detecta conflictos intermedios', () => {
  assert.equal(durationMinutes('06:00','06:00','2026-10-11','2026-10-13'),2880);
  assert.equal(durationMinutes('06:00','06:00','2026-10-11','2026-10-10'),0);
  assert.equal(programOverlaps({...program,date:'2026-10-12',start_time:'12:00',duration_min:60},{...draft,date:'2026-10-11',start_time:'06:00',end_time:'06:00',end_date:'2026-10-13'}),true);
});
