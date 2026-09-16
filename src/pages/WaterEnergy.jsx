import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import WeatherPanel from '@/components/waterEnergy/WeatherPanel';
import LotForecastTable from '@/components/waterEnergy/LotForecastTable';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { waterForecastService } from '@/services/waterEnergy';
import { weatherService } from '@/services/waterEnergy/weatherService';

export default function WaterEnergy() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [farms, setFarms] = useState([]);
  const [farmId, setFarmId] = useState(null);
  useEffect(() => {
    weatherService.getFarms().then(fs => { setFarms(fs); if (fs.length) setFarmId(fs[0].id); }).catch(() => setFarms([]));
  }, []);
  useEffect(() => { waterForecastService.getFarmOverview().then(setData).catch(() => setError(true)); }, []);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar Water & Energy.</div> : <LoadingState />;
  const { rows, totals } = data;
  // La finca seleccionada en el selector meteorológico define los
  // lotes de la tabla Y las métricas: TODOS los lotes de esa finca
  // (con o sin perfil). Sin finca seleccionada, totales generales.
  const farm = farms.find(f => f.id === farmId);
  const farmRows = farm ? rows.filter(r => r.lot.farm === farm.name) : [];
  const withState = farmRows.filter(r => r.forecast_status === 'ok');
  const pcts = withState.map(r => r.state?.available_water_percent).filter(v => v != null);
  const farmTotals = {
    lots: farmRows.length,
    monitored: withState.length,
    unprofiled: farmRows.filter(r => !r.profile).length,
    avgPct: pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : null,
    volumeM3: Math.round(withState.reduce((s, r) => s + (r.recommendation?.recommended_irrigation_m3 || 0), 0)),
    kwh: Math.round(withState.reduce((s, r) => s + (r.energy?.kwh || 0), 0)),
    cost: Math.round(withState.reduce((s, r) => s + (r.energy?.cost || 0), 0)),
  };
  const shown = farm ? farmTotals : totals;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <WeatherPanel farms={farms} farmId={farmId} onFarmChange={setFarmId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Estado hídrico actual" value={shown.avgPct == null ? '—' : `${shown.avgPct}%`} detail={`${shown.monitored} de ${shown.lots} lotes monitoreados`} tone={shown.avgPct != null && shown.avgPct < 40 ? 'red' : 'light'} />
        <MetricCard label="Agua requerida · 7 días" value={`${shown.volumeM3.toLocaleString('es-AR')} m³`} detail="Lámina total recomendada" tone="light" />
        <MetricCard label="Energía estimada · 7 días" value={`${shown.kwh.toLocaleString('es-AR')} kWh`} detail="Estimación" tone="light" />
        <MetricCard label="Costo energético estimado" value={`$ ${shown.cost.toLocaleString('es-AR')}`} detail="Estimación" tone="dark" />
      </div>
      {shown.unprofiled > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {shown.unprofiled} lote(s) sin perfil de suelo configurado — configuralos en Water & Energy → Configuración.
        </p>
      )}
      <LotForecastTable rows={farmRows} onOpen={id => navigate(`/water-energy/lote/${id}`)} />
      <p className="text-center text-xs text-slate-400">Modelo de balance hídrico EXPERIMENTAL — los datos de clima pueden ser observados (estación propia) o simulados, según la configuración de cada finca. No constituye una predicción agronómica validada.</p>
    </div>
  );
}