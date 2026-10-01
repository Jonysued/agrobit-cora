import { isNative, authCallbackOrigin } from '@/lib/native';
import { isOnline } from '@/lib/connectivity';
import { configureOffline, cachedUser, setOfflineUser, entityRead, entityWrite, queueFile, networkFailure } from '@/lib/offline';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

configureOffline(supabase);

const entityTables = {
  Campaign: 'campaigns',
  EnergyTariff: 'energy_tariffs',
  Farm: 'farms',
  HealthRecord: 'health_records',
  IrrigationDesign: 'irrigation_designs',
  IrrigationLog: 'irrigation_logs',
  IrrigationProgram: 'irrigation_programs',
  IrrigationRecommendation: 'irrigation_recommendations',
  Lot: 'lots',
  LotDocument: 'lot_documents',
  LotWaterState: 'lot_water_states',
  Objective: 'objectives',
  Observation: 'observations',
  ProductionRecord: 'production_records',
  PruningRecord: 'pruning_records',
  Pump: 'pumps',
  Sensor: 'sensors',
  SensorReading: 'sensor_readings',
  SoilBehaviorModel: 'soil_behavior_models',
  SoilLayer: 'soil_layers',
  SoilMonitoringPoint: 'soil_monitoring_points',
  SoilProbe: 'soil_probes',
  SoilProbeChannel: 'soil_probe_channels',
  SoilProfile: 'soil_profiles',
  WaterBalanceForecast: 'water_balance_forecasts',
  WeatherForecast: 'weather_forecasts',
  WeatherObservation: 'weather_observations',
  WeatherStation: 'weather_stations',
};

const functionNames = {
  fetchSentekProbeData: 'agro-sync',
  fetchWeatherStationData: 'agro-sync',
  syncAllSentekProbes: 'agro-sync',
  syncAllIntegrations: 'agro-sync',
  testSentekProbe: 'agro-sync',
  testWeatherStation: 'agro-sync',
};

const agroSyncActions = new Set(Object.keys(functionNames));

function fail(error) {
  if (!error) return;
  const wrapped = new Error(error.message || 'Supabase request failed');
  wrapped.status = error.status || error.code;
  wrapped.code = error.code;
  wrapped.details = error.details;
  throw wrapped;
}

function withoutUndefined(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, item]) => item !== undefined)
  );
}

function notifyDataMutation() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('lucient:data-mutated'));
}

function applyOrder(query, sort = '-created_date') {
  if (!sort) return query;
  return sort.split(',').reduce((ordered, field) => {
    const descending = field.startsWith('-');
    const column = descending ? field.slice(1) : field;
    return ordered.order(column, { ascending: !descending });
  }, query);
}

