import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import MoistureChart from '@/components/waterEnergy/MoistureChart';
import RecommendationCard from '@/components/waterEnergy/RecommendationCard';
import { waterForecastService } from '@/services/waterEnergy';

const vwcPct = v => `${Math.round(v * 100)}%`;
const round1 = n => Math.round(n * 10) / 10;

export default function WaterEnergyLot() {
  const { lotId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    waterForecastService.getLotDetail(lotId)
      .then(d => (d ? setDetail(d) : setError(true)))
      .catch(() => setError(true));
  }, [lotId]);
  if (!detail) return error ? <div className="p-6 text-sm text-slate-500">Lote no encontrado.</div> : <LoadingState />;
  const { lot, profile } = detail;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <Link to="/water-energy" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft size={15} />Volver a Water & Energy</Link>
      <ModuleHeader />
      <div>
        <h2 className="text-lg font-bold text-charcoal">{lot.name}</h2>
        <p className="text-xs text-slate-500">{lot.farm} · {lot.crop} · {lot.area_ha} ha{lot.sector ? ` · ${lot.sector}` : ''}</p>
      </div>
      {!profile ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Este lote no tiene perfil de suelo configurado. Configuralo en Water & Energy → Configuración.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <MetricCard label="Humedad actual" value={vwcPct(detail.currentVwc)} detail={`${detail.currentPct}% agua disponible`} tone={detail.status === 'verde' ? 'light' : detail.status === 'amarillo' ? 'amber' : 'red'} />
            <MetricCard label="Agua disponible" value={`${detail.currentPct}%`} tone="light" />
            <MetricCard label="Capacidad de campo" value={vwcPct(profile.field_capacity_vwc)} tone="light" />
            <MetricCard label="Umbral mínimo" value={vwcPct(profile.target_min_vwc)} tone="light" />
            <MetricCard label="ETc próxima semana" value={`${round1(detail.weather.reduce((s, w) => s + (w.etc_mm || 0), 0))} mm`} tone="light" />
            <MetricCard label="Lluvia prevista" value={`${round1(detail.weather.reduce((s, w) => s + (w.rainfall_mm || 0), 0))} mm`} tone="light" />
            <MetricCard label="Riego recomendado" value={detail.recommendation ? `${detail.recommendation.recommended_irrigation_mm} mm` : 'No requerido'} tone={detail.recommendation ? 'amber' : 'light'} />
          </div>
          <MoistureChart detail={detail} />
          <RecommendationCard detail={detail} />
          {detail.belowWilting && <p className="text-xs font-semibold text-red-600">Advertencia: sin riego, el modelo proyecta humedad en o por debajo del punto de marchitez.</p>}
          <p className="text-center text-xs text-slate-400">Modelo de balance hídrico EXPERIMENTAL con datos simulados — no constituye una predicción agronómica validada.</p>
        </>
      )}
    </div>
  );
}