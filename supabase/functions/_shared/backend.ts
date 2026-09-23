import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables: Record<string, string> = {
  Campaign: 'campaigns', EnergyTariff: 'energy_tariffs', Farm: 'farms',
  HealthRecord: 'health_records', IrrigationDesign: 'irrigation_designs',
  IrrigationLog: 'irrigation_logs', IrrigationProgram: 'irrigation_programs',
  IrrigationRecommendation: 'irrigation_recommendations', Lot: 'lots',
  LotDocument: 'lot_documents', LotWaterState: 'lot_water_states',
  Objective: 'objectives', Observation: 'observations',
  ProductionRecord: 'production_records', PruningRecord: 'pruning_records',
  Pump: 'pumps', Sensor: 'sensors', SensorReading: 'sensor_readings',
  SoilBehaviorModel: 'soil_behavior_models', SoilLayer: 'soil_layers',
  SoilMonitoringPoint: 'soil_monitoring_points', SoilProbe: 'soil_probes',
  SoilProbeChannel: 'soil_probe_channels', SoilProfile: 'soil_profiles',
  WaterBalanceForecast: 'water_balance_forecasts', WeatherForecast: 'weather_forecasts',
  WeatherObservation: 'weather_observations', WeatherStation: 'weather_stations',
};

function fail(error: any) {
  if (error) throw new Error(error.message || 'Supabase request failed');
}

function entityApi(name: string) {
  const table = tables[name];
  if (!table) throw new Error(`Unknown entity: ${name}`);
  return {
    async list(sort = '-created_date', limit = 1000) {
      const desc = sort.startsWith('-');
      const column = desc ? sort.slice(1) : sort;
      const { data, error } = await client.from(table).select('*')
        .order(column, { ascending: !desc }).limit(limit);
      fail(error); return data || [];
    },
    async filter(filters: Record<string, unknown> = {}, sort = '-created_date', limit = 1000) {
      let query = client.from(table).select('*');
      for (const [column, value] of Object.entries(filters)) {
        query = value === null ? query.is(column, null) : query.eq(column, value);
      }
      const desc = sort.startsWith('-');
      const column = desc ? sort.slice(1) : sort;
      const { data, error } = await query.order(column, { ascending: !desc }).limit(limit);
      fail(error); return data || [];
    },
    async get(id: string) {
      const { data, error } = await client.from(table).select('*').eq('id', id).single();
      fail(error); return data;
    },
    async create(payload: Record<string, unknown>) {
      const { data, error } = await client.from(table).insert(payload).select('*').single();
      fail(error); return data;
    },
    async bulkCreate(payload: Record<string, unknown>[]) {
      if (!payload.length) return [];
      const { data, error } = await client.from(table).insert(payload).select('*');
      fail(error); return data || [];
    },
    async update(id: string, payload: Record<string, unknown>) {
      const { data, error } = await client.from(table)
        .update({ ...payload, updated_date: new Date().toISOString() })
        .eq('id', id).select('*').single();
      fail(error); return data;
    },
    async delete(id: string) {
      const { error } = await client.from(table).delete().eq('id', id);
      fail(error); return { id };
    },
    async deleteMany(filters: Record<string, unknown> = {}) {
      let query = client.from(table).delete();
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
      const { data, error } = await query.select('id');
      fail(error); return data || [];
    },
  };
}

const entities = new Proxy<Record<string, any>>({}, {
  get(cache, name: string) {
    if (!cache[name]) cache[name] = entityApi(name);
    return cache[name];
  },
});

export const serviceBackend = { entities };

export async function requireAdmin(req: Request) {
  const header = req.headers.get('Authorization') || '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  if (token === serviceRoleKey) return { backend: serviceBackend, user: { role: 'admin', service_role: true } };
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('*').eq('id', data.user.id).single();
  fail(profileError);
  if (profile.role !== 'admin') throw Object.assign(new Error('Forbidden'), { status: 403 });
  return { backend: serviceBackend, user: { ...data.user, ...profile } };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function withCors(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    try {
      const response = await handler(req);
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      const status = Number((error as any)?.status) || 500;
      return Response.json(
        { error: (error as Error)?.message || 'Unexpected error' },
        { status, headers: corsHeaders },
      );
    }
  };
}
