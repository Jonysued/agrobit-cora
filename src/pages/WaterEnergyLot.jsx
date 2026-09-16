import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import MoistureChart from '@/components/waterEnergy/MoistureChart';
import RecommendationCard from '@/components/waterEnergy/RecommendationCard';
import { waterForecastService, CONFIG_LABELS } from '@/services/waterEnergy';

const round1 = n => Math.round(n * 10) / 10;

// Por qué no hay forecast para el lote (sin sonda, sin lecturas o
// configuración del perfil incompleta)
const noForecastReason = detail => {
  const { state } = detail;
  if (!state) return 'Este lote no tiene una sonda de humedad con lecturas — el forecast hídrico se calcula sobre el estado medido del perfil.';
  if (state.missing) return state.missing;
  if (state.configuration_status === 'incomplete') {
    const missing = (state.missing_configuration || []).map(k => CONFIG_LABELS[k] || k).join(', ');
    return `Configuración del perfil incompleta — falta: ${missing}. Completala en Water & Energy → Configuración.`;
  }
  return 'No hay estado hídrico disponible para este lote.';
};

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
  const { lot, profile, state } = detail;
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
      ) : detail.forecast_status !== 'ok' ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{noForecastReason(detail)}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <MetricCard label="Agua útil actual" value={`${state.current_available_water_mm} mm`} detail={`${state.available_water_percent}% de la capacidad útil`} tone={state.status === 'RECARGAR' ? 'red' : 'light'} />
            <MetricCard label="Capacidad útil (TAW)" value={`${state.total_available_water_capacity_mm} mm`} tone="light" />
            <MetricCard label="Umbral de recarga" value={state.recharge_threshold_mm != null ? `${state.recharge_threshold_mm} mm` : '—'} tone="light" />
            <MetricCard label="Objetivo de recarga" value={state.target_water_mm != null ? `${state.target_water_mm} mm` : '—'} tone="light" />
            <MetricCard label="ETc · 7 días" value={detail.kc_missing ? 'Falta Kc' : `${round1(detail.scenarioWithoutIrrigation.reduce((s, p) => s + (p.etc_mm || 0), 0))} mm`} tone="light" />
            <MetricCard label="Lluvia prevista" value={`${round1(detail.scenarioWithoutIrrigation.reduce((s, p) => s + (p.rainfall_mm || 0), 0))} mm`} tone="light" />
            <MetricCard label="Riego recomendado" value={detail.recommendation ? `${detail.recommendation.recommended_irrigation_mm} mm` : detail.kc_missing ? 'Falta Kc' : 'No requerido'} tone={detail.recommendation ? 'amber' : 'light'} />
          </div>
          <MoistureChart detail={detail} />
          <RecommendationCard detail={detail} />
          {detail.forecast_confidence === 'partial' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Confianza del forecast: parcial — la sonda no cubre toda la profundidad radicular configurada.</p>
          )}
          {detail.below_wilting && <p className="text-xs font-semibold text-red-600">Advertencia: sin riego, el modelo proyecta agua útil agotada (en o por debajo del punto de marchitez).</p>}
          <p className="text-center text-xs text-slate-400">Modelo de balance hídrico EXPERIMENTAL — el clima puede ser observado (estación propia) o pronosticado según la configuración de cada finca. No constituye una predicción agronómica validada.</p>
        </>
      )}
    </div>
  );
}