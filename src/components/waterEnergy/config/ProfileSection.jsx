import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { waterForecastService } from '@/services/waterEnergy';

const EMPTY = { lot_id: '', name: '', soil_type: 'Franco', root_zone_depth_cm: 60, field_capacity_vwc: 0.28, wilting_point_vwc: 0.12, target_min_vwc: 0.17, target_max_vwc: 0.24, initial_vwc: 0.21, notes: '' };
const num = v => (v === '' || v == null ? null : Number(v));
const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function ProfileSection({ lots, profiles, onChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true);
    await waterForecastService.saveProfile({
      ...form,
      root_zone_depth_cm: num(form.root_zone_depth_cm),
      field_capacity_vwc: num(form.field_capacity_vwc),
      wilting_point_vwc: num(form.wilting_point_vwc),
      target_min_vwc: num(form.target_min_vwc),
      target_max_vwc: num(form.target_max_vwc),
      initial_vwc: num(form.initial_vwc),
    });
    setBusy(false); setForm(null); onChange();
  };
  const del = async p => { await waterForecastService.deleteProfile(p.id); onChange(); };
  return (
    <ConfigPanel title="Perfiles de suelo" description={`Zona objetivo (target_min / target_max) por lote, en humedad volumétrica · ${profiles.length} configurado(s)`}>
      {!form && <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nuevo perfil</button>}
      {form && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar perfil' : 'Nuevo perfil'}</b>
            <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Lote">
              <select required value={form.lot_id} onChange={e => set('lot_id', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name} ({l.farm})</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Perfil C1" /></Field>
            <Field label="Tipo de suelo"><input value={form.soil_type} onChange={e => set('soil_type', e.target.value)} className={inputCls} placeholder="Franco" /></Field>
            <Field label="Profundidad radicular (cm)"><input required type="number" step="any" min="0" value={form.root_zone_depth_cm ?? ''} onChange={e => set('root_zone_depth_cm', e.target.value)} className={inputCls} /></Field>
            <Field label="Capacidad de campo (VWC)"><input required type="number" step="any" min="0" max="1" value={form.field_capacity_vwc ?? ''} onChange={e => set('field_capacity_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Punto de marchitez (VWC)"><input required type="number" step="any" min="0" max="1" value={form.wilting_point_vwc ?? ''} onChange={e => set('wilting_point_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Target mín. (VWC)"><input required type="number" step="any" min="0" max="1" value={form.target_min_vwc ?? ''} onChange={e => set('target_min_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Target máx. (VWC)"><input required type="number" step="any" min="0" max="1" value={form.target_max_vwc ?? ''} onChange={e => set('target_max_vwc', e.target.value)} className={inputCls} /></Field>
            <Field label="Humedad inicial (VWC)"><input type="number" step="any" min="0" max="1" value={form.initial_vwc ?? ''} onChange={e => set('initial_vwc', e.target.value)} className={inputCls} /></Field>
            <div className="sm:col-span-2 lg:col-span-3"><Field label="Notas"><input value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} className={inputCls} placeholder="Observaciones…" /></Field></div>
          </div>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </form>
      )}
      {profiles.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Lote</th><th className="pr-3">Suelo</th><th className="pr-3">Prof. (cm)</th><th className="pr-3">CC / PM</th><th className="pr-3">Target mín / máx</th><th /></tr></thead>
            <tbody>
              {profiles.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{lots.find(l => l.id === p.lot_id)?.name || '—'}</b></td>
                  <td className="pr-3 text-slate-600">{p.soil_type || '—'}</td>
                  <td className="pr-3 text-slate-600">{p.root_zone_depth_cm ?? '—'}</td>
                  <td className="pr-3 text-slate-600">{pct(p.field_capacity_vwc)} / {pct(p.wilting_point_vwc)}</td>
                  <td className="pr-3 text-slate-600">{pct(p.target_min_vwc)} / {pct(p.target_max_vwc)}</td>
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