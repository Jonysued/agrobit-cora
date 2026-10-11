import { clockMinutes } from './programTiming.js';
export const DAY = 86400000;
export const businessDay = (time = Date.now()) => new Date(time - 3 * 3600000).toISOString().slice(0, 10);
export const dayStart = date => Date.parse(`${date}T00:00:00-03:00`);
export const wellProgramName = well => well.farm === 'Glonet' ? `Glonet ${String(well.name).replace(/^(?:Pozo|Glonet)\s*/i, '')}` : /^\d+$/.test(well.name) ? `Pozo ${well.name}` : well.name;
const normalize = value => String(value || '').toLowerCase().replace(/\s+/g, '');
export function findProgramWell(program, devices) {
  return devices.find(w => w.kind === 'well' && normalize(wellProgramName(w)) === normalize(program.well));
}
export function turnMembers(devices, wellId, turno) {
  const members = new Map();
  for (const valve of devices.filter(v => v.kind === 'valve' && v.parent_well_id === wellId && normalize(v.turno) === normalize(turno) && turno)) {
    for (const id of valve.lot_ids || []) {
      const m = members.get(id) || { lotId: id, portions: new Set() };
      m.portions.add(valve.portion || ''); members.set(id, m);
    }
  }
  return [...members.values()].map(m => ({ ...m, factor: m.portions.has('') ? 1 : Math.min(1, m.portions.size * 0.5) }));
}
export function assignedPrograms(programs, devices) {
  return programs.map(p => {
    const well = findProgramWell(p, devices);
    const members = well ? turnMembers(devices, well.id, p.turno) : [];
    return { ...p, lot_ids: members.map(m => m.lotId), items: members.map(m => ({ lot_id: m.lotId, factor: m.factor })),
      _assignment_missing: !members.length, _well_id: well?.id };
  });
}
export function programInterval(program) {
  const minutes = clockMinutes(program.start_time), duration = Number(program.duration_min);
  const day = dayStart(program.date);
  if (!['Programado', 'Activo'].includes(program.status) || minutes == null || !Number.isFinite(day) || !Number.isFinite(duration) || duration <= 0) return null;
  const start = day + minutes * 60000;
  return [start, start + duration * 60000];
}
// Only the future part is predicted: Monitoring has already accounted for elapsed water.
// Sweep overlapping programs once, and split continuous irrigation at Argentina midnight.
export function pendingLotSchedule(programs, lot, rate, now = Date.now()) {
  const intervals = [];
  for (const p of programs) {
    if (!(p.lot_ids || []).includes(lot.id) || p._assignment_missing) continue;
    const span = programInterval(p); if (!span || span[1] <= now) continue;
    const items = (p.items || []).filter(i => i.lot_id === lot.id);
    const factor = items.length ? Math.max(0, Math.min(1, items.reduce((s, i) => s + (i.factor ?? 1), 0))) : 1;
    const mmh = p.mm != null ? Number(p.mm) / (p.duration_min / 60) : rate;
    if (!(mmh > 0) || !Number.isFinite(mmh) || !Number.isFinite(factor)) continue;
    intervals.push({ start: Math.max(span[0], now), end: span[1], rate: mmh * factor, id: p.id, status: p.status });
  }
  const points = [...new Set(intervals.flatMap(i => [i.start, i.end]))].sort((a, b) => a - b), days = new Map();
  for (let i = 1; i < points.length; i++) {
    const active = intervals.filter(p => p.start < points[i] && p.end > points[i - 1]);
    if (!active.length) continue;
    let cursor = points[i - 1];
    while (cursor < points[i]) {
      const date = businessDay(cursor), end = Math.min(points[i], dayStart(date) + DAY);
      const d = days.get(date) || { date, gross_mm: 0, program_ids: [], status: 'Programado' };
      d.gross_mm += Math.max(...active.map(p => p.rate)) * (end - cursor) / 3600000;
      d.program_ids = [...new Set([...d.program_ids, ...active.map(p => p.id)])];
      days.set(date, d); cursor = end;
    }
  }
  return [...days.values()].sort((a,b) => a.date.localeCompare(b.date));
}
export function allocateTurns(groups, programs, now = Date.now(), horizonDays = 15) {
  const horizon = dayStart(businessDay(now)) + horizonDays * DAY, occupied = new Map();
  for (const g of groups) if (!occupied.has(g.well.id)) {
    const spans = programs.filter(p => normalize(p.well) === normalize(wellProgramName(g.well))).map(programInterval).filter(Boolean).filter(s => s[1] > now);
    occupied.set(g.well.id, spans.sort((a,b) => a[0]-b[0]));
  }
  const ordered = [...groups].sort((a,b) => (a.recommendation?.date || '9999').localeCompare(b.recommendation?.date || '9999') || (a.reference?.row.state.available_water_percent ?? 100) - (b.reference?.row.state.available_water_percent ?? 100) || a.id.localeCompare(b.id));
  return ordered.map(g => {
    if (!g.recommendation) return g;
    const rec = g.recommendation, warnings = [...g.warnings], spans = occupied.get(g.well.id);
    const unexplainedRunning = g.well.current_active && !spans.some(([a,b]) => a <= now && b > now);
    if (unexplainedRunning) return { ...g, warnings: [...warnings, 'El pozo está encendido sin hora de fin planificada. Confirmá su disponibilidad para asignar el turno.'], recommendation: { ...rec, start: null, end: null, feasible: false } };
    let start = Math.max(now, dayStart(rec.date)); const duration = rec.minutes * 60000;
    for (const [a,b] of spans) { if (start + duration <= a) break; if (start < b && start + duration > a) start = b; }
    const end = start + duration;
    if (end > horizon) return { ...g, warnings: [...warnings, 'No hay espacio para el turno completo en los próximos 15 días. Revisá la capacidad y planificación del pozo.'], recommendation: { ...rec, start: null, end: null, feasible: false } };
    spans.push([start,end]); spans.sort((a,b) => a[0]-b[0]);
    const date = businessDay(start);
    if (date > rec.date) warnings.push(`La disponibilidad del pozo retrasa el turno respecto de ${rec.date}; revisá la urgencia del lote.`);
    return { ...g, warnings, recommendation: { ...rec, requestedDate: rec.date, date, start, end, feasible: true } };
  });
}
