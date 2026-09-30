export const stateLabel = (device, active = device?.current_active) => active == null ? 'Sin registro'
  : device.kind === 'well' ? (active ? 'Encendido' : 'Apagado') : (active ? 'Abierta' : 'Cerrada');
export function deviceStatus(device, devices) {
  if (device.current_active == null) return { color: '#64748b', label: 'Sin registro', effective: false };
  if (!device.current_active) return { color: '#dc2626', label: stateLabel(device), effective: false };
  if (device.kind === 'well') return { color: '#16a34a', label: 'Encendido', effective: true };
  const well = devices.find(d => d.id === device.parent_well_id);
  if (well?.current_active === true) return { color: '#16a34a', label: 'Abierta · regando', effective: true };
  return { color: '#f97316', label: well?.current_active === false ? 'Abierta · pozo apagado' : 'Abierta · pozo sin registro', effective: false };
}
export function duration(seconds) {
  if (seconds == null) return '—';
  const s = Math.max(0, Math.floor(Number(seconds)));
  return `${Math.floor(s / 3600)} h ${String(Math.floor(s / 60) % 60).padStart(2, '0')} min ${String(s % 60).padStart(2, '0')} s`;
}
export const dateTime = value => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
export const qrUrl = (token, origin = 'https://lucient-v1.vercel.app') => `${origin}/riego?tab=monitoreo&equipo=${encodeURIComponent(token)}`;
export function parseQr(value) {
  try {
    const url = new URL(value);
    // QR links are data, never navigation instructions from arbitrary websites.
    if (url.pathname !== '/riego' || url.searchParams.get('tab') !== 'monitoreo') return null;
    const token = url.searchParams.get('equipo');
    return /^[0-9a-f-]{36}$/i.test(token || '') ? token : null;
  } catch { return /^[0-9a-f-]{36}$/i.test(value.trim()) ? value.trim() : null; }
}
export function liveSessionSeconds(session, device, devices, now = Date.now()) {
  const elapsed = session.ended_at ? 0 : Math.max(0, (now - (session.client_received_at ?? Date.parse(session.calculated_at))) / 1000);
  return {
    duration: Number(session.duration_seconds) + elapsed,
    effective: Number(session.effective_seconds) + (deviceStatus(device, devices).effective ? elapsed : 0),
  };
}
