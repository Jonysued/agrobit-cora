// ============================================================
// Arquitectura genérica de adapters de estaciones meteorológicas.
// Cada marca se conecta acá; la UI nunca depende del proveedor.
// Las credenciales viven como secrets del backend y nunca se exponen.
// ============================================================
const secrets = { get: (name) => Deno.env.get(name) || null };

// Credencial por proveedor — se cargan como secrets de la app.
const CREDENTIALS = {
  davis: "WEATHER_DAVIS_API_KEY",
  davis_secret: "WEATHER_DAVIS_API_SECRET",
  wiseconn: "WEATHER_WISECONN_API_KEY",
  pessl: "WEATHER_PESSL_API_KEY",
  campbell: "WEATHER_CAMPBELL_API_KEY",
  metos: "WEATHER_METOS_API_KEY",
  generic_api: "WEATHER_GENERIC_API_KEY",
};

function getSecret(name) {
  try { return secrets.get(name) || null; } catch (e) { return null; }
}

function hoursSince(iso) {
  return iso ? (Date.now() - new Date(iso).getTime()) / 3600000 : null;
}

function notImplemented(label) {
  return {
    ok: false,
    status: "not_implemented",
    message: `El adapter de ${label} todavía no está conectado. La arquitectura ya lo soporta — se activará cuando se cargue la credencial correspondiente como secret de la app.`,
  };
}

// ---- Adapters por proveedor (se irán conectando marca por marca) ----
// Davis WeatherLink (Data API v2): prueba de conexión real contra la
// estación configurada. Requiere los secrets WEATHER_DAVIS_API_KEY y
// WEATHER_DAVIS_API_SECRET y el ID de estación de WeatherLink en
// external_station_id (Configuración → Estación meteorológica).
// Normaliza la respuesta de WeatherLink v2 current conditions al formato
// interno unificado. Soporta los ISS de WeatherLink Live (temp/hum) y los
// registros de consola Vantage (temp_out/hum_out). Devuelve null en toda
// variable que la estación no entregue — nunca se inventan valores.
function normalizeDavisCurrent(json) {
  // Una estación Davis reporta varios sensores (ISS, barómetro, consola).
  // Cada variable se toma del PRIMER sensor que la entregue: nunca se
  // inventa, y null significa que esa estación no la reporta.
  const recs = [];
  for (const sensor of json.sensors || []) {
    for (const d of Array.isArray(sensor.data) ? sensor.data : []) {
      if (d && typeof d === "object") recs.push(d);
    }
  }
  const tsSec = recs.reduce((m, d) => Math.max(m, d.ts || 0), json.generated_at || 0);
  const r1 = n => Math.round(n * 10) / 10;
  const pick = (fields, map) => {
    for (const d of recs) {
      for (const f of fields) {
        if (d[f] != null) return map(d[f]);
      }
    }
    return null;
  };
  return {
    timestamp: tsSec ? new Date(tsSec * 1000).toISOString() : null,
    temperature_c: pick(["temp", "temp_out"], v => r1((v - 32) * 5 / 9)),
    relative_humidity_percent: pick(["hum", "hum_out"], v => v),
    wind_speed_kmh: pick(["wind_speed_last", "wind_speed_avg", "wind_speed"], v => r1(v * 1.609344)),
    wind_gust_kmh: pick(["wind_speed_hi_last_10_min", "wind_speed_hi", "wind_gust_10_min"], v => r1(v * 1.609344)),
    wind_direction_deg: pick(["wind_dir_last", "wind_dir", "wind_dir_of_prevail"], v => v),
    solar_radiation_w_m2: pick(["solar_rad", "solar_rad_avg"], v => v),
    atmospheric_pressure_hpa: pick(["bar_sea_level", "bar", "abs_press"], v => r1(v * 33.8639)),
    eto_mm: pick(["et"], v => r1(v * 25.4)),
    et_day_mm: pick(["et_day"], v => r1(v * 25.4)),
    rainfall_daily_mm: pick(["rainfall_daily_mm", "rain_day_mm"], v => r1(v)) ?? pick(["rainfall_daily_in", "rain_day_in"], v => r1(v * 25.4)),
    rain_rate_mm_h: pick(["rain_rate_last_mm", "rain_rate_mm", "rain_rate_hi_mm"], v => r1(v)),
    uv_index: pick(["uv_index", "uv_index_avg"], v => v),
    provider_station_id: json.station_id ?? null,
  };
}

