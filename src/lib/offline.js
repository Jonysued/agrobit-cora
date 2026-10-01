// IndexedDB holds user-scoped snapshots and a durable, ordered outbox.
// Every write has a stable request ID; the server applies it exactly once.
let dbPromise, client, profile, running;
const listeners = new Set();
export const offlineState = { pending: 0, error: '', syncing: false, ready: false, cached: false };
const emit = () => { for (const callback of listeners) callback({ ...offlineState }); };
export const watchOffline = callback => { listeners.add(callback); callback({ ...offlineState }); return () => listeners.delete(callback); };
function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('lucient-offline-v1', 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('kv'); request.result.createObjectStore('outbox', { keyPath: 'requestId' }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento del teléfono.'));
  });
  return dbPromise;
}
async function store(name, mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, mode), request = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar en este dispositivo.'));
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar en este dispositivo.'));
  });
}
const get = key => store('kv', 'readonly', s => s.get(key));
const put = (key, value) => store('kv', 'readwrite', s => s.put(value, key));
const scope = () => { if (!profile) throw new Error('Abrí la app con conexión e iniciá sesión antes de trabajar offline.'); return `${profile.id}:${profile.role}`; };
const clean = value => Object.fromEntries(Object.entries(value || {}).filter(([key, v]) => v !== undefined && !key.startsWith('_offline')));
export const networkFailure = error => !navigator.onLine || /fetch|network|failed to send|load failed/i.test(error?.message || '');
export async function cachedUser() {
  const owner = localStorage.getItem('lucient-offline-owner');
  return owner ? get(`profile:${owner}`) : null;
}
export async function setOfflineUser(next) {
  profile = next;
  if (next) { localStorage.setItem('lucient-offline-owner', next.id); await put(`profile:${next.id}`, next); }
  else localStorage.removeItem('lucient-offline-owner');
  await refreshStatus();
}
export function configureOffline(supabase) { client = supabase; }
export async function pendingOperations() {
  const rows = await store('outbox', 'readonly', s => s.getAll());
  return rows.filter(row => row.owner === profile?.id).sort((a, b) => a.order - b.order || a.requestId.localeCompare(b.requestId));
}
async function refreshStatus() {
  const rows = await pendingOperations();
  offlineState.pending = rows.length; offlineState.error = rows.find(row => row.error)?.error || ''; emit();
}
export async function snapshot(key, load) {
  const identity = scope(), cacheKey = `${identity}:${key}`;
  if (navigator.onLine) {
    try { const value = await load(); if (scope() !== identity) throw new Error('La sesión cambió. Volvé a abrir esta sección.'); await put(cacheKey, value); offlineState.cached = false; emit(); return value; }
    catch (error) { if (!networkFailure(error)) throw error; }
  }
  const cached = await get(cacheKey);
  if (cached === undefined) throw Object.assign(new Error('Estos datos todavía no están descargados. Abrí esta sección con conexión primero.'), { code: 'OFFLINE_CACHE_MISS' });
  offlineState.cached = true; emit(); return cached;
}
export function matches(row, criteria = {}) {
  return Object.entries(criteria).every(([key, value]) => {
    const actual = row[key];
    if (Array.isArray(value)) return value.every(v => (actual || []).includes(v));
    if (value && typeof value === 'object') return Object.entries(value).every(([op, v]) => ({
      $gte: actual >= v, $lte: actual <= v, $gt: actual > v, $lt: actual < v, $neq: actual !== v, $in: Array.isArray(v) && v.includes(actual),
    })[op] === true);
    return actual === value || (value === null && actual == null);
  });
}
export function overlay(rows, operations, table) {
  const result = new Map(rows.map(row => [row.id, row]));
  for (const op of operations.filter(op => op.table === table && op.kind === 'entity')) {
    if (op.operation === 'delete') result.delete(op.id);
    else result.set(op.id, { ...(result.get(op.id) || {}), ...op.payload, id: op.id, _offline_pending: true });
  }
  return [...result.values()];
}
export async function entityRead(table, key, load, criteria = {}, sort = '', limit = 1000, offset = 0, paged = false) {
  const identity = scope();
  let rows, fresh = false;
  try { rows = await snapshot(`entity:${table}:${key}`, async () => { const data = await load(); fresh = true; return data; }); }
  catch (error) {
    if (error.code !== 'OFFLINE_CACHE_MISS' && !networkFailure(error) && navigator.onLine) throw error;
    rows = await get(`${scope()}:entity:${table}:all`);
    if (!rows) throw error;
  }
  if (scope() !== identity) throw new Error('La sesión cambió. Volvé a abrir esta sección.');
  if (!fresh) rows = await get(`${scope()}:entity:${table}:all`) || rows;
  const known = key === 'all' ? rows : [...new Map([...(await get(`${scope()}:entity:${table}:all`) || []), ...rows].map(row => [row.id, row])).values()];
  await put(`${scope()}:entity:${table}:all`, known);
  const operations = await pendingOperations();
  const pageOperations = fresh && paged && offset ? operations.filter(op => rows.some(row => row.id === op.id)) : operations;
  const visible = overlay(rows, pageOperations, table).filter(row => matches(row, criteria));
  if (sort) visible.sort((a, b) => { for (const field of sort.split(',')) { const desc = field.startsWith('-'), k = desc ? field.slice(1) : field; if (a[k] !== b[k]) return (a[k] > b[k] ? 1 : -1) * (desc ? -1 : 1); } return 0; });
  const start = fresh && paged ? 0 : offset;
  return limit ? visible.slice(start, start + limit) : visible.slice(start);
}
export async function saveOfflineOperation(op) {
  scope();
  let row;
  const enqueue = async () => {
    const existing = await pendingOperations();
    row = { ...op, requestId: op.requestId || crypto.randomUUID(), owner: profile.id, order: Math.max(Date.now(), (existing.at(-1)?.order || 0) + 1), error: '' };
    await store('outbox', 'readwrite', s => s.put(row));
  };
  if (navigator.locks) await navigator.locks.request('lucient-enqueue', enqueue); else await enqueue();
  await refreshStatus();
  window.dispatchEvent(new Event('lucient:data-mutated'));
  if (navigator.onLine) {
    try { await flushOffline(); } catch (error) {
      if (!networkFailure(error)) { await store('outbox', 'readwrite', s => s.put({ ...row, error: error.message })); await refreshStatus(); }
    }
  }
  const remaining = await store('outbox', 'readonly', s => s.get(row.requestId));
  if (remaining?.error) throw new Error(`El cambio quedó pendiente: ${remaining.error}`);
  return { ...row, pending: !!remaining };
}
export async function entityWrite(table, operation, id, payload = {}) {
  if (profile?.role !== 'admin') throw new Error('Solo un administrador puede editar estos registros.');
  const identity = scope();
  const rows = await get(`${identity}:entity:${table}:all`) || [];
  const before = overlay(rows, await pendingOperations(), table).find(row => row.id === id);
  if (operation !== 'create' && !navigator.onLine && !before) throw new Error('Descargá este registro con conexión antes de editarlo.');
  if (scope() !== identity) throw new Error('La sesión cambió. Volvé a intentar con tu usuario.');
  const data = clean(payload), recordId = id || crypto.randomUUID();
  const expected = before ? Object.fromEntries((operation === 'delete' ? Object.keys(clean(before)) : Object.keys(data)).filter(k => !['id','updated_date','created_date'].includes(k)).map(k => [k, before[k] ?? null])) : {};
  const saved = await saveOfflineOperation({ kind: 'entity', table, operation, id: recordId, payload: data, expected });
  if (!saved.pending) { const actual = (await get(`${scope()}:entity:${table}:all`) || []).find(row => row.id === recordId); if (actual) return actual; }
  return { ...before, ...data, id: recordId, created_date: before?.created_date || new Date().toISOString(), _offline_pending: saved.pending };
}
export async function offlineIrrigationAction(deviceId, active, requestId, occurred_at = new Date().toISOString(), qrToken) {
  const saved = await saveOfflineOperation({ kind: 'irrigation', id: deviceId, qrToken, active, requestId, occurred_at });
  return { id: requestId, device_id: deviceId, active, occurred_at, actor_id: profile.id, actor_name: profile.full_name || profile.email, _offline_pending: saved.pending, occurrence_source: 'device' };
}
export async function scannedIrrigationDevice(token, load) {
  let device;
  try { device = await snapshot(`scanned-device:${token}`, load); }
  catch (error) {
    if (error.code !== 'OFFLINE_CACHE_MISS') throw error;
    // An unseen QR can be recorded locally; its identity is validated on sync.
    device = { id: null, name: 'Equipo escaneado', kind: null, current_active: null, _offline_unverified: true };
  }
  if (!device) return null;
  const last = (await pendingOperations()).filter(op => op.kind === 'irrigation' && (op.qrToken === token || device.id && op.id === device.id)).at(-1);
  return last ? { ...device, current_active: last.active, _offline_pending: true } : device;
}
export async function irrigationDevices(load) {
  const devices = await snapshot('irrigation-devices', load);
  const pending = await pendingOperations();
  return devices.map(d => { const changes = pending.filter(op => op.kind === 'irrigation' && op.id === d.id); const last = changes.at(-1); return last ? { ...d, current_active: last.active, state_since: last.occurred_at, _offline_pending: true } : d; });
}
export async function queueFile(path, file) {
  if (profile?.role !== 'admin') throw new Error('Solo un administrador puede cargar archivos.');
  return saveOfflineOperation({ kind: 'file', path, file });
}
export async function flushOffline() {
  if (running) return running;
  const sync = async () => {
    if (!profile || !client || !navigator.onLine) return;
    offlineState.syncing = true; emit();
    try {
      const owner = profile.id;
      // Verify the actual server identity before replaying anything. Token
      // expiry and a different account never silently change the actor.
      const { data, error } = await client.auth.getUser();
      if (error || data.user?.id !== owner) return;
      for (const op of await pendingOperations()) {
        if (profile?.id !== owner || !navigator.onLine) break;
        if (op.error) break;
        let result;
        try {
        if (op.kind === 'entity') result = await client.rpc('apply_offline_change', { p_request_id: op.requestId, p_table: op.table, p_operation: op.operation, p_id: op.id, p_payload: op.payload, p_expected: op.expected });
        else if (op.kind === 'irrigation') {
          let deviceId = op.id;
          if (op.qrToken) {
            const scanned = await client.rpc('irrigation_scanned_device', { p_token: op.qrToken });
            if (scanned.error) throw scanned.error;
            const device = scanned.data?.[0];
            if (!device) throw new Error('El QR no corresponde a un equipo disponible. Revisá este cambio pendiente.');
            deviceId = device.id;
            if (profile?.id !== owner) break;
            await put(`${scope()}:scanned-device:${op.qrToken}`, device);
          }
          result = await client.rpc('record_irrigation_offline_action', { p_device_id: deviceId, p_active: op.active, p_request_id: op.requestId, p_occurred_at: op.occurred_at });
        }
        else if (op.kind === 'file') {
          result = await client.storage.from('documents').upload(op.path, op.file, { contentType: op.file.type || undefined, upsert: false });
          // Stable file path: an upload acknowledged late is not uploaded twice.
          if (result.error?.statusCode === '409' || result.error?.statusCode === '400' && /already exists|duplicate/i.test(result.error.message)) result = { error: null };
        }
        } catch (error) { result = { error }; }
        if (result?.error) {
          if (!networkFailure(result.error)) await store('outbox', 'readwrite', s => s.put({ ...op, error: result.error.message }));
          break; // Preserve dependencies and conflicts for review.
        }
        if (op.kind === 'entity' && profile?.id === owner) {
          const key = `${scope()}:entity:${op.table}:all`;
          const rows = (await get(key) || []).filter(row => row.id !== op.id);
          if (op.operation !== 'delete') rows.push(result.data);
          await put(key, rows);
        }
        if (op.kind === 'irrigation' && profile?.id === owner) {
          const ev = result.data;
          const update = d => d.id === ev?.device_id ? { ...d, current_active: ev.active, state_since: ev.occurred_at } : d;
          const key = `${scope()}:irrigation-devices`, devices = await get(key);
          if (devices) await put(key, devices.map(update));
          if (op.qrToken) {
            const key = `${scope()}:scanned-device:${op.qrToken}`, device = await get(key);
            if (device) await put(key, update(device));
          }
        }
        await store('outbox', 'readwrite', s => s.delete(op.requestId));
        window.dispatchEvent(new Event('lucient:data-mutated'));
        window.dispatchEvent(new Event('lucient:offline-synced'));
      }
    } finally { offlineState.syncing = false; await refreshStatus(); }
  };
  running = (navigator.locks ? navigator.locks.request('lucient-outbox', sync) : sync()).finally(() => { running = null; });
  return running;
}
export async function retryOffline() {
  for (const op of await pendingOperations()) await store('outbox', 'readwrite', s => s.put({ ...op, error: '' }));
  return flushOffline();
}
export function startOfflineRuntime() {
  const sync = () => { void flushOffline().catch(() => {}); };
  window.addEventListener('online', sync);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  setInterval(sync, 15000);
  if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').then(async registration => {
    await navigator.serviceWorker.ready; offlineState.ready = true; emit();
    setInterval(() => { if (navigator.onLine) void registration.update(); }, 3600000);
  }).catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
}

// Resolving a conflict is an explicit user decision, never an automatic overwrite.
export async function resolvePending(requestId, discard = false) {
  const op = (await pendingOperations()).find(row => row.requestId === requestId);
  if (!op) return;
  if (discard) await store('outbox', 'readwrite', s => s.delete(requestId));
  else {
    if (!navigator.onLine || op.kind !== 'entity' || op.operation === 'create') throw new Error('Este cambio necesita revisarse con conexión.');
    const { data, error } = await client.from(op.table).select('*').eq('id', op.id).single();
    if (error) throw new Error(error.message);
    const expected = Object.fromEntries(Object.keys(op.expected).map(key => [key, data[key] ?? null]));
    await store('outbox', 'readwrite', s => s.put({ ...op, expected, error: '' }));
  }
  await refreshStatus(); window.dispatchEvent(new Event('lucient:data-mutated'));
  return flushOffline();
}
