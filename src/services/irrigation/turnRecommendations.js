const round1 = value => Math.round(value * 10) / 10;
const validState = row => row?.forecast_status === 'ok' && row.forecast_quality?.level !== 'blocked' && Number.isFinite(row.state?.available_water_percent);
const portionFactor = portion => ['N', 'S', 'E', 'O'].includes(portion) ? 0.5 : 1;
const number = value => value.toLocaleString('es-AR', { maximumFractionDigits: 1 });

// Los grupos provienen del Monitoreo: no se inventan turnos a partir del pozo.
export function buildTurnRecommendations(devices, rows, today) {
  const wells = new Map(devices.filter(d => d.kind === 'well').map(w => [w.id, w]));
  const rowMap = new Map(rows.map(row => [row.lot.id, row]));
  const groups = new Map();
  for (const valve of devices.filter(d => d.kind === 'valve')) {
    const well = wells.get(valve.parent_well_id);
    if (!well) continue;
    const turno = String(valve.turno || '').trim().toUpperCase();
    const key = `${well.id}:${turno || 'sin-turno'}`;
    const group = groups.get(key) || { id: key, well, turno, members: new Map() };
    for (const lotId of valve.lot_ids || []) {
      const member = group.members.get(lotId) || { row: rowMap.get(lotId), lotId, factor: 0, valves: new Map() };
      member.valves.set(valve.id, valve);
      member.factor = Math.min(1, [...member.valves.values()].reduce((sum, v) => sum + portionFactor(v.portion), 0));
      group.members.set(lotId, member);
    }
    groups.set(key, group);
  }
  return [...groups.values()].map(group => {
    const members = [...group.members.values()];
    const available = members.filter(m => validState(m.row));
    const missing = members.filter(m => !validState(m.row));
    const driest = [...available].sort((a, b) => a.row.state.available_water_percent - b.row.state.available_water_percent)[0];
    const base = { ...group, members, missing, reference: driest || null, warnings: [], recommendation: null };
    if (!group.turno) return { ...base, status: 'Sin turno configurado' };
    if (!available.length) return { ...base, status: 'Sin datos de humedad suficientes' };
    if (missing.length) base.warnings.push(`${missing.length} lote(s) sin humedad o pronóstico suficientes: la recomendación es parcial.`);
    // Gobierna el lote más seco que todavía necesita agua adicional.
    // Los lotes ya cubiertos por el cronograma no agregan otra recomendación.
    const candidates = available.filter(m => m.row.recommendation?.recommended_start_date >= today && m.row.recommendation?.recommended_irrigation_mm > 0);
    candidates.sort((a, b) => a.row.state.available_water_percent - b.row.state.available_water_percent
      || a.row.recommendation.recommended_start_date.localeCompare(b.row.recommendation.recommended_start_date)
      || a.lotId.localeCompare(b.lotId));
    const reference = candidates[0];
    if (!reference) return { ...base, status: missing.length ? 'Evaluación parcial' : 'Sin riego adicional en 15 días' };
    base.reference = reference;
    const rate = reference.row.application_rate_mm_h;
    if (!(rate > 0) || !(reference.factor > 0)) return { ...base, status: 'Falta diseño de riego del lote de referencia' };
    const recommended = reference.row.recommendation;
    // Una sola duración para todo el turno, incluida la proporción del lote
    // abierta por las válvulas. Dos mitades del mismo lote equivalen al lote completo.
    const minutes = Math.ceil(recommended.recommended_irrigation_mm / (rate * reference.factor) * 60);
    const hours = minutes / 60;
    const date = recommended.recommended_start_date;
    if (hours > 24) base.warnings.push('La duración supera 24 horas. Revisá el diseño de riego y la capacidad del turno antes de programar.');
    const impacts = members.map(member => {
      const row = member.row;
      if (!validState(row) || !(row.application_rate_mm_h > 0)) return { ...member, appliedMm: null, excessMm: null };
      const appliedMm = round1(row.application_rate_mm_h * hours * member.factor);
      const nextDate = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
      const next = row.scenarioWithoutIrrigation?.find(p => p.date === nextDate);
      const capacity = row.state.total_available_water_capacity_mm;
      const net = appliedMm * (row.efficiency > 0 ? row.efficiency : 1);
      const excessMm = next && capacity != null ? round1(Math.max(0, next.available_water_mm + net - capacity)) : null;
      return { ...member, appliedMm, excessMm };
    });
    const excessive = impacts.filter(m => m.excessMm > 0.5);
    if (excessive.length) base.warnings.push(`Posible exceso sobre capacidad de campo: ${excessive.map(m => `${m.row.lot.name} (${number(m.excessMm)} mm)`).join(', ')}. Se mantiene la duración que necesita el lote más seco.`);
    if (impacts.some(m => m.appliedMm == null)) base.warnings.push('Hay lotes sin diseño o humedad suficientes para estimar los milímetros que recibirán.');
    const confidence = reference.row.forecast_quality;
    if (confidence?.level !== 'complete') base.warnings.push(...(confidence?.warnings || []));
    return { ...base, status: date <= today ? 'Regar hoy' : 'Riego recomendado',
      recommendation: { date, minutes, hours, appliedMm: round1(rate * hours * reference.factor), percentAtDate: percentAt(reference.row, date), impacts } };
  }).sort((a, b) => (a.recommendation?.date || '9999').localeCompare(b.recommendation?.date || '9999')
    || a.well.farm.localeCompare(b.well.farm) || a.well.name.localeCompare(b.well.name, undefined, { numeric: true }) || a.turno.localeCompare(b.turno));
}

function percentAt(row, date) {
  return row.scenarioWithoutIrrigation?.find(p => p.date === date)?.available_water_percent ?? row.state.available_water_percent;
}