export const DavisWeatherAdapter = {
  test: async (station) => {
    const apiKey = getSecret(CREDENTIALS.davis);
    const apiSecret = getSecret(CREDENTIALS.davis_secret);
    if (!apiKey || !apiSecret) {
      return { ok: false, status: "missing_credentials", message: "Falta configurar WEATHER_DAVIS_API_KEY y WEATHER_DAVIS_API_SECRET en los secrets de la app." };
    }
    if (!station.external_station_id) {
      return { ok: false, status: "misconfigured", message: "Falta el ID de estación de WeatherLink (campo ID / endpoint externo)." };
    }
    try {
      // Autenticación oficial WeatherLink v2: api-key como query param y
      // el API Secret como header X-Api-Secret (nunca viaja en la URL).
      const res = await fetch(`https://api.weatherlink.com/v2/current/${station.external_station_id}?api-key=${encodeURIComponent(apiKey)}`, {
        headers: { "X-Api-Secret": apiSecret },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) return { ok: true, status: "connected", message: "WeatherLink respondió correctamente." };
      if (res.status === 404) {
        return { ok: false, status: "error", message: "La estación no existe o la API key no tiene acceso — verificá el ID de estación de WeatherLink." };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: "error", message: "WeatherLink rechazó la credencial — verificá el API key/secret y que la estación pertenezca a la cuenta." };
      }
      return { ok: false, status: "error", message: `WeatherLink respondió con código ${res.status}.` };
    } catch (e) {
      return { ok: false, status: "error", message: `No se pudo contactar WeatherLink: ${e.message}` };
    }
  },

  // Dato en vivo: trae las condiciones actuales y las normaliza al
  // formato interno unificado (°C, %, km/h, hPa, mm, W/m²).
  fetch: async (station) => {
    const apiKey = getSecret(CREDENTIALS.davis);
    const apiSecret = getSecret(CREDENTIALS.davis_secret);
    if (!apiKey || !apiSecret) {
      return { ok: false, status: "missing_credentials", message: "Falta configurar WEATHER_DAVIS_API_KEY y WEATHER_DAVIS_API_SECRET en los secrets de la app." };
    }
    if (!station.external_station_id) {
      return { ok: false, status: "misconfigured", message: "Falta el ID de estación de WeatherLink (campo ID / endpoint externo)." };
    }
    try {
      const res = await fetch(`https://api.weatherlink.com/v2/current/${station.external_station_id}?api-key=${encodeURIComponent(apiKey)}`, {
        headers: { "X-Api-Secret": apiSecret },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, status: "error", message: "WeatherLink rechazó la credencial — verificá el API key/secret." };
      }
      if (res.status === 404) {
        return { ok: false, status: "error", message: "La estación no existe o la API key no tiene acceso." };
      }
      if (!res.ok) {
        return { ok: false, status: "error", message: `WeatherLink respondió con código ${res.status}.` };
      }
      const json = await res.json();
      const observation = normalizeDavisCurrent(json);
      if (!observation.timestamp) {
        return { ok: false, status: "error", message: "WeatherLink no devolvió datos de sensores." };
      }
      return { ok: true, observation };
    } catch (e) {
      return { ok: false, status: "error", message: `No se pudo contactar WeatherLink: ${e.message}` };
    }
  },
};
export const WiseConnWeatherAdapter = { test: async () => notImplemented("WiseConn") };
export const PesslWeatherAdapter = { test: async () => notImplemented("Pessl") };
export const CampbellWeatherAdapter = { test: async () => notImplemented("Campbell Scientific") };
export const MetosWeatherAdapter = { test: async () => notImplemented("Metos / FieldClimate") };

// API genérica: consulta el endpoint configurado con la credencial como header.
export const GenericWeatherAdapter = {
  test: async (station) => {
    if (!station.external_station_id) {
      return { ok: false, status: "misconfigured", message: "Falta el endpoint de la estación (campo ID / endpoint externo)." };
    }
    const key = getSecret(CREDENTIALS.generic_api);
    if (!key) {
      return { ok: false, status: "missing_credentials", message: "Falta configurar la credencial WEATHER_GENERIC_API_KEY en los secrets de la app." };
    }
    try {
      const res = await fetch(station.external_station_id, { headers: { "x-api-key": key } });
      if (!res.ok) {
        return { ok: false, status: "error", message: `El endpoint de la estación respondió con código ${res.status}.` };
      }
      return { ok: true, status: "connected", message: "El endpoint respondió correctamente." };
    } catch (e) {
      return { ok: false, status: "error", message: `No se pudo alcanzar el endpoint: ${e.message}` };
    }
  },
};

export const WebhookWeatherAdapter = {
  test: async (station) => {
    const h = hoursSince(station.last_data_at);
    if (h != null && h <= 48) return { ok: true, status: "connected", message: "Recibiendo datos por webhook." };
    return { ok: false, status: "error", message: "No se recibieron datos por webhook en las últimas 48 horas." };
  },
};

export const ManualWeatherAdapter = {
  test: async (station) => {
    const h = hoursSince(station.last_data_at);
    if (h != null && h <= 24 * 30) return { ok: true, status: "connected", message: "Estación con datos cargados manualmente al día." };
    return { ok: false, status: "error", message: "Sin datos cargados manualmente." };
  },
};

const ADAPTERS = {
  davis: DavisWeatherAdapter,
  wiseconn: WiseConnWeatherAdapter,
  pessl: PesslWeatherAdapter,
  campbell: CampbellWeatherAdapter,
  metos: MetosWeatherAdapter,
  generic_api: GenericWeatherAdapter,
  webhook: WebhookWeatherAdapter,
  manual: ManualWeatherAdapter,
};

// Punto de entrada único: todas las estaciones se prueban igual,
// sin exponer credenciales ni marcas específicas al frontend.
export function testStation(station) {
  const adapter = ADAPTERS[station.provider] || GenericWeatherAdapter;
  return adapter.test(station);
}

// Dato observado en vivo de la estación, normalizado al formato interno.
export async function fetchStationObservation(station) {
  const adapter = ADAPTERS[station.provider] || GenericWeatherAdapter;
  if (typeof adapter.fetch !== "function") {
    return { ok: false, status: "not_implemented", message: `El adapter ${station.provider} todavía no trae datos en vivo — la arquitectura ya lo soporta.` };
  }
  return adapter.fetch(station);
}
