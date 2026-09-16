import React, { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { sensorService } from '@/services/waterEnergy';

// Gestión de la estructura del módulo Sensores:
// FINCA → LOTE → PUNTO DE MONITOREO → SONDA → CANALES/PROFUNDIDADES.
// Los puntos son ubicaciones físicas; las sondas definen sus propias
// profundidades (canales). Las lecturas se cargan por CSV/API/demo.
const PROVIDERS = [['wiseconn', 'WiseConn'], ['irrimax', 'IrriMAX'], ['cropx', 'CropX'], ['demo', 'Demo / Manual']];
const EMPTY_POINT = { lot_id: '', name: '', active: true };
const EMPTY_PROBE = { monitoring_point_id: '', name: '', provider: '', external_device_id: '', active: true };
const rel = ts => { if (!ts) return '—'; const h = Math.round((Date.now() - new Date(ts).getTime()) / 3600000); return h < 1 ? 'hace instantes' : h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`; };
const lotName = (lots, id) => lots.find(l => l.id === id)?.name || '—';

export default function SensorSection({ lots, points, probes, onChange }) {
  const [pointForm, setPointForm] = useState(null);
  const [probeForm, setProbeForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const setP = (k, v) => setPointForm(f => ({ ...f, [k]: v }));
  const setS = (k, v) => setProbeForm(f => ({ ...f, [k]: v }));

  const savePoint = async e => {
    e.preventDefault(); setBusy(true);
    if (pointForm.id) await sensorService.updateMonitoringPoint(pointForm.id, pointForm);
    else await sensorService.createMonitoringPoint(pointForm);
    setBusy(false); setPointForm(null); onChange();
  };
  const saveProbe = async e => {
    e.preventDefault(); setBusy(true);
    if (probeForm.id) await sensorService.updateProbe(probeForm.id, probeForm);
    else await sensorService.createProbe(probeForm);
    setBusy(false); setProbeForm(null); onChange();
  };

  return (
    <ConfigPanel title="Sensores" description={`Puntos de monitoreo y sondas que alimentan el módulo Sensores · ${probes.length} sonda(s)`}>
      <div className="flex flex-wrap gap-2">
        {!pointForm && <button onClick={() => setPointForm({ ...EMPTY_POINT })} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800"><Plus size={14} />Nuevo punto</button>}
        {!probeForm && points.length > 0 && <button onClick={() => setProbeForm({ ...EMPTY_PROBE })} className="flex items-center gap-1.5 rounded-lg border border-emerald-900 px-3 py-1.5 text-xs font-bold text-emerald-900 transition hover:bg-emerald-50"><Plus size={14} />Nueva sonda</button>}
      </div>

      {pointForm && (
        <form onSubmit={savePoint} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{pointForm.id ? 'Editar punto de monitoreo' : 'Nuevo punto de monitoreo'}</b>
            <button type="button" onClick={() => setPointForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Lote">
              <select required value={pointForm.lot_id} onChange={e => setP('lot_id', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {lots.map(l => <option key={l.id} value={l.id}>{l.name} ({l.farm})</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input required value={pointForm.name} onChange={e => setP('name', e.target.value)} className={inputCls} placeholder="Punto 1 · Cabecera norte" /></Field>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={pointForm.active !== false} onChange={e => setP('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" />Activo</label>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar punto'}</button>
        </form>
      )}

      {probeForm && (
        <form onSubmit={saveProbe} className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <b className="text-sm text-charcoal">{probeForm.id ? 'Editar sonda' : 'Nueva sonda'}</b>
            <button type="button" onClick={() => setProbeForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Punto de monitoreo">
              <select required value={probeForm.monitoring_point_id} onChange={e => setS('monitoring_point_id', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {points.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Nombre"><input required value={probeForm.name} onChange={e => setS('name', e.target.value)} className={inputCls} placeholder="Sonda A" /></Field>
            <Field label="Proveedor · API">
              <select value={probeForm.provider || ''} onChange={e => setS('provider', e.target.value)} className={inputCls}>
                <option value="">Seleccionar…</option>
                {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="ID del dispositivo (API)"><input value={probeForm.external_device_id ?? ''} onChange={e => setS('external_device_id', e.target.value)} className={inputCls} placeholder="ID en la API del proveedor" /></Field>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">Las credenciales de la API del proveedor se configuran de forma segura en el backend (Secrets). Aquí registrás la sonda, su proveedor y su ID de dispositivo — cuando la API empieza a reportar lecturas, la sonda aparece automáticamente en el módulo Sensores.</p>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={probeForm.active !== false} onChange={e => setS('active', e.target.checked)} className="h-4 w-4 accent-emerald-700" />Activa</label>
          <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar sonda'}</button>
        </form>
      )}

      {points.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Puntos de monitoreo</p>
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Punto</th><th className="pr-3">Lote</th><th className="pr-3">Estado</th><th /></tr></thead>
            <tbody>
              {points.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{p.name}</b></td>
                  <td className="pr-3 text-slate-600">{lotName(lots, p.lot_id)}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${p.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{p.active !== false ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setPointForm({ ...p })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
                    <button onClick={async () => { await sensorService.deleteMonitoringPoint(p.id); onChange(); }} className="ml-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {probes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Sondas</p>
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Sonda</th><th className="pr-3">Punto · Lote</th><th className="pr-3">Proveedor</th><th className="pr-3">ID externo</th><th className="pr-3">Última lectura</th><th className="pr-3">Estado</th><th /></tr></thead>
            <tbody>
              {probes.map(s => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3"><b className="text-slate-700">{s.name}</b></td>
                  <td className="pr-3 text-slate-600">{points.find(p => p.id === s.monitoring_point_id)?.name || '—'} · {lotName(lots, s.lot_id)}</td>
                  <td className="pr-3 text-slate-600">{s.provider || '—'}</td>
                  <td className="pr-3 text-slate-600">{s.external_device_id || '—'}</td>
                  <td className="pr-3 text-slate-600">{rel(s.last_reading_at)}</td>
                  <td className="pr-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>{s.active !== false ? 'Activa' : 'Inactiva'}</span></td>
                  <td className="whitespace-nowrap text-right">
                    <button onClick={() => setProbeForm({ ...s })} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"><Pencil size={12} className="inline" /> Editar</button>
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