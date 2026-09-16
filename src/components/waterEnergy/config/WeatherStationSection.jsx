import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, PlugZap, Plus, Trash2 } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';

const PROVIDERS = [
  ['davis', 'Davis'], ['wiseconn', 'WiseConn'], ['pessl', 'Pessl'],
  ['campbell', 'Campbell Scientific'], ['metos', 'Metos / FieldClimate'],
  ['generic_api', 'API genérica'], ['webhook', 'Webhook'], ['manual', 'Manual / carga propia'],
];
const CONNECTION_TYPES = [['api', 'API'], ['webhook', 'Webhook'], ['manual', 'Manual']];
const fmtDateTime = ts => ts ? new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
const STATUS_BADGES = {
  connected: '🟢 Conectada',
  error: '🔴 Error de conexión',
  not_implemented: '🟡 Adapter pendiente',
  missing_credentials: '🟡 Falta credencial',
  misconfigured: '🟡 Config. incompleta',
};

// Estaciones meteorológicas propias. Las credenciales de API se guardan
// como secrets del backend — acá solo se registra la configuración no sensible.
export default function WeatherStationSection({ farms, stations, onChange }) {
  const linkedFarms = s => s.farm_ids || (s.farm_id ? [s.farm_id] : []);
  const [form, setForm] = useState(() => ({
    farm_id: (farms || [])[0]?.id || '',
    name: '', provider: 'davis', connection_type: 'api',
    external_station_id: '', elevation_m: '', notes: '', active: true,
  }));
  const [busy, setBusy] = useState(false);
  const [tests, setTests] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    const farm = (farms || []).find(f => f.id === form.farm_id);
    await base44.entities.WeatherStation.create({
      farm_id: form.farm_id,
      farm_ids: [form.farm_id],
      name: form.name,
      provider: form.provider,
      connection_type: form.connection_type,
      external_station_id: form.external_station_id || null,
      elevation_m: form.elevation_m === '' ? null : Number(form.elevation_m),
      notes: form.notes || null,
      active: form.active,
      latitude: farm?.latitude ?? null,
      longitude: farm?.longitude ?? null,
    });
    setForm(f => ({ ...f, name: '', external_station_id: '', elevation_m: '', notes: '' }));
    setBusy(false);
    onChange();
  };

  const test = async station => {
    setTests(t => ({ ...t, [station.id]: { loading: true } }));
    try {
      const res = await base44.functions.invoke('testWeatherStation', { station_id: station.id });
      setTests(t => ({ ...t, [station.id]: { loading: false, result: res.data } }));
      onChange();
    } catch (err) {
      setTests(t => ({ ...t, [station.id]: { loading: false, result: { ok: false, message: 'No se pudo ejecutar la prueba de conexión.' } } }));
    }
  };

  const remove = async station => { await base44.entities.WeatherStation.delete(station.id); onChange(); };

  // Vincular / desvincular la estación a una o más fincas (siempre al menos una)
  const toggleFarm = async (station, farmId) => {
    const linked = linkedFarms(station);
    if (linked.includes(farmId) && linked.length === 1) return;
    const farm_ids = linked.includes(farmId) ? linked.filter(id => id !== farmId) : [...linked, farmId];
    await base44.entities.WeatherStation.update(station.id, { farm_ids, farm_id: farm_ids[0] });
    onChange();
  };

  return (
    <ConfigPanel title="Estaciones meteorológicas" description="Conectá tu estación propia (Davis, WiseConn, Pessl, Campbell, Metos, API genérica o webhook) y elegí a qué finca vincularla. Las credenciales de API se guardan como secrets del backend y nunca se exponen en el frontend.">
      <form onSubmit={save} className="grid gap-3 md:grid-cols-3">
        <Field label="Finca">
          <select value={form.farm_id} onChange={e => set('farm_id', e.target.value)} required className={inputCls}>
            {(farms || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </Field>
        <Field label="Nombre de la estación">
          <input value={form.name} onChange={e => set('name', e.target.value)} required placeholder="Ej. Estación Retamito" className={inputCls} />
        </Field>
        <Field label="Proveedor">
          <select value={form.provider} onChange={e => set('provider', e.target.value)} className={inputCls}>
            {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Tipo de conexión">
          <select value={form.connection_type} onChange={e => set('connection_type', e.target.value)} className={inputCls}>
            {CONNECTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="ID / endpoint externo">
          <input value={form.external_station_id} onChange={e => set('external_station_id', e.target.value)} placeholder="ID en el proveedor o URL (API genérica)" className={inputCls} />
        </Field>
        <Field label="Elevación (m)">
          <input type="number" value={form.elevation_m} onChange={e => set('elevation_m', e.target.value)} className={inputCls} />
        </Field>
        <Field label="Notas">
          <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones…" className={inputCls} />
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" /> Activa
          </label>
        </div>
        <div className="flex items-end">
          <button disabled={busy || !form.farm_id || !form.name} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">
            <Plus size={15} /> {busy ? 'Guardando…' : 'Agregar estación'}
          </button>
        </div>
      </form>
      {!(stations || []).length ? (
        <p className="mt-4 text-sm text-slate-400">Todavía no hay estaciones registradas.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {(stations || []).map(s => {
            const t = tests[s.id];
            const result = t?.result;
            return (
              <div key={s.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <b className="text-slate-800">{s.name}</b>
                    <span className="text-slate-400"> · {PROVIDERS.find(p => p[0] === s.provider)?.[1] || s.provider} · {CONNECTION_TYPES.find(c => c[0] === s.connection_type)?.[1]}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Fincas vinculadas:</span>
                    {(farms || []).map(f => {
                      const linked = linkedFarms(s).includes(f.id);
                      return (
                        <button key={f.id} type="button" onClick={() => toggleFarm(s, f.id)} className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${linked ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                          {linked ? '✓ ' : '+ '}{f.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => test(s)} disabled={t?.loading} className="flex items-center gap-1.5 rounded-lg border border-emerald-700 px-2.5 py-1.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-60">
                      {t?.loading ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />} Probar conexión
                    </button>
                    <button onClick={() => remove(s)} className="rounded-lg border border-slate-300 p-1.5 text-slate-400 transition hover:border-red-300 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>{s.connection_status ? (STATUS_BADGES[s.connection_status] || `🟡 ${s.connection_status}`) : '🟡 Sin verificar'}</span>
                  <span>Último dato: <b className="text-slate-700">{fmtDateTime(s.last_data_at)}</b></span>
                  {s.active === false && <span className="font-semibold text-amber-600">Inactiva</span>}
                </div>
                {result && (
                  <p className={`mt-2 rounded-lg border p-2 text-xs font-semibold ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
                    {result.ok
                      ? <>🟢 Conectada{result.last_data_at && <> · Último dato recibido: {fmtDateTime(result.last_data_at)}</>}</>
                      : <>🔴 Error de conexión · {result.message}</>}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </ConfigPanel>
  );
}