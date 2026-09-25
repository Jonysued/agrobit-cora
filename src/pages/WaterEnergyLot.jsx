import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import MetricCard from '@/components/MetricCard';
import LoadingState from '@/components/LoadingState';
import MoistureChart from '@/components/waterEnergy/MoistureChart';
import RecommendationCard from '@/components/waterEnergy/RecommendationCard';
import ScheduledIrrigationPanel from '@/components/waterEnergy/ScheduledIrrigationPanel';
import InitialStateConfig from '@/components/waterEnergy/InitialStateConfig';
import { waterForecastService, CONFIG_LABELS } from '@/services/waterEnergy';
import { backend } from '@/api/backendClient';

const round1 = n => Math.round(n * 10) / 10;
const SOURCE_LABEL = {
  calculated: 'calculado con los eventos del lote',
  initialized: 'estado inicial guardado',
  manual_adjustment: 'inicialización manual',
};

// Por qué no hay forecast para el lote (sin perfil, configuración
// incompleta o estado inicial sin definir)
const noForecastReason = detail => {
  const { state } = detail;
  if (!detail.profile) return 'Este lote no tiene perfil de suelo configurado. Configuralo en Water & Energy → Configuración.';
  if (!state) return 'Este lote no tiene perfil de suelo configurado. Configuralo en Water & Energy → Configuración.';
  if (state.configuration_status === 'incomplete') {
    const missing = (state.missing_configuration || []).map(k => CONFIG_LABELS[k] || k).join(', ');
    return `Configuración del perfil incompleta — falta: ${missing}. Completala en Water & Energy → Configuración.`;
  }
  return 'Este lote todavía no tiene un estado hídrico inicial — definí un valor manual en la tarjeta de abajo, y a partir de ahí la curva evoluciona sola con los riegos, la lluvia y la demanda del cultivo.';
};

export default function WaterEnergyLot() {
  const { lotId } = useParams();
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    setDetail(null);
    waterForecastService.getLotDetail(lotId)
      .then(d => (d ? setDetail(d) : setError(true)))
      .catch(() => setError(true));
  }, [lotId, reloadKey]);
  // Si el productor modifica el cronograma (IrrigationProgram), la
  // curva futura de Suma de perfil se recalcula inmediatamente.
  useEffect(() => {
    const unsubscribe = backend.entities.IrrigationProgram.subscribe(() => setReloadKey(k => k + 1));
    return unsubscribe;
  }, []);
  if (!detail) return error ? <div className="p-6 text-sm text-slate-500">Lote no encontrado.</div> : <LoadingState />;
  const { lot, profile, state, model } = detail;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <Link to="/water-energy" className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft size={15} />Volver a Water & Energy</Link>
      <ModuleHeader />
      <div>
        <h2 className="text-lg font-bold text-charcoal">{lot.name}</h2>
        <p className="text-xs text-slate-500">{lot.farm} · {lot.crop} · {lot.area_ha} ha{lot.sector ? ` · ${lot.sector}` : ''}</p>
        {profile && (
          <p className="mt-1 text-xs text-slate-400">
            Modelo de suelo:{' '}
            <b className="text-slate-500">
              {model ? model.name : 'sin modelo de suelo vinculado'}
              {model?.recharge_efficiency != null ? ` · eficiencia de recarga ${Math.round(model.recharge_efficiency * 100)}%` : ''}
              {model?.calibration_status === 'calibrated' ? '' : model ? ' · sin calibrar' : ''}
            </b>
          </p>
        )}
      </div>
      {!profile ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Este lote no tiene perfil de suelo configurado. Configuralo en Water & Energy → Configuración.
        </p>
      ) : (
        <>
          {detail.forecast_status !== 'ok' && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{noForecastReason(detail)}</p>
          )}
          {detail.forecast_status === 'ok' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <MetricCard
                  label="Suma de perfil"
                  value={`${state.total_profile_water_mm} mm`}
                  detail={`${state.available_water_percent}% de la capacidad útil · ${SOURCE_LABEL[state.state_source] || 'calculado'}`}
                  tone={state.status === 'RECARGAR' ? 'red' : 'light'}
                />
                <MetricCard label="Capacidad de campo" value={state.field_capacity_storage_mm != null ? `${state.field_capacity_storage_mm} mm` : '—'} detail={`Agua útil ${state.total_available_water_capacity_mm} mm · marchitez ${state.wilting_storage_mm} mm`} tone="light" />
                <MetricCard label="Umbral de recarga" value={state.recharge_storage_mm != null ? `${state.recharge_storage_mm} mm` : '—'} tone="light" />
                <MetricCard label="Objetivo de recarga" value={state.target_storage_mm != null ? `${state.target_storage_mm} mm` : '—'} tone="light" />
                <MetricCard
                  label="Kc actual"
                  value={detail.kc != null ? detail.kc.toFixed(3) : 'Falta Kc'}
                  detail={detail.kc_details?.stage ? `${detail.kc_details.stage} · ${detail.kc_details.age_years ?? '—'} años${detail.kc_details.phenology_delay_days ? ` · atraso ${detail.kc_details.phenology_delay_days} d` : ''}` : ''}
                  tone="light"
                />
                <MetricCard label="ETc · 15 días" value={detail.kc_missing ? 'Falta Kc' : `${round1(detail.scenarioWithoutIrrigation.slice(0, 15).reduce((s, p) => s + (p.etc_mm || 0), 0))} mm`} tone="light" />
                <MetricCard label="Lluvia prevista · 15 días" value={`${round1(detail.scenarioWithoutIrrigation.slice(0, 15).reduce((s, p) => s + (p.rainfall_mm || 0), 0))} mm`} tone="light" />
                <MetricCard label="Riego recomendado" value={detail.recommendation ? `${detail.recommendation.recommended_irrigation_mm} mm` : detail.forecast_quality?.level === 'blocked' ? 'Pausado' : detail.kc_missing ? 'Falta Kc' : 'No requerido'} tone={detail.recommendation ? 'amber' : 'light'} />
              </div>
              <MoistureChart detail={detail} />
              <ScheduledIrrigationPanel detail={detail} />
              <div id="recomendacion"><RecommendationCard detail={detail} /></div>
              {detail.forecast_confidence === 'partial' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <p className="font-bold">Confianza del forecast: parcial</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">
                    {(detail.forecast_quality?.warnings || []).map(warning => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              )}
              {detail.below_wilting && <p className="text-xs font-semibold text-red-600">Advertencia: la proyección del lote alcanza el punto de marchitez (agua útil agotada) sin riego adicional.</p>}
            </>
          )}
          <div id="estado-inicial"><InitialStateConfig detail={detail} onSaved={() => setReloadKey(k => k + 1)} /></div>
        </>
      )}
    </div>
  );
}
