import React, { useEffect, useState } from 'react';
import { backend } from '@/api/backendClient';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { waterForecastService, energyService } from '@/services/waterEnergy';

const formatNumber = value => value == null ? 'Sin datos suficientes' : value.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const formatHours = hours => `${formatNumber(hours)} h`;
const formatKwh = value => value == null ? '—' : `${formatNumber(value)} kWh`;
const formatCost = value => value == null ? '—' : `$ ${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

export default function WaterEnergyEnergy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => backend.entities.IrrigationProgram.subscribe(() => {
    setReloadKey(k => k + 1);
  }), []);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      const [overview, pumps, programs] = await Promise.all([
        waterForecastService.getFarmOverview({ force: true }), energyService.getPumps(), backend.entities.IrrigationProgram.list(),
      ]);
      const window = energyService.projectionWindow();
      const scheduled = energyService.getScheduledOverview(programs, pumps, overview.rows, overview.tariff, window);
      const recommended = energyService.getRecommendedOverview(overview.rows, window);
      if (!cancelled) setData({ scheduled, recommended, pumps });
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la sección Energía.</div> : <LoadingState />;
  const { scheduled, recommended, pumps } = data;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div className="grid gap-5 lg:grid-cols-2">
        {[{ title: 'Energía programada', energy: scheduled, description: 'Riegos agendados · próximos 7 días. Los horarios superpuestos del mismo pozo se cuentan una sola vez.' },
          { title: 'Energía recomendada', energy: recommended, description: 'Riego adicional sugerido por el modelo · próximos 7 días. No está agendado; las horas son la suma estimada por lote.' }].map(({ title, energy, description }) => (
          <section key={title} className="space-y-3">
            <h2 className="text-lg font-bold text-charcoal">{title}</h2>
            <p className="text-xs leading-relaxed text-slate-500">{description}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Horas" value={formatHours(energy.totalHours)} tone="light" />
              <MetricCard label="Consumo estimado" value={formatKwh(energy.totalKwh)} tone="light" />
              <MetricCard label="Costo estimado" value={formatCost(energy.totalCost)} tone="dark" />
            </div>
          </section>
        ))}
      </div>
      {scheduled.incompletePrograms > 0 && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Hay {scheduled.incompletePrograms} programa(s) sin pozo, horario o duración válidos. No están incluidos en la energía programada.</p>}
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {['Pozo / bomba', 'Finca', 'Suministro eléctrico', 'Lote / Sector', 'Potencia', 'Caudal'].map(h => <th key={h} rowSpan={2} scope="col" className="px-4 py-3">{h}</th>)}
              <th colSpan={3} scope="colgroup" className="px-4 py-3 text-emerald-800">Energía programada</th>
              <th colSpan={3} scope="colgroup" className="px-4 py-3 text-violet-700">Energía recomendada</th>
              <th rowSpan={2} scope="col" className="px-4 py-3">kWh/m³</th>
            </tr>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {['programada', 'recomendada'].flatMap(kind => ['Horas', 'kWh', 'Costo'].map(label => <th key={`${kind}-${label}`} scope="col" className="px-4 py-3">{label}</th>))}
            </tr>
          </thead>
          <tbody>
            {pumps.map(p => {
              const planned = scheduled.pumpStats.find(x => x.pump.id === p.id);
              const suggested = recommended.pumpStats.find(x => x.pump.id === p.id);
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-3"><b className="text-charcoal">{p.name}</b></td>
                  <td className="px-4 py-3 text-slate-600">{p.farm || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{p.energy_supply_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.irrigation_sector || p.lot_id || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.power_kw} kW</td>
                  <td className="px-4 py-3 text-slate-600">{p.flow_m3_h} m³/h</td>
                  {[planned, suggested].map((stats, index) => <React.Fragment key={index}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatHours(stats?.hours ?? 0)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatKwh(stats ? stats.kwh : 0)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatCost(stats ? stats.cost : 0)}</td>
                  </React.Fragment>)}
                  <td className="px-4 py-3 text-slate-600">{p.flow_m3_h ? Math.round((p.power_kw / p.flow_m3_h) * 1000) / 1000 : '—'}</td>
                </tr>
              );
            })}
            {!pumps.length && <tr><td colSpan={13} className="px-4 py-8 text-center text-sm text-slate-400">Sin pozos ni bombas configurados. Cargalos en Water & Energy → Configuración.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-center text-xs text-slate-400">Consumo y costo estimados según potencia del pozo y tarifa configurada. La energía recomendada es adicional a la programada; las horas por lote no equivalen a un cronograma de bombeo.</p>
    </div>
  );
}
