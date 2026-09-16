import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { energyService } from '@/services/waterEnergy';

const EMPTY = { name: '', price_per_kwh: '', start_time: '', end_time: '', notes: '' };
const num = v => (v === '' || v == null ? null : Number(v));

export default function TariffSection({ tariffs, onChange }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const { id, ...rest } = form;
    const payload = { ...rest, price_per_kwh: num(form.price_per_kwh) };
    await energyService.saveTariff(id ? { ...payload, id } : payload);
    setBusy(false); setForm(null); onChange();
  };
  const del = async t => { await energyService.deleteTariff(t.id); onChange(); };
  return (
    <ConfigPanel title="Tarifas energéticas" description={`Precio por kWh y franja horaria · ${tariffs.length} configurada(s)`}>
      {!form && <button onClick={() => setForm({ ...EMPTY })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nueva tarifa</button>}
      {form && (
        <form onSubmit={save} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{form.id ? 'Editar tarifa' : 'Nueva tarifa'}</b>
            <button type="button" onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Nombre"><input required value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Tarifa agro" /></Field>
            <Field label="Precio ($/kWh)"><input required type="number" step="any" min="0" value={form.price_per_kwh ?? ''} onChange={e => set('price_per_kwh', e.target.value)} className={inputCls} /></Field>
            <Field label="Hora inicio"><input type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} className={inputCls} /></Field>
            <Field label="Hora fin"><input type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} className={inputCls} /></Field>
            <Field label="Notas"><input value={form.notes || ''} onChange={e => set('notes', e.target.value)} className={inputCls} placeholder="Observaciones…" /></Field>
          </div>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar tarifa'}</button>
        </form>
      )}
      {tariffs.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Nombre</th><th className="pr-3">Precio</th><th className="pr-3">Franja horaria</th><th className="pr-3">Notas</th><th /></tr></thead>
            <tbody>
              {tariffs.map(t => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{t.name}</b></td>
                  <td className="pr-3 text-slate-600">$ {t.price_per_kwh}/kWh</td>
                  <td className="pr-3 text-slate-600">{t.start_time || t.end_time ? `${t.start_time || '—'} a ${t.end_time || '—'}` : 'Todo el día'}</td>
                  <td className="pr-3 text-slate-500">{t.notes || '—'}</td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setForm({ ...t })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={() => del(t)} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
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