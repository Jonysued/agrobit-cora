// ============================================================
// Arquitectura genérica de adapters de estaciones meteorológicas.
// Cada marca se conecta acá; la UI nunca depende del proveedor.
// Las credenciales viven como secrets del backend y nunca se exponen.
// ============================================================
import { secrets } from "base44:runtime";

// Credencial por proveedor — se cargan como secrets de la app.
const CREDENTIALS = {
  davis: "WEATHER_DAVIS_API_KEY",
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
export const DavisWeatherAdapter = { test: async () => notImplemented("Davis (WeatherLink)") };
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