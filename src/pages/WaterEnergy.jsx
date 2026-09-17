import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import WeatherPanel from '@/components/waterEnergy/WeatherPanel';
import LotForecastTable from '@/components/waterEnergy/LotForecastTable';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { Button } from '@/components/ui/button';
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
  // "Failed to fetch" = falla transitoria de red: la carga del panel
  // dispara ~25 consultas en paralelo y, en una conexión inestable,
  // si una sola se cae el panel entero muestra error. Se reintenta
  // una vez automáticamente antes de mostrar el cartel.
  const isNetworkError = e => /failed to fetch|network|load failed|connection|timed?\s?out/i.test(e?.message || '');
  const loadOverview = (retries = 1) => {
    setError(null);
    waterForecastService.getFarmOverview()
      .then(setData)
      .catch(e => {
        if (retries > 0 && isNetworkError(e)) { loadOverview(retries - 1); return; }
        console.error('[WaterEnergy] getFarmOverview:', e);
        setError(isNetworkError(e) ? 'Falla de conexión al cargar el panel. Revisá tu conexión a internet y reintentá.' : (e?.message || 'Error desconocido'));
      });
  };
  useEffect(() => { loadOverview(); }, []);
  if (!data) return error ? (
    <div className="mx-auto max-w-md space-y-3 p-8 text-center">
      <p className="text-sm font-semibold text-slate-600">No se pudo cargar Water &amp; Energy.</p>
      <p className="break-words rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">{error}</p>
      <Button onClick={() => loadOverview()}>Reintentar</Button>
    </div>
  ) : <LoadingState />;
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
    avgStoredMm: (() => { const mm = withState.map(r => r.state?.total_profile_water_mm).filter(v => v != null); return mm.length ? Math.round(mm.reduce((s, v) => s + v, 0) / mm.length * 10) / 10 : null; })(),
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
        <MetricCard label="Suma de perfil" value={shown.avgStoredMm == null ? '—' : `${shown.avgStoredMm} mm`} detail={`Promedio · ${shown.monitored} de ${shown.lots} lotes monitoreados`} tone={shown.avgPct != null && shown.avgPct < 40 ? 'red' : 'light'} />
        <MetricCard label="Agua requerida · 15 días" value={`${shown.volumeM3.toLocaleString('es-AR')} m³`} detail="Lámina total recomendada" tone="light" />
        <MetricCard label="Energía estimada · 15 días" value={`${shown.kwh.toLocaleString('es-AR')} kWh`} detail="Estimación" tone="light" />
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