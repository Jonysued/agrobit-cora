import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { sensorService } from '@/services/waterEnergy';

const TYPES = [['soil_moisture', 'Humedad de suelo'], ['soil_temperature', 'Temperatura de suelo'], ['flow', 'Caudal'], ['pressure', 'Presión'], ['energy', 'Energía']];
const EMPTY = { lot_id: '', name: '', sensor_type: 'soil_moisture', depth_cm: '', unit: 'vwc', active: true };
const typeLabel = t => (TYPES.find(([v]) => v === t) || [null, t])[1];

export default function SensorSection({ lots, sensors, onChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const payload = { ...form, depth_cm: form.depth_cm === '' ? null : Number(form.depth_cm) };
    if (form.id) await sensorService.updateSensor(form.id, payload);
    else await sensorService.createSensor(payload);
    setBusy(false); setForm(null); onChange();
  };
  const del = async s => { await sensorService.deleteSensor(s.id); onChange(); };
  return (
    <ConfigPanel title="Sensores" description={`Sensores registrados por lote · ${sensors.length} configurado(s)`}>
      {!form && <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nuevo sensor</button>}
      {form && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar sensor' : 'Nuevo sensor'}</b>
            <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Lote">
              <select required value={form.lot_id} onChange={e => set('lot_id', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name} ({l.farm})</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Sonda C1 · 30 cm" /></Field>
            <Field label="Tipo">
              <select value={form.sensor_type} onChange={e => set('sensor_type', e.target.value)} className={inputCls}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Profundidad (cm)"><input type="number" step="any" min="0" value={form.depth_cm ?? ''} onChange={e => set('depth_cm', e.target.value)} className={inputCls} /></Field>
            <Field label="Unidad"><input value={form.unit ?? ''} onChange={e => set('unit', e.target.value)} className={inputCls} placeholder="vwc / % / °C" /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" />Activo</label>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar sensor'}</button>
        </form>
      )}
      {sensors.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Nombre</th><th className="pr-3">Lote</th><th className="pr-3">Tipo</th><th className="pr-3">Prof. (cm)</th><th className="pr-3">Unidad</th><th className="pr-3">Estado</th><th /></tr></thead>
            <tbody>
              {sensors.map(s => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{s.name}</b></td>
                  <td className="pr-3 text-slate-600">{lots.find(l => l.id === s.lot_id)?.name || '—'}</td>
                  <td className="pr-3 text-slate-600">{typeLabel(s.sensor_type)}</td>
                  <td className="pr-3 text-slate-600">{s.depth_cm ?? '—'}</td>
                  <td className="pr-3 text-slate-600">{s.unit || '—'}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{s.active !== false ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...s })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={() => del(s)} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
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