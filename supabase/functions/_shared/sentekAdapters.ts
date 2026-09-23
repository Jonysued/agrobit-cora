// ============================================================
// Adaptador de sondas Sentek · IrriMAX Live (API v1.9).
// API: https://www.irrimaxlive.com/api/?cmd=…
//   · getloggers  → XML con los loggers (bases de datos) de la
//     cuenta y sus sensores reales (profundidades, nunca asumidas).
//   · getreadings → CSV con las lecturas de un logger.
// Autenticación: API key pre-compartida (Settings de IrriMAX Live)
// como secret del backend (SENTEK_IRRIMAX_API_TOKEN) — nunca llega
// al frontend. La sonda se identifica por el nombre del logger
// (external_device_id). Los sensores A# (Soil Water Content) vienen
// en mm de agua por capa de 10 cm — numéricamente igual al % de
// humedad volumétrica que usa la app.
// IrriMAX registra las fechas en hora local del sitio; la app opera
// en Argentina (UTC-3, sin horario de verano).
// ============================================================
const secrets = { get: (name) => Deno.env.get(name) || null };

const CREDENTIAL = "SENTEK_IRRIMAX_API_TOKEN";
const API = "https://www.irrimaxlive.com/api/";
const TZ = "-03:00";

function getKey() {
  try { return secrets.get(CREDENTIAL) || null; } catch (e) { return null; }
}

function missingCredentials() {
  return { ok: false, status: "missing_credentials", message: "Falta configurar SENTEK_IRRIMAX_API_TOKEN en los secrets de la app (Settings de IrriMAX Live → API key)." };
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) result[match[1]] = match[2];
  return result;
}

function classifySensor(attrs) {
  const label = `${attrs.type || ''} ${attrs.measurement || ''} ${attrs.name || ''}`.toLowerCase();
  if (/temperature|temperatura/.test(label)) return { sensor_type: 'soil_temperature', default_unit: '°C' };
  if (/salinity|conductivity|conductividad|\bvic\b/.test(label)) return { sensor_type: 'electrical_conductivity', default_unit: 'VIC' };
  if (/water content|moisture|humedad/.test(label)) return { sensor_type: 'soil_moisture', default_unit: '%' };
  return null;
}

