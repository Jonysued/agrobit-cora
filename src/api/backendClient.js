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

function applyOrder(query, sort = '-created_date') {
  if (!sort) return query;
  const descending = sort.startsWith('-');
  const column = descending ? sort.slice(1) : sort;
  return query.order(column, { ascending: !descending });
}

function entityApi(entityName) {
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

    async filter(criteria = {}, sort = '-created_date', limit = 1000) {
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
      if (limit) query = query.limit(limit);
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
      return data;
    },

    async bulkCreate(payloads) {
      if (!payloads?.length) return [];
      const { data, error } = await supabase
        .from(table)
        .insert(payloads.map(withoutUndefined))
        .select('*');
      fail(error);
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
      return data;
    },

    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      fail(error);
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

const entities = new Proxy({}, {
  get(cache, entityName) {
    if (typeof entityName !== 'string') return undefined;
    if (!cache[entityName]) cache[entityName] = entityApi(entityName);
    return cache[entityName];
  },
});

async function currentUser() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  fail(authError);
  if (!authData.user) throw Object.assign(new Error('Authentication required'), { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authData.user.id)
    .maybeSingle();
  fail(profileError);
  return {
    id: authData.user.id,
    email: authData.user.email,
    full_name: profile?.full_name || authData.user.user_metadata?.full_name || authData.user.email,
    role: profile?.role || 'user',
    ...profile,
  };
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
    const redirectTo = `${window.location.origin}/auth/callback`;
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
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      redirectTo: `${window.location.origin}/reset-password`,
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
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id || 'anonymous';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('documents').upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  fail(error);
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
