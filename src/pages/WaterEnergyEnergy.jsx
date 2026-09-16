import React, { useEffect, useState } from 'react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { waterForecastService, energyService } from '@/services/waterEnergy';

export default function WaterEnergyEnergy() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    (async () => {
      const overview = await waterForecastService.getFarmOverview();
      const pumps = await energyService.getPumps();
      const energy = energyService.getEnergyOverview(overview.rows);
      setData({ energy, pumps });
    })().catch(() => setError(true));
  }, []);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la sección Energía.</div> : <LoadingState />;
  const { energy, pumps } = data;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="kWh por m³ bombeado" value={energy.pumpStats[0] ? `${energy.pumpStats[0].kwhPerM3}` : '—'} detail="Eficiencia energética de bombeo" tone="light" />
        <MetricCard label="kWh por hectárea" value={energy.kwhPerHa != null ? `${energy.kwhPerHa}` : 'Sin datos suficientes'} detail="Próximos 7 días" tone="light" />
        <MetricCard label="Horas proyectadas" value={`${energy.totalHours} h`} detail="Próximos 7 días" tone="light" />
        <MetricCard label="Costo proyectado" value={`$ ${energy.totalCost.toLocaleString('es-AR')}`} detail={`${energy.totalKwh.toLocaleString('es-AR')} kWh · Estimación`} tone="dark" />
      </div>
      <section className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              {['Bomba', 'Lote / Sector', 'Potencia', 'Caudal', 'Horas proyectadas', 'kWh proyectados', 'Costo proyectado', 'kWh/m³'].map(h => <th key={h} className="px-4 py-3">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {pumps.map(p => {
              const s = energy.pumpStats.find(x => x.pump.id === p.id);
              return (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="px-4 py-3"><b className="text-charcoal">{p.name}</b></td>
                  <td className="px-4 py-3 text-slate-600">{p.irrigation_sector || p.lot_id || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.power_kw} kW</td>
                  <td className="px-4 py-3 text-slate-600">{p.flow_m3_h} m³/h</td>
                  <td className="px-4 py-3 text-slate-600">{s ? `${s.hours} h` : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s ? `${s.kwh.toLocaleString('es-AR')} kWh` : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{s ? `$ ${s.cost.toLocaleString('es-AR')}` : '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{p.flow_m3_h ? Math.round((p.power_kw / p.flow_m3_h) * 1000) / 1000 : '—'}</td>
                </tr>
              );
            })}
            {!pumps.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">Sin bombas configuradas. Cargalas en Water & Energy → Configuración.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-center text-xs text-slate-400">Proyecciones de los próximos 7 días según las recomendaciones del modelo — ESTIMACIONES basadas en datos simulados.</p>
    </div>
  );
}