function rawEntityApi(entityName) {
  const table = entityTables[entityName];
  if (!table) throw new Error(`Unknown entity: ${entityName}`);

  return {
    async list(sort = '-created_date', limit = 1000) {
      let query = supabase.from(table).select('*');
      query = applyOrder(query, sort);
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      fail(error);
      return data || [];
    },

    async filter(criteria = {}, sort = '-created_date', limit = 1000, offset = 0) {
      let query = supabase.from(table).select('*');
      for (const [column, value] of Object.entries(criteria || {})) {
        if (value === null) query = query.is(column, null);
        else if (Array.isArray(value)) query = query.contains(column, value);
        else if (typeof value === 'object') {
          if (value.$gte !== undefined) query = query.gte(column, value.$gte);
          if (value.$lte !== undefined) query = query.lte(column, value.$lte);
          if (value.$gt !== undefined) query = query.gt(column, value.$gt);
          if (value.$lt !== undefined) query = query.lt(column, value.$lt);
          if (value.$neq !== undefined) query = query.neq(column, value.$neq);
          if (value.$in !== undefined) query = query.in(column, value.$in);
        }
        else query = query.eq(column, value);
      }
      query = applyOrder(query, sort);
      if (limit) query = query.range(offset, offset + limit - 1);
      const { data, error } = await query;
      fail(error);
      return data || [];
    },

    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
      fail(error);
      return data;
    },

    async create(payload) {
      const { data, error } = await supabase
        .from(table)
        .insert(withoutUndefined(payload))
        .select('*')
        .single();
      fail(error);
      notifyDataMutation();
      return data;
    },

    async bulkCreate(payloads) {
      if (!payloads?.length) return [];
      const { data, error } = await supabase
        .from(table)
        .insert(payloads.map(withoutUndefined))
        .select('*');
      fail(error);
      notifyDataMutation();
      return data || [];
    },

    async update(id, payload) {
      const { data, error } = await supabase
        .from(table)
        .update({ ...withoutUndefined(payload), updated_date: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      fail(error);
      notifyDataMutation();
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      fail(error);
      notifyDataMutation();
      return { id };
    },

    async deleteMany(criteria = {}) {
      let query = supabase.from(table).delete();
      for (const [column, value] of Object.entries(criteria || {})) {
        if (value === null) query = query.is(column, null);
        else query = query.eq(column, value);
      }
      const { data, error } = await query.select('id');
      fail(error);
      notifyDataMutation();
      return data || [];
    },

    subscribe(callback) {
      const channel = supabase
        .channel(`${table}-${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          callback
        )
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
  };
}

function entityApi(entityName) {
  const raw = rawEntityApi(entityName), table = entityTables[entityName];
  return {
    ...raw,
    list: (sort = '-created_date', limit = 1000) => entityRead(table, 'all', () => raw.list(sort, null), {}, sort, limit),
    filter: (criteria = {}, sort = '-created_date', limit = 1000, offset = 0) => entityRead(table, JSON.stringify([criteria, sort, limit, offset]), () => raw.filter(criteria, sort, limit, offset), criteria, sort, limit, offset, true),
    async get(id) { const rows = await entityRead(table, `id:${id}`, async () => [await raw.get(id)], { id }, '', 1); if (!rows[0]) throw new Error('Registro no disponible en este dispositivo.'); return rows[0]; },
    create: payload => entityWrite(table, 'create', payload.id, withoutUndefined(payload)),
    async bulkCreate(payloads) { const rows = []; for (const payload of payloads || []) rows.push(await entityWrite(table, 'create', payload.id, withoutUndefined(payload))); return rows; },
    update: (id, payload) => entityWrite(table, 'update', id, withoutUndefined(payload)),
    delete: id => entityWrite(table, 'delete', id),
    async deleteMany(criteria = {}) { const rows = await this.filter(criteria, '', null); for (const row of rows) await entityWrite(table, 'delete', row.id); return rows.map(({ id }) => ({ id })); },
  };
}

const entities = new Proxy({}, {
  get(cache, entityName) {
    if (typeof entityName !== 'string') return undefined;
    if (!cache[entityName]) cache[entityName] = entityApi(entityName);
    return cache[entityName];
  },
});

async function currentUser() {
  if (!isOnline()) { const stored = await cachedUser(); if (!stored) throw new Error('Iniciá sesión con conexión antes de trabajar offline.'); await setOfflineUser(stored); return stored; }
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError && networkFailure(authError)) { const stored = await cachedUser(); if (stored) { await setOfflineUser(stored); return stored; } }
  fail(authError);
  if (!authData.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (profileError && networkFailure(profileError)) { const stored = await cachedUser(); if (stored?.id === authData.user.id) { await setOfflineUser(stored); return stored; } }
  fail(profileError);
  if (!profile) throw new Error('Usuario no habilitado.');
  const result = {
    id: authData.user.id,
    email: authData.user.email,
    full_name: profile?.full_name || authData.user.user_metadata?.full_name || authData.user.email,
    role: profile?.role || 'user',
    ...profile,
  };
  await setOfflineUser(result);
  return result;
}

const auth = {
  me: currentUser,

  async isAuthenticated() {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  },

  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    fail(error);
    return data;
  },

  async loginWithProvider(provider, returnTo = '/') {
    sessionStorage.setItem('auth_return_to', returnTo || '/');
    if (isNative) throw new Error('En la app del teléfono ingresá con email y contraseña.');
    const redirectTo = `${authCallbackOrigin()}/auth/callback`;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    fail(error);
    return data;
  },

  async register({ email, password, full_name }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: full_name || email.split('@')[0] },
        emailRedirectTo: `${authCallbackOrigin()}/auth/callback`,
      },
    });
    fail(error);
    return data;
  },

  async verifyOtp({ email, otpCode }) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: otpCode,
      type: 'signup',
    });
    fail(error);
    return data.session || data;
  },

  async resendOtp(email) {
    const { data, error } = await supabase.auth.resend({ type: 'signup', email });
    fail(error);
    return data;
  },

  setToken() {
    // verifyOtp already persists the Supabase session.
  },

  async resetPasswordRequest(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${authCallbackOrigin()}/reset-password`,
    });
    fail(error);
    return data;
  },

  async resetPassword({ newPassword }) {
    const { data, error } = await supabase.auth.updateUser({ password: newPassword });
    fail(error);
    return data;
  },

  async logout(redirectTo = '/login') {
    await setOfflineUser(null);
    const { error } = await supabase.auth.signOut();
    fail(error);
    if (redirectTo !== false) window.location.assign('/login');
  },

  redirectToLogin(returnTo = window.location.pathname) {
    const target = returnTo && returnTo !== '/login'
      ? `/login?returnTo=${encodeURIComponent(returnTo)}`
      : '/login';
    window.location.assign(target);
  },
};

async function uploadFile({ file }) {
  const user = await currentUser();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const path = `${user.id}/${crypto.randomUUID()}-${safeName}`;
  await queueFile(path, file);
  const { data } = supabase.storage.from('documents').getPublicUrl(path);
  return { file_url: data.publicUrl, path };
}

export const backend = {
  entities,
  auth,
  functions: {
    async invoke(name, body = {}) {
      const functionName = functionNames[name] || name;
      const requestBody = agroSyncActions.has(name) ? { action: name, payload: body } : body;
      const { data, error } = await supabase.functions.invoke(functionName, { body: requestBody });
      fail(error);
      return { data };
    },
  },
  integrations: {
    Core: {
      UploadFile: uploadFile,
    },
  },
};
