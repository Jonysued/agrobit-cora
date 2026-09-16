import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LotForecastTable from '@/components/waterEnergy/LotForecastTable';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import { waterForecastService } from '@/services/waterEnergy';

export default function WaterEnergy() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { waterForecastService.getFarmOverview().then(setData).catch(() => setError(true)); }, []);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar Water & Energy.</div> : <LoadingState />;
  const { rows, totals } = data;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Estado hídrico actual" value={totals.avgPct == null ? '—' : `${totals.avgPct}%`} detail={`${totals.monitored} de ${totals.lots} lotes monitoreados`} tone={totals.avgPct != null && totals.avgPct < 40 ? 'red' : 'light'} />
        <MetricCard label="Agua requerida · 7 días" value={`${totals.volumeM3.toLocaleString('es-AR')} m³`} detail="Lámina total recomendada" tone="light" />
        <MetricCard label="Energía estimada · 7 días" value={`${totals.kwh.toLocaleString('es-AR')} kWh`} detail="Estimación" tone="light" />
        <MetricCard label="Costo energético estimado" value={`$ ${totals.cost.toLocaleString('es-AR')}`} detail="Estimación" tone="dark" />
      </div>
      {totals.unprofiled > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {totals.unprofiled} lote(s) sin perfil de suelo configurado — configuralos en Water & Energy → Configuración.
        </p>
      )}
      <LotForecastTable rows={rows.filter(r => r.profile)} onOpen={id => navigate(`/water-energy/lote/${id}`)} />
      <p className="text-center text-xs text-slate-400">Modelo de balance hídrico EXPERIMENTAL basado en datos simulados — no constituye una predicción agronómica validada.</p>
    </div>
  );
}