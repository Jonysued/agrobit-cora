// Una única estación observada para reconstrucción y calibración de todos los lotes.
// El pronóstico futuro se obtiene por separado en weatherService.
export const GARITA_NAME = 'garita';

export function selectGaritaStation(stations) {
  return (stations || []).find(s => s.name?.trim().toLocaleLowerCase('es-AR') === GARITA_NAME && s.active !== false) || null;
}

const round1 = n => Math.round(n * 10) / 10;
const dayKey = timestamp => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(timestamp));
const localHour = timestamp => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hourCycle: 'h23',
}).format(new Date(timestamp)));
const localMinute = timestamp => Number(new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Argentina/Buenos_Aires', minute: '2-digit',
}).format(new Date(timestamp)));

export function aggregateGaritaObservations(observations) {
  const raw = new Map();
  const seen = new Set();
  let lastObservationAt = null;
  // El proveedor conserva el acumulado de AYER en la primera lectura de
  // medianoche y lo reinicia luego. Procesar en orden permite descartar
  // esas lecturas antes de calcular el máximo del día local.
  const chronological = [...(observations || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  for (const o of chronological) {
    if (!o.timestamp || Number.isNaN(new Date(o.timestamp).getTime())) continue;
    // La sincronización puede copiar una lectura a varias fincas. Se cuenta
    // una sola vez para evitar duplicar lluvia y ET0 de la misma estación.
    if (seen.has(o.timestamp)) continue;
    seen.add(o.timestamp);
    if (!lastObservationAt || new Date(o.timestamp) > new Date(lastObservationAt)) lastObservationAt = o.timestamp;
    const day = dayKey(o.timestamp);
    const cur = raw.get(day) || { rain: 0, etoSum: 0, etoN: 0, etDayMax: null, lastEt: null, awaitingReset: false };
    cur.rain += o.rainfall_mm || 0;
    if (o.et_day_mm != null) {
      const et = Number(o.et_day_mm);
      if (cur.lastEt != null && cur.lastEt - et >= 0.5) {
        // Reinicio dentro del mismo día: todo el máximo previo era de ayer.
        cur.etDayMax = null;
        cur.etoSum = 0;
        cur.etoN = 0;
        cur.awaitingReset = false;
      } else if (cur.lastEt == null && localHour(o.timestamp) === 0 && localMinute(o.timestamp) < 15 && et >= 0.5) {
        // Si todavía no llegó la lectura de reinicio, no presentar el
        // acumulado arrastrado como ET0 medida de hoy.
        cur.awaitingReset = true;
      }
      cur.lastEt = et;
      if (!cur.awaitingReset && et > (cur.etDayMax ?? -Infinity)) cur.etDayMax = et;
    }
    if (!cur.awaitingReset && o.eto_mm > 0) { cur.etoSum += o.eto_mm; cur.etoN++; }
    raw.set(day, cur);
  }
  const byDay = new Map();
  raw.forEach((v, day) => byDay.set(day, {
    rain: round1(v.rain),
    eto: v.etDayMax != null ? round1(v.etDayMax) : (v.etoN ? round1(v.etoSum) : null),
  }));
  const dailyEtos = [...byDay.values()].map(v => v.eto).filter(v => v != null);
  const meanEto = dailyEtos.length ? round1(dailyEtos.reduce((s, v) => s + v, 0) / dailyEtos.length) : null;
  return { byDay, meanEto, lastObservationAt };
}
