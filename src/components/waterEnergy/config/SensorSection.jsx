import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { sensorService } from '@/services/waterEnergy';

// Registro de sondas y su vínculo con la API del proveedor.
// El lote de cada sonda se asigna en "Vinculación de perfiles".
const PROVIDERS = [['wiseconn', 'WiseConn'], ['irrimax', 'IrriMAX'], ['cropx', 'CropX'], ['demo', 'Demo / Manual']];
const EMPTY_PROBE = { name: '', provider: '', external_device_id: '', active: true };
const rel = ts => { if (!ts) return '—'; const h = Math.round((Date.now() - new Date(ts).getTime()) / 3600000); return h < 1 ? 'hace instantes' : h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`; };
const lotName = (lots, id) => lots.find(l => l.id === id)?.name || 'Sin vincular';

export default function SensorSection({ lots, probes, onChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async e => {
    e.preventDefault(); setBusy(true);
    if (form.id) await sensorService.updateProbe(form.id, form);
    else await sensorService.createProbe(form);
    setBusy(false); setForm(null); onChange();
  };

  return (
    <ConfigPanel title="Sensores" description={`Registro de sondas y su conexión con la API del proveedor · ${probes.length} sonda(s)`}>
      {!form && <button onClick={() => setForm({ ...EMPTY_PROBE })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nueva sonda</button>}

      {form && (
        <form onSubmit={save} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar sonda' : 'Nueva sonda'}</b>
            <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Sonda A" /></Field>
            <Field label="Proveedor · API">
              <select value={form.provider || ''} onChange={e => set('provider', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="ID del dispositivo (API)"><input value={form.external_device_id ?? ''} onChange={e => set('external_device_id', e.target.value)} className={inputCls} placeholder="ID en la API del proveedor" /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" />Activa</label>
          <p className="mt-2 text-[11px] text-slate-400">Las credenciales de la API del proveedor se configuran de forma segura en el backend (Secrets). El lote de cada sonda se vincula en "Vinculación de perfiles" — al vincularla, la sonda aparece en el módulo Sensores y alimenta los pronósticos.</p>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar sonda'}</button>
        </form>
      )}

      {probes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Sonda</th><th className="pr-3">Lote</th><th className="pr-3">Proveedor</th><th className="pr-3">ID externo</th><th className="pr-3">Última lectura</th><th className="pr-3">Estado</th><th /></tr></thead>
            <tbody>
              {probes.map(s => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{s.name}</b></td>
                  <td className="pr-3 text-slate-600">{lotName(lots, s.lot_id)}</td>
                  <td className="pr-3 text-slate-600">{s.provider || '—'}</td>
                  <td className="pr-3 text-slate-600">{s.external_device_id || '—'}</td>
                  <td className="pr-3 text-slate-600">{rel(s.last_reading_at)}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{s.active !== false ? 'Activa' : 'Inactiva'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...s })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={async () => { await sensorService.deleteProbe(s.id); onChange(); }} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConfigPanel>
  );
}