// Monitoring is the sole source of executed irrigation. A valve only delivers
// water while its well is known to be running. Unknown prior states never count.
const DAY = 86400000;
const OFFSET = 3 * 3600000;
export const irrigationDay = time => new Date(time - OFFSET).toISOString().slice(0, 10);
export function recordedPumpHours(intervals, start, end) {
  const ordered = intervals.map(([a, b]) => [Math.max(a, start), Math.min(b, end)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  let duration = 0, lastStart = null, lastEnd = null;
  for (const [a, b] of ordered) {
    if (lastEnd != null && a <= lastEnd) lastEnd = Math.max(lastEnd, b);
    else { if (lastEnd != null) duration += lastEnd - lastStart; lastStart = a; lastEnd = b; }
  }
  if (lastEnd != null) duration += lastEnd - lastStart;
  return duration / 3600000;
}

export function activeIntervals(events, now) {
  const ordered = [...new Map(events.map(e => [e.id || e.request_id, e])).values()]
    .filter(e => Number.isFinite(Date.parse(e.occurred_at)) && Date.parse(e.occurred_at) <= now)
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || Number(a.sequence || 0) - Number(b.sequence || 0));
  const result = [], states = new Map();
  for (const event of ordered) {
    const previous = states.get(event.device_id);
    if (previous?.active === event.active) continue;
    if (previous?.active) result.push({ deviceId: event.device_id, eventId: previous.id,
      start: Date.parse(previous.occurred_at), end: Date.parse(event.occurred_at), open: false });
    states.set(event.device_id, event);
  }
  for (const [deviceId, event] of states) if (event.active) result.push({ deviceId, eventId: event.id,
    start: Date.parse(event.occurred_at), end: now, open: true });
  return result.filter(i => i.end > i.start);
}

export function applicationRate(design, lot) {
  if (!(design?.emitter_flow_lh > 0 && design?.emitters_per_plant > 0 && lot?.row_spacing > 0 && lot?.plant_spacing > 0)) return null;
  const rate = design.emitter_flow_lh * design.emitters_per_plant * Math.round(10000 / (lot.row_spacing * lot.plant_spacing)) / 10000;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function observedIrrigation(devices, events, lots, designs, now = Date.now(), from = -Infinity) {
  const intervals = activeIntervals(events, now), byLot = new Map(), pumpHours = new Map(), warnings = new Map();
  const segments = [];
  const warn = (id, message) => warnings.set(id, [...new Set([...(warnings.get(id) || []), message])]);
  for (const valve of devices.filter(d => d.kind === 'valve')) {
    for (const v of intervals.filter(i => i.deviceId === valve.id)) {
      for (const w of intervals.filter(i => i.deviceId === valve.parent_well_id)) {
        const start = Math.max(v.start, w.start, from), end = Math.min(v.end, w.end);
        if (end <= start) continue;
        for (const lotId of valve.lot_ids || []) {
          segments.push({ lotId, valveId: valve.id, portion: valve.portion || '', start, end,
            open: v.open && w.open, rate: applicationRate(designs.find(d => d.lot_id === lotId), lots.find(l => l.id === lotId)) });
          if ((v.open && now - v.start > DAY) || (w.open && now - w.start > DAY)) warn(lotId, 'equipo activo por más de 24 h: revisar cierre en Monitoreo de riegos');
        }
      }
    }
  }
  // Sweep per lot: duplicate valves serving the same portion do not duplicate
  // water; complementary halves count separately, at most one whole lot.
  for (const lotId of new Set(segments.map(s => s.lotId))) {
    const list = segments.filter(s => s.lotId === lotId);
    const boundaries = [...new Set(list.flatMap(s => [s.start, s.end]))].sort((a, b) => a - b);
    const daily = new Map();
    for (let i = 1; i < boundaries.length; i++) {
      let start = boundaries[i - 1]; const end = boundaries[i];
      const active = list.filter(s => s.start <= start && s.end >= end);
      if (!active.length) continue;
      const portions = new Set(active.map(s => s.portion));
      const factor = portions.has('') ? 1 : Math.min(1, portions.size * 0.5);
      const rate = active[0].rate;
      if (rate == null) warn(lotId, 'riego registrado sin lámina calculable: falta diseño de riego o marco de plantación');
      while (start < end) {
        const date = irrigationDay(start);
        const stop = Math.min(end, Date.parse(`${date}T00:00:00-03:00`) + DAY);
        const row = daily.get(date) || { date, seconds: 0, mm: rate == null ? null : 0, source: 'monitoreo', inProgress: false };
        row.seconds += (stop - start) / 1000 * factor;
        if (rate == null) row.mm = null;
        else if (row.mm != null) row.mm += (stop - start) / 3600000 * rate * factor;
        row.inProgress ||= active.some(s => s.open);
        daily.set(date, row); start = stop;
      }
    }
    byLot.set(lotId, daily);
  }
  for (const well of devices.filter(d => d.kind === 'well')) {
    if (!well.pump_id) continue;
    for (const interval of intervals.filter(i => i.deviceId === well.id)) {
      const values = pumpHours.get(well.pump_id) || [];
      values.push([interval.start, interval.end]); pumpHours.set(well.pump_id, values);
    }
  }
  return { byLot, pumpHours, warnings, segments, asOf: now };
}
