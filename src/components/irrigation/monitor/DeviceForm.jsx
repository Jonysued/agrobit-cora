import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import DeviceMap from './DeviceMap';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { PORTION_LABELS } from '@/lib/irrigationTurnos';
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100';
export default function DeviceForm({ device, devices, lots, pumps, onSaved, onCancel }) {
  const [form, setForm] = useState(device ? { ...device, latitude: device.latitude ?? '', longitude: device.longitude ?? '' }
    : { kind: 'valve', name: '', farm: lots[0]?.farm || '', parent_well_id: '', lot_ids: [], latitude: '', longitude: '', notes: '', pump_id: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const pick = ({ lat, lng }) => setForm(f => ({ ...f, latitude: lat.toFixed(7), longitude: lng.toFixed(7) }));
  const gps = () => {
    if (!navigator.geolocation) { setError('El navegador no ofrece ubicación. Marcá el punto en el mapa.'); return; }
    navigator.geolocation.getCurrentPosition(p => { pick({ lat: p.coords.latitude, lng: p.coords.longitude }); setError(''); }, () => setError('No se pudo obtener la ubicación. Revisá el permiso o marcá el punto en el mapa.'), { enableHighAccuracy: true, timeout: 15000 });
  };
  const save = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try { await monitoringService.saveDevice(form); await onSaved(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const farms = [...new Set([...lots.map(l => l.farm), ...devices.map(d => d.farm)].filter(Boolean))];
  const locked = !!device?.has_events;
  const linkedLots = lots.filter(l => l.farm === form.farm);
  return <form onSubmit={save} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      {form.kind === 'valve' && <label className="text-sm font-semibold">Sector del lote<select disabled={locked} className={input} value={form.portion || ''} onChange={e => set('portion', e.target.value)}>{Object.entries(PORTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
      <label className="text-sm font-semibold">Tipo<select disabled={!!device} className={input} value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value, lot_ids: [], parent_well_id: '', pump_id: '' }))}><option value="valve">Válvula</option><option value="well">Pozo</option></select></label>
      <label className="text-sm font-semibold">Nombre / código<input required maxLength={120} className={input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ej. Válvula C1 norte" /></label>
      <label className="text-sm font-semibold">Finca<select required disabled={locked} className={input} value={form.farm} onChange={e => setForm(f => ({ ...f, farm: e.target.value, lot_ids: [] }))}><option value="">Seleccionar</option>{farms.map(f => <option key={f}>{f}</option>)}</select></label>
      {form.kind === 'valve' ? <label className="text-sm font-semibold">Pozo que la abastece<select required disabled={locked} className={input} value={form.parent_well_id} onChange={e => set('parent_well_id', e.target.value)}><option value="">Seleccionar pozo</option>{devices.filter(d => d.kind === 'well').map(d => <option key={d.id} value={d.id}>{d.name} · {d.farm}</option>)}</select></label>
        : !device && <label className="text-sm font-semibold">Pozo de configuración (opcional)<select className={input} value={form.pump_id} onChange={e => {
          const pump = pumps.find(p => p.id === e.target.value);
          setForm(f => ({ ...f, pump_id: pump?.id || '', name: pump?.name || f.name, farm: pump?.farm || f.farm }));
        }}><option value="">Equipo independiente</option>{pumps.filter(p => !devices.some(d => d.pump_id === p.id)).map(p => <option value={p.id} key={p.id}>{p.name} · {p.farm}</option>)}</select></label>}
    </div>
    {form.kind === 'valve' && <fieldset><legend className="mb-2 text-sm font-semibold">Lotes abastecidos</legend><div className="grid max-h-36 grid-cols-2 gap-2 overflow-auto rounded-xl border p-3">{linkedLots.map(l => <label key={l.id} className="flex items-center gap-2 text-sm"><input disabled={locked} type="checkbox" checked={form.lot_ids.includes(l.id)} onChange={e => set('lot_ids', e.target.checked ? [...form.lot_ids, l.id] : form.lot_ids.filter(id => id !== l.id))} />{l.name}</label>)}</div>{!form.lot_ids.length && <p className="mt-1 text-xs text-amber-700">Seleccioná al menos un lote.</p>}</fieldset>}
    {locked && <p className="text-xs text-slate-500">Los vínculos se conservan porque este equipo ya tiene historial.</p>}
    <div className="flex items-center justify-between gap-2"><b className="text-sm">Ubicación del equipo</b><button type="button" onClick={gps} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold"><MapPin size={14} />Usar mi ubicación</button></div>
    <DeviceMap devices={[]} lots={linkedLots} onPick={pick} draft={form.latitude !== '' && form.longitude !== '' ? { lat: Number(form.latitude), lng: Number(form.longitude) } : null} />
    <div className="grid grid-cols-2 gap-3"><label className="text-xs">Latitud<input className={input} type="number" step="any" min="-90" max="90" value={form.latitude} onChange={e => set('latitude', e.target.value)} /></label><label className="text-xs">Longitud<input className={input} type="number" step="any" min="-180" max="180" value={form.longitude} onChange={e => set('longitude', e.target.value)} /></label></div>
    <label className="block text-sm">Notas<input className={input} value={form.notes} onChange={e => set('notes', e.target.value)} /></label>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={busy || (form.kind === 'valve' && !form.lot_ids.length)} className="rounded-lg bg-emerald-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar equipo'}</button></div>
  </form>;
}
