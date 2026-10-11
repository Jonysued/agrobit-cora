import { isOnline } from '@/lib/connectivity';
import { snapshot, irrigationDevices, pendingOperations, offlineIrrigationAction, networkFailure, scannedIrrigationDevice } from '@/lib/offline';
import { supabase } from '@/api/backendClient';
import { observedIrrigation } from './actualIrrigation';

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
let ledgerCache = null, ledgerPending = null, ledgerGeneration = 0;
if (typeof window !== 'undefined') window.addEventListener('lucient:data-mutated', () => {
  ledgerGeneration++; ledgerCache = null; ledgerPending = null;
});
supabase.auth.onAuthStateChange(() => { ledgerGeneration++; ledgerCache = null; ledgerPending = null; });
export const monitoringService = {
  async observed(lots, designs, from = -Infinity) {
    if (!ledgerCache || Date.now() - ledgerCache.received > 60000) {
      if (!ledgerPending) {
        const generation = ledgerGeneration;
        ledgerPending = Promise.all([this.devices(), snapshot('irrigation-water-history', async () => {
      const events = [];
      // Page the entire ledger, including starts before the balance window.
      for (let offset = 0; ; offset += 1000) {
        const rows = unwrap(await supabase.from('irrigation_device_events').select('*')
          .order('sequence').range(offset, offset + 999)) || [];
        events.push(...rows);
        if (rows.length < 1000) break;
      }
      return { events, asOf: Date.now() };
    })]).then(([devices, history]) => {
          const value = { devices, history, received: Date.now() };
          if (generation === ledgerGeneration) ledgerCache = value;
          return value;
        }).finally(() => { if (generation === ledgerGeneration) ledgerPending = null; });
      }
      const value = await ledgerPending;
      return observedIrrigation(value.devices, value.history.events, lots, designs, value.history.asOf, from);
    }
    const { devices, history } = ledgerCache;
    // Offline we freeze at the last fetched instant: a disconnected phone
    // cannot know whether another operator has since stopped the equipment.
    return observedIrrigation(devices, history.events, lots, designs, history.asOf, from);
  },
  async scannedDevice(token) {
    return scannedIrrigationDevice(token, async () => {
      const devices = unwrap(await supabase.rpc('irrigation_scanned_device', { p_token: token }));
      return devices?.[0] || null;
    });
  },
  async scannedAction(token, active, requestId) {
    return offlineIrrigationAction(null, active, requestId, new Date().toISOString(), token);
  },
  async devices() {
    return irrigationDevices(async () => unwrap(await supabase.from('irrigation_devices').select('*').order('farm').order('kind').order('name')) || []);
  },
  async saveDevice(form) {
    if (!isOnline()) throw new Error('La configuración de equipos requiere conexión. Los cambios de estado sí se pueden registrar offline.');
    const payload = {
      name: form.name.trim(), farm: form.farm.trim(), kind: form.kind,
      parent_well_id: form.kind === 'valve' ? form.parent_well_id : null,
      pump_id: form.pump_id || null, lot_ids: form.kind === 'valve' ? form.lot_ids : [],
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude), notes: form.notes || '',
      portion: form.kind === 'valve' ? form.portion || '' : '', turno: form.turno || null,
      location_origin: form.location_origin || 'manual',
    };
    if (form.id) {
      delete payload.kind; delete payload.pump_id;
      const saved = unwrap(await supabase.from('irrigation_devices').update(payload).eq('id', form.id).select().single());
      window.dispatchEvent(new Event('lucient:data-mutated')); return saved;
    }
    const saved = unwrap(await supabase.from('irrigation_devices').insert(payload).select().single());
    window.dispatchEvent(new Event('lucient:data-mutated')); return saved;
  },
  async action(deviceId, active, requestId) {
    const occurredAt = new Date().toISOString();
    if (!isOnline() || (await pendingOperations()).length) return offlineIrrigationAction(deviceId, active, requestId, occurredAt);
    const result = await supabase.rpc('record_irrigation_action', { p_device_id: deviceId, p_active: active, p_request_id: requestId });
    if (result.error && networkFailure(result.error)) return offlineIrrigationAction(deviceId, active, requestId, occurredAt);
    const event = unwrap(result);
    window.dispatchEvent(new Event('lucient:data-mutated'));
    return event;
  },
  async history(deviceId, from, offset = 0) {
    const query = supabase.from('irrigation_device_events').select('*').eq('device_id', deviceId)
      .gte('occurred_at', from).order('occurred_at', { ascending: false }).order('sequence', { ascending: false }).range(offset, offset + 49);
    const days = Math.round((Date.now() - Date.parse(from)) / 86400000);
    const events = await snapshot(`irrigation-events:${deviceId}:${days}:${offset}`, async () => unwrap(await query) || []);
    const pending = offset ? [] : (await pendingOperations()).filter(op => op.kind === 'irrigation' && op.id === deviceId && op.occurred_at >= from).map(op => ({ id: op.requestId, active: op.active, occurred_at: op.occurred_at, actor_name: 'Este dispositivo · pendiente', _offline_pending: true }));
    return [...pending.reverse(), ...events];
  },
  async sessions(deviceId, from, offset = 0) {
    const days = Math.round((Date.now() - Date.parse(from)) / 86400000);
    let fresh = false;
    const sessions = await snapshot(`irrigation-sessions:${deviceId}:${days}:${offset}`, async () => {
      const rows = unwrap(await supabase.rpc('irrigation_device_sessions', { p_device_id: deviceId, p_from: from, p_offset: offset, p_limit: 50 })) || [];
      fresh = true; return rows;
    });
    const stale = !fresh || (await pendingOperations()).some(op => op.kind === 'irrigation');
    const receivedAt = Date.now();
    return sessions.map(s => ({ ...s, client_received_at: receivedAt, _offline_cached: stale }));
  },
  async correct(eventId, active, occurredAt, reason) {
    if (!isOnline()) throw new Error('La corrección del historial requiere conexión.');
    const event = unwrap(await supabase.rpc('correct_irrigation_action', {
      p_event_id: eventId, p_active: active, p_occurred_at: occurredAt, p_reason: reason,
    }));
    window.dispatchEvent(new Event('lucient:data-mutated'));
    return event;
  },
  subscribe(onChange) {
    const channel = supabase.channel(`irrigation-monitor-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_devices' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_device_events' }, () => { window.dispatchEvent(new Event('lucient:data-mutated')); onChange(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
