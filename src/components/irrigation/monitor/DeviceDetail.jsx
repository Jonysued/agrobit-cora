import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { dateTime, duration, deviceStatus, stateLabel, liveSessionSeconds } from '@/services/irrigation/monitoringUtils';
import { QrCard, downloadDeviceQrs } from './QrTools';
const input = 'w-full rounded-lg border px-3 py-2 text-sm';
const localInput = value => {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};
export default function DeviceDetail({ device, devices, lots, admin, onEdit }) {
  const client = useQueryClient();
  const [days, setDays] = useState(30), [page, setPage] = useState(0), [now, setNow] = useState(Date.now());
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [qr, setQr] = useState(false), [correction, setCorrection] = useState(null);
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const detail = useQuery({ queryKey: ['irrigation-monitor', 'detail', device.id, days, page], queryFn: async () => {
    const [events, sessions] = await Promise.all([monitoringService.history(device.id, from, page * 50), monitoringService.sessions(device.id, from, page * 50)]);
    return { events, sessions };
  }, refetchInterval: 15000 });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const status = deviceStatus(device, devices), well = devices.find(d => d.id === device.parent_well_id);
  const changed = () => client.invalidateQueries({ queryKey: ['irrigation-monitor'] });
  const act = async () => {
    if (!confirm) return;
    setBusy(true); setError('');
    try {
      const event = await monitoringService.action(device.id, confirm.active, confirm.requestId);
      setConfirm(null); setNotice(`${stateLabel(device, event.active)} registrado a las ${dateTime(event.occurred_at)}.`);
      await changed();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const correct = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await monitoringService.correct(correction.id, correction.active, new Date(correction.date).toISOString(), correction.reason);
      setCorrection(null); setNotice('Corrección guardada. Se conserva el registro anterior y el motivo.'); await changed();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const pdf = async () => { setBusy(true); setError(''); try { await downloadDeviceQrs([device]); } catch { setError('No se pudo descargar el QR.'); } finally { setBusy(false); } };
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label={`Ficha de ${device.name}`}>
    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{device.kind === 'well' ? 'Pozo' : 'Válvula'} · {device.farm}</p>
    <h2 className="mt-1 text-2xl font-bold">{device.name}</h2>
    <p className="mt-3 flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />{status.label}</p>
    <p className="mt-1 text-xs text-slate-500">Último cambio: {dateTime(device.state_since)}</p>
    {device.kind === 'valve' && <div className="mt-3 text-sm text-slate-600"><p>Pozo: <b>{well?.name || 'Sin vínculo'} · {well?.farm}</b></p><p>Lotes: <b>{device.lot_ids.map(id => lots.find(l => l.id === id)?.name || id).join(', ')}</b></p></div>}
    {device.notes && <p className="mt-2 text-sm text-slate-500">{device.notes}</p>}
    <div className="mt-4 grid grid-cols-2 gap-2">{[true, false].map(active => <button key={String(active)} disabled={busy || device.current_active === active || !navigator.onLine} onClick={() => { setError(''); setConfirm({ active, requestId: crypto.randomUUID() }); }} className={`rounded-xl px-3 py-3 text-sm font-bold text-white disabled:opacity-35 ${active ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>{stateLabel(device, active)}</button>)}</div>
    <p className="mt-2 text-xs text-slate-500">Confirmá el cambio cuando ocurra en campo. Se guarda la hora del servidor.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => setQr(true)} className="rounded-lg border px-3 py-2 text-xs font-bold">Ver QR</button><button disabled={busy} onClick={pdf} className="rounded-lg border px-3 py-2 text-xs font-bold">Descargar QR</button>{admin && <button onClick={() => onEdit(device)} className="rounded-lg border px-3 py-2 text-xs font-bold">Editar / ubicar</button>}</div>
    {notice && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {error && !confirm && !correction && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex items-center justify-between gap-2 border-t pt-4"><h3 className="font-bold">Historial</h3><select aria-label="Ventana de historial" value={days} onChange={e => { setDays(Number(e.target.value)); setPage(0); }} className="rounded-lg border px-2 py-1 text-xs">{[7, 30, 60, 90, 365].map(n => <option key={n} value={n}>{n} días</option>)}</select></div>
    {detail.isLoading && <p className="py-4 text-sm text-slate-500">Cargando historial…</p>}
    {detail.error && <p role="alert" className="mt-3 text-sm text-red-700">No se pudo actualizar el historial: {detail.error.message}</p>}
    <h4 className="mt-4 text-sm font-semibold">{device.kind === 'well' ? 'Sesiones de funcionamiento' : 'Sesiones de riego'}</h4>
    <p className="mt-1 text-xs text-slate-500">Se incluyen las sesiones que atraviesan la ventana elegida, con su duración completa.</p>
    <div className="mt-2 space-y-2">{detail.data?.sessions.map(s => {
      const times = liveSessionSeconds(s, device, devices, now);
      return <div key={s.event_id} className="rounded-xl bg-slate-50 p-3 text-xs"><b>{dateTime(s.started_at)}</b><p className="mt-1 text-slate-500">Hasta: {s.ended_at ? dateTime(s.ended_at) : 'En curso'}</p><p className="mt-2">{device.kind === 'well' ? 'Funcionamiento' : 'Tiempo abierta'}: <b>{duration(times.duration)}</b></p>{device.kind === 'valve' && <p className="font-medium text-emerald-800">Riego efectivo: <b>{duration(times.effective)}</b></p>}</div>;
    })}{detail.data && !detail.data.sessions.length && <p className="py-2 text-sm text-slate-500">Sin sesiones en esta ventana.</p>}</div>
    <h4 className="mt-5 text-sm font-semibold">Registro de acciones</h4>
    <div className="mt-2 space-y-2">{detail.data?.events.map(e => <div key={e.id} className="rounded-xl border p-3 text-xs"><b>{stateLabel(device, e.active)}</b><p>{dateTime(e.occurred_at)} · {e.actor_name}</p>{e.corrections?.length > 0 && <details className="mt-2 text-amber-800"><summary>Registro corregido · ver auditoría</summary>{e.corrections.map((c, i) => <p className="mt-1" key={i}>{c.corrected_by_name} · {dateTime(c.corrected_at)}: {c.reason}. Anterior: {stateLabel(device, c.previous_active)} · {dateTime(c.previous_occurred_at)}.</p>)}</details>}{admin && <button onClick={() => { setError(''); setCorrection({ id: e.id, active: e.active, date: localInput(e.occurred_at), reason: '' }); }} className="mt-2 underline">Corregir registro</button>}</div>)}{detail.data && !detail.data.events.length && <p className="py-2 text-sm text-slate-500">Sin acciones en esta ventana.</p>}</div>
    <div className="mt-3 flex items-center justify-between text-xs"><button disabled={!page} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">Anterior</button><span>Página {page + 1}</span><button disabled={detail.data?.events.length < 50 && detail.data?.sessions.length < 50} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-30">Más registros</button></div>
    <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><DialogContent><DialogHeader><DialogTitle>Confirmar {confirm && stateLabel(device, confirm.active)}</DialogTitle></DialogHeader><p className="text-sm">{device.name} · {device.farm}. Registrá esta acción solo si acaba de ocurrir.</p>{device.kind === 'well' && confirm?.active === false && devices.some(d => d.parent_well_id === device.id && d.current_active) && <p className="text-sm text-orange-700">Hay válvulas abiertas. Al apagar el pozo dejan de acumular tiempo de riego efectivo.</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy || !navigator.onLine} onClick={act} className="rounded-xl bg-emerald-900 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Registrando…' : 'Confirmar acción ahora'}</button></DialogContent></Dialog>
    <Dialog open={qr} onOpenChange={setQr}><DialogContent><DialogHeader><DialogTitle>QR · {device.name}</DialogTitle></DialogHeader><QrCard device={device} /></DialogContent></Dialog>
    <Dialog open={!!correction} onOpenChange={open => { if (!open && !busy) setCorrection(null); }}><DialogContent><DialogHeader><DialogTitle>Corregir registro</DialogTitle></DialogHeader>{correction && <form onSubmit={correct} className="space-y-3"><p className="text-xs text-slate-500">Se conserva el valor anterior, usuario y motivo. La fecha se ingresa en la zona horaria de este dispositivo.</p><select aria-label="Estado corregido" className={input} value={String(correction.active)} onChange={e => setCorrection(c => ({ ...c, active: e.target.value === 'true' }))}>{[true, false].map(v => <option key={String(v)} value={String(v)}>{stateLabel(device, v)}</option>)}</select><input aria-label="Fecha y hora corregidas" required type="datetime-local" step="1" className={input} value={correction.date} onChange={e => setCorrection(c => ({ ...c, date: e.target.value }))} /><input aria-label="Motivo de corrección" required minLength={5} className={input} placeholder="Motivo de la corrección" value={correction.reason} onChange={e => setCorrection(c => ({ ...c, reason: e.target.value }))} />{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-emerald-900 py-3 font-bold text-white">{busy ? 'Guardando…' : 'Guardar corrección'}</button></form>}</DialogContent></Dialog>
  </section>;
}
