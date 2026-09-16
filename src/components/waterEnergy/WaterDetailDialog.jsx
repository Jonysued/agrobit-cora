import React, { useState } from 'react';
import { X, Droplets } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import MetricCard from '@/components/MetricCard';
import { waterEnergyApi } from '@/services/waterEnergy';

const fmt = (n, d = 1) => n.toLocaleString('es-AR', { maximumFractionDigits: d });
const hitDate = date => new Date(`${date}T00:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });

export default function WaterDetailDialog({ result, config, onClose, onConfigSaved }) {
  const { lot, cfg } = result;
  const [form, setForm] = useState({
    useful_water_mm: cfg.useful_water_mm,
    threshold_mm: cfg.threshold_mm,
    etc_mm_day: cfg.etc_mm_day ?? '',
    pump_flow_m3h: cfg.pump_flow_m3h,
    pump_power_kw: cfg.pump_power_kw,
    energy_price: cfg.energy_price,
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const num = v => (v === '' || v == null ? null : Number(v));
  const save = async e => {
    e.preventDefault(); setBusy(true);
    const payload = { ...Object.fromEntries(Object.entries(form).map(([k, v]) => [k, num(v)])), lot_id: lot.id, id: config?.id };
    await waterEnergyApi.saveConfig(payload);
    setBusy(false); onConfigSaved();
  };
  const field = (k, label, ph = '') => (
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</label>
      <input type="number" step="any" min="0" placeholder={ph} value={form[k] ?? ''} onChange={e => set(k, e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500" />
    </div>
  );
  return (
    <div className="fixed inset-0 z-[1100] grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-700 text-white"><Droplets size={18} /></span>
            <div>
              <h2 className="text-base font-bold text-charcoal">{lot.name}</h2>
              <p className="text-xs text-slate-500">{lot.farm} · {lot.crop} · {lot.area_ha} ha</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Estado actual" value={`${fmt(result.currentMm)} mm`} detail={`${Math.round(result.currentPct * 100)}% del agua útil`} tone={result.status === 'ok' ? 'light' : result.status === 'alerta' ? 'amber' : 'red'} />
          <MetricCard label="Umbral alcanzado" value={result.hit ? hitDate(result.hit.date) : 'Más de 7 días'} detail={`Umbral: ${result.threshold} mm`} tone="light" />
          <MetricCard label="Necesidad de riego" value={`${fmt(result.needMm)} mm`} detail={`Volumen: ${fmt(result.volumeM3, 0)} m³ · Bomba: ${fmt(result.pumpHours)} h`} tone="light" />
          <MetricCard label="Costo energético" value={`$ ${fmt(result.cost, 0)}`} detail={`${fmt(result.kwh, 0)} kWh estimados`} tone="dark" />
        </div>

        <section className="mt-5 rounded-2xl border bg-white p-5">
          <h3 className="font-bold text-charcoal">Evolución estimada · próximos 7 días</h3>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.series} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" mm" />
                <Tooltip formatter={(v, name) => name === 'agua' ? [`${fmt(v)} mm`, 'Agua disponible'] : [`${fmt(v)} mm`, 'Riego programado']} />
                <ReferenceLine y={result.threshold} stroke="#dc2626" strokeDasharray="6 3" label={{ value: 'Umbral', fontSize: 10, fill: '#dc2626', position: 'insideTopRight' }} />
                <Area type="monotone" dataKey="agua" stroke="#047857" fill="#a7f3d0" strokeWidth={2.5} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {!result.hasDesign && <p className="mt-2 text-xs font-semibold text-amber-700">Sin diseño de riego cargado: los riegos programados no suman mm al forecast.</p>}
        </section>

        <form onSubmit={save}>
          <fieldset className="mt-5 rounded-2xl border border-slate-200 p-4">
            <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Configuración del lote</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {field('useful_water_mm', 'Agua útil total (mm)')}
              {field('threshold_mm', 'Umbral mínimo (mm)')}
              {field('etc_mm_day', 'ETc (mm/día)', 'Simulado')}
              {field('pump_flow_m3h', 'Caudal bomba (m³/h)')}
              {field('pump_power_kw', 'Potencia bomba (kW)')}
              {field('energy_price', 'Tarifa energía ($/kWh)')}
            </div>
            <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy ? 'Guardando…' : 'Guardar configuración'}</button>
          </fieldset>
        </form>
      </div>
    </div>
  );
}