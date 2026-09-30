import { supabase } from '@/api/backendClient';

const unwrap = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};
export const monitoringService = {
  async devices() {
    return unwrap(await supabase.from('irrigation_devices').select('*').order('farm').order('kind').order('name')) || [];
  },
  async saveDevice(form) {
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
      return unwrap(await supabase.from('irrigation_devices').update(payload).eq('id', form.id).select().single());
    }
    return unwrap(await supabase.from('irrigation_devices').insert(payload).select().single());
  },
  async action(deviceId, active, requestId) {
    return unwrap(await supabase.rpc('record_irrigation_action', {
      p_device_id: deviceId, p_active: active, p_request_id: requestId,
    }));
  },
  async history(deviceId, from, offset = 0) {
    const query = supabase.from('irrigation_device_events').select('*').eq('device_id', deviceId)
      .gte('occurred_at', from).order('occurred_at', { ascending: false }).order('sequence', { ascending: false }).range(offset, offset + 49);
    return unwrap(await query) || [];
  },
  async sessions(deviceId, from, offset = 0) {
    const sessions = unwrap(await supabase.rpc('irrigation_device_sessions', {
      p_device_id: deviceId, p_from: from, p_offset: offset, p_limit: 50,
    })) || [];
    const receivedAt = Date.now();
    return sessions.map(s => ({ ...s, client_received_at: receivedAt }));
  },
  async correct(eventId, active, occurredAt, reason) {
    return unwrap(await supabase.rpc('correct_irrigation_action', {
      p_event_id: eventId, p_active: active, p_occurred_at: occurredAt, p_reason: reason,
    }));
  },
  subscribe(onChange) {
    const channel = supabase.channel(`irrigation-monitor-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_devices' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'irrigation_device_events' }, onChange).subscribe();
    return () => { supabase.removeChannel(channel); };
  },
};
