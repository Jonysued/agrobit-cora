export function clockMinutes(clock) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(clock || '');
  if (!match || +match[1] > 23 || +match[2] > 59) return null;
  return +match[1] * 60 + +match[2];
}
export function durationMinutes(start, end, startDate, endDate) {
  const a = clockMinutes(start), b = clockMinutes(end);
  if (a == null || b == null) return 0;
  if (startDate && endDate) {
    const days = (Date.parse(`${endDate}T00:00:00-03:00`) - Date.parse(`${startDate}T00:00:00-03:00`)) / 86400000;
    const minutes = days * 1440 + b - a;
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }
  return (b - a + 1440) % 1440;
}
// Actual dates also detect overlap with a session starting the previous day.
export function programOverlaps(program, draft, editId) {
  if ((editId != null && program.id === editId) || !['Programado', 'Activo'].includes(program.status) || program.well !== draft.well) return false;
  const interval = (date, clock, duration) => {
    const day = Date.parse(`${date}T00:00:00-03:00`), minute = clockMinutes(clock);
    if (!Number.isFinite(day) || minute == null || !Number.isFinite(duration) || !(duration > 0)) return null;
    const start = day + minute * 60000;
    return [start, start + duration * 60000];
  };
  const a = interval(program.date, program.start_time, Number(program.duration_min));
  const b = interval(draft.date, draft.start_time, durationMinutes(draft.start_time, draft.end_time, draft.date, draft.end_date));
  return !!(a && b && a[0] < b[1] && b[0] < a[1]);
}
