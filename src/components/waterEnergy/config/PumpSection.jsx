import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { energyService } from '@/services/waterEnergy';

const EMPTY = { name: '', lot_id: '', irrigation_sector: '', power_kw: '', flow_m3_h: '', design_pressure_bar: '', efficiency_percent: '', active: true };
const num = v => (v === '' || v == null ? null : Number(v));

export default function PumpSection({ lots, pumps, onChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const { id, ...rest } = form;
    const payload = {
      ...rest,
      lot_id: form.lot_id || null,
      power_kw: num(form.power_kw),
      flow_m3_h: num(form.flow_m3_h),
      design_pressure_bar: num(form.design_pressure_bar),
      efficiency_percent: num(form.efficiency_percent),
    };
    await energyService.savePump(id ? { ...payload, id } : payload);
    setBusy(false); setForm(null); onChange();
  };
  const del = async p => { await energyService.deletePump(p.id); onChange(); };
  return (
    <ConfigPanel title="Bombas" description={`Bombas asociadas a lotes o sectores de riego · ${pumps.length} configurada(s)`}>
      {!form && <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nueva bomba</button>}
      {form && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar bomba' : 'Nueva bomba'}</b>
            <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Bomba Principal" /></Field>
            <Field label="Lote (opcional)">
              <select value={form.lot_id || ''} onChange={e => set('lot_id', e.target.value)} className={inputCls}>
                <option value="">—</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name} ({l.farm})</option>)}
              </select>
            </Field>
            <Field label="Sector de riego"><input value={form.irrigation_sector || ''} onChange={e => set('irrigation_sector', e.target.value)} className={inputCls} placeholder="General / Sector 1" /></Field>
            <Field label="Potencia (kW)"><input required type="number" step="any" min="0" value={form.power_kw ?? ''} onChange={e => set('power_kw', e.target.value)} className={inputCls} /></Field>
            <Field label="Caudal (m³/h)"><input required type="number" step="any" min="0" value={form.flow_m3_h ?? ''} onChange={e => set('flow_m3_h', e.target.value)} className={inputCls} /></Field>
            <Field label="Presión de diseño (bar)"><input type="number" step="any" min="0" value={form.design_pressure_bar ?? ''} onChange={e => set('design_pressure_bar', e.target.value)} className={inputCls} /></Field>
            <Field label="Eficiencia (%)"><input type="number" step="any" min="0" max="100" value={form.efficiency_percent ?? ''} onChange={e => set('efficiency_percent', e.target.value)} className={inputCls} /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.active !== false} onChange={e => set('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" />Activa</label>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar bomba'}</button>
        </form>
      )}
      {pumps.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Nombre</th><th className="pr-3">Lote / Sector</th><th className="pr-3">Potencia</th><th className="pr-3">Caudal</th><th className="pr-3">kWh/m³</th><th className="pr-3">Estado</th><th /></tr></thead>
            <tbody>
              {pumps.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{p.name}</b></td>
                  <td className="pr-3 text-slate-600">{lots.find(l => l.id === p.lot_id)?.name || p.irrigation_sector || '—'}</td>
                  <td className="pr-3 text-slate-600">{p.power_kw ?? '—'} kW</td>
                  <td className="pr-3 text-slate-600">{p.flow_m3_h ?? '—'} m³/h</td>
                  <td className="pr-3 text-slate-600">{p.flow_m3_h ? (Math.round((p.power_kw / p.flow_m3_h) * 1000) / 1000) : '—'}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{p.active !== false ? 'Activa' : 'Inactiva'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...p })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={() => del(p)} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
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