function parseSensors(block) {
  const sensors = [];
  for (const match of block.matchAll(/<Sensor\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const classification = classifySensor(attrs);
    const depth = Number(attrs.depth_cm ?? attrs.depth ?? attrs.Depth);
    if (!classification || !attrs.name || !Number.isFinite(depth)) continue;
    sensors.push({
      sensor: attrs.name,
      depth_cm: depth,
      sensor_type: classification.sensor_type,
      unit: attrs.unit || attrs.units || classification.default_unit,
      provider_type: attrs.type || attrs.measurement || null,
    });
  }
  return sensors;
}

// ---- getloggers: loggers de la cuenta y todos sus sensores de suelo ----
export async function getSentekLoggers() {
  const key = getKey();
  if (!key) return missingCredentials();
  try {
    const res = await fetch(`${API}?cmd=getloggers&key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: "error", message: "IrriMAX Live rechazó la API key — verificá el token generado en tu página de Settings." };
    }
    if (!res.ok) return { ok: false, status: "error", message: `IrriMAX Live respondió con código ${res.status}.` };
    const xml = await res.text();
    if (!/<Logger/.test(xml)) {
      return { ok: false, status: "error", message: "IrriMAX Live no devolvió loggers para esta API key." };
    }
    // Cada bloque <Logger> contiene sus <Site>/<Probe>/<Sensor> anidados.
    const loggers = xml.split(/<Logger\s/).slice(1).map(block => ({
      name: (block.match(/name="([^"]+)"/) || [])[1] || null,
      logger_id: (block.match(/logger_id="([^"]+)"/) || [])[1] || null,
      sensors: parseSensors(block),
    })).filter(l => l.name);
    return { ok: true, status: "connected", loggers };
  } catch (e) {
    return { ok: false, status: "error", message: `No se pudo contactar IrriMAX Live: ${e.message}` };
  }
}

// ---- Prueba de conexión de una sonda Sentek registrada ----
export async function testSentekProbe(probe) {
  if (!probe || !probe.external_device_id) {
    return { ok: false, status: "misconfigured", message: "Falta el nombre del logger de la sonda en IrriMAX Live (campo ID del dispositivo)." };
  }
  const loggers = await getSentekLoggers();
  if (!loggers.ok) return loggers;
  const wanted = String(probe.external_device_id).toLowerCase();
  const logger = (loggers.loggers || []).find(l => String(l.name).toLowerCase() === wanted);
  if (!logger) {
    const names = (loggers.loggers || []).map(l => l.name).join(", ");
    return { ok: false, status: "error", message: `No se encontró el logger "${probe.external_device_id}" en tu cuenta de IrriMAX Live. Loggers disponibles: ${names || "ninguno"}.` };
  }
  if (!logger.sensors.length) {
    return { ok: false, status: "error", message: `El logger "${logger.name}" no tiene sensores de suelo compatibles configurados.` };
  }
  const counts = logger.sensors.reduce((acc, sensor) => {
    acc[sensor.sensor_type] = (acc[sensor.sensor_type] || 0) + 1;
    return acc;
  }, {});
  const labels = [
    counts.soil_moisture ? `${counts.soil_moisture} de humedad` : null,
    counts.soil_temperature ? `${counts.soil_temperature} de temperatura` : null,
    counts.electrical_conductivity ? `${counts.electrical_conductivity} de conductividad/salinidad` : null,
  ].filter(Boolean).join(', ');
  return {
    ok: true,
    status: "connected",
    message: `Conectada: ${labels}. Profundidades: ${[...new Set(logger.sensors.map(s => s.depth_cm))].sort((a, b) => a - b).join("/")} cm.`,
    logger,
  };
}

// ---- Lecturas de una sonda desde una fecha (o 14 días por defecto).
// Devuelve [{timestamp, measurements: [{sensor_type, depth_cm, unit, value}]}].
export async function fetchSentekReadings(probe, fromIso) {
  const test = await testSentekProbe(probe);
  if (!test.ok) return test;
  const key = getKey();
  const pad = n => String(n).padStart(2, "0");
  // Ventana incremental: desde la última lectura menos 2 h de margen.
  // Primera importación acotada a 7 días: alcanza para inicializar los gráficos
  // sin exceder el tiempo máximo de la Edge Function con históricos masivos.
  const fromMs = (fromIso ? new Date(fromIso).getTime() : Date.now() - 7 * 86400000) - 2 * 3600000;
  // Hora local del sitio (UTC-3): componentes de pared locales de un instante UTC.
  const local = new Date(fromMs - 3 * 3600000);
  const from = `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}${pad(local.getUTCSeconds())}`;
  try {
    const res = await fetch(`${API}?cmd=getreadings&key=${encodeURIComponent(key)}&name=${encodeURIComponent(probe.external_device_id)}&from=${from}`, {
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) {
      return { ok: false, status: "error", message: `IrriMAX Live respondió con código ${res.status} al pedir las lecturas.` };
    }
    const csv = await res.text();
    const lines = csv.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      return { ok: true, status: "connected", message: "Sin lecturas nuevas en IrriMAX Live.", rows: [], logger: test.logger };
    }
    // IrriMAX usa una columna por sensor/profundidad. La letra no se
    // interpreta: el tipo real viene del XML de getloggers.
    const sensorByNameDepth = new Map(test.logger.sensors.map(sensor => [`${sensor.sensor}|${sensor.depth_cm}`, sensor]));
    const measurementCols = [];
    lines[0].split(",").forEach((h, i) => {
      const clean = h.trim().replace(/^"|"$/g, '');
      const m = clean.match(/^([^()]+)\((\d+(?:\.\d+)?)\)(?:\[([^\]]+)\])?$/);
      if (!m) return;
      const sensor = sensorByNameDepth.get(`${m[1]}|${Number(m[2])}`);
      if (sensor) measurementCols.push({ col: i, ...sensor, unit: m[3] || sensor.unit });
    });
    const rows = [];
    for (const line of lines.slice(1)) {
      const cells = line.split(",");
      const dm = (cells[0] || "").match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
      if (!dm) continue;
      const timestamp = `${dm[1]}-${dm[2]}-${dm[3]}T${dm[4]}:${dm[5]}:${dm[6]}${TZ}`;
      const measurements = [];
      for (const c of measurementCols) {
        const raw = (cells[c.col] || "").trim();
        if (!raw || raw === "-1") continue; // valor inválido del sensor
        const v = Number(raw);
        if (Number.isFinite(v) && v >= 0) measurements.push({
          external_channel_id: c.sensor,
          sensor_type: c.sensor_type,
          depth_cm: c.depth_cm,
          unit: c.unit,
          value: Math.round(v * 10000) / 10000,
        });
      }
      if (measurements.length) rows.push({ timestamp, measurements });
    }
    return { ok: true, status: "connected", rows, logger: test.logger };
  } catch (e) {
    return { ok: false, status: "error", message: `No se pudo contactar IrriMAX Live: ${e.message}` };
  }
}
