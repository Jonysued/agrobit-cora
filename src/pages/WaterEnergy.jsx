import React, { useEffect, useMemo, useState } from 'react';
import { useFarm } from '@/lib/FarmContext';
import { Droplets } from 'lucide-react';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { waterEnergyService, waterEnergyApi } from '@/services/waterEnergy';
import LotWaterCard from '@/components/waterEnergy/LotWaterCard';
import WaterDetailDialog from '@/components/waterEnergy/WaterDetailDialog';

const fmt = (n, d = 1) => n.toLocaleString('es-AR', { maximumFractionDigits: d });

export default function WaterEnergy() {
  const farmData = useFarm();
  const [configs, setConfigs] = useState(null);
  const [selectedLotId, setSelectedLotId] = useState(null);

  const loadConfigs = () => waterEnergyApi.listConfigs().then(setConfigs).catch(() => setConfigs([]));
  useEffect(() => { loadConfigs(); }, []);

  const results = useMemo(
    () => configs && farmData.Lot
      ? farmData.Lot.map(lot => waterEnergyService.getLotWaterEnergy(lot, configs.find(c => c.lot_id === lot.id), farmData))
      : [],
    [farmData, configs]
  );

  if (farmData.loading || !configs) return <LoadingState />;
  if (results.length === 0) return <div className="grid min-h-[60vh] place-items-center text-sm text-slate-500">Todavía no hay lotes cargados.</div>;

  const ov = waterEnergyService.getOverview(results);
  const selected = results.find(r => r.lot.id === selectedLotId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-700 text-white"><Droplets size={20} /></span>
          <div>
            <h1 className="text-xl font-bold text-charcoal">Water & Energy</h1>
            <p className="text-xs text-slate-500">Estado del suelo · forecast 7 días · necesidad de riego · energía y costo</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">Datos simulados</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Lotes en alerta" value={`${ov.alerts} de ${ov.lots}`} tone={ov.alerts ? 'red' : 'light'} />
        <MetricCard label="Lámina a reponer" value={`${fmt(ov.mm)} mm`} tone="light" />
        <MetricCard label="Volumen a reponer" value={`${fmt(ov.volumeM3, 0)} m³`} tone="light" />
        <MetricCard label="Horas de bombeo" value={`${fmt(ov.pumpHours)} h`} tone="light" />
        <MetricCard label="Costo energético" value={`$ ${fmt(ov.cost, 0)}`} detail={`${fmt(ov.kwh, 0)} kWh`} tone="dark" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {results.map(r => <LotWaterCard key={r.lot.id} result={r} onOpen={() => setSelectedLotId(r.lot.id)} />)}
      </div>

      <p className="text-center text-xs text-slate-400">Cálculos sobre datos simulados de humedad y evapotranspiración. La capa de servicios está preparada para conectar sensores reales o APIs meteorológicas sin cambiar la interfaz.</p>

      {selected && (
        <WaterDetailDialog
          result={selected}
          config={configs.find(c => c.lot_id === selected.lot.id)}
          onClose={() => setSelectedLotId(null)}
          onConfigSaved={loadConfigs}
        />
      )}
    </div>
  );
}