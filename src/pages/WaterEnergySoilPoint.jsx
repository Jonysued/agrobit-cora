import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import StatusCard from '@/components/waterEnergy/soil/StatusCard';
import ProfileChart from '@/components/waterEnergy/soil/ProfileChart';
import RootZoneChart from '@/components/waterEnergy/soil/RootZoneChart';
import { soilWaterService, CONFIG_LABELS } from '@/services/waterEnergy';

// SENSORES — detalle de la sonda: SOLO MONITOREO en 3 bloques
// (Estado hídrico · Humedad por profundidad · Agua útil en zona radicular).
// Sin variables técnicas del sensor ni recomendaciones de riego.
const SOURCE_LABEL = { LIVE: 'En vivo', CSV: 'Importado CSV', MANUAL: 'Manual', DEMO: 'Demo' };

export default function WaterEnergySoilPoint() {
  const { probeId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setData(null); setErr(false); soilWaterService.getProbeAnalysis(probeId).then(setData).catch(() => setErr(true)); }, [probeId]);
  if (!data) return err ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la sonda.</div> : <LoadingState />;
  const incomplete = data.configuration_status === 'incomplete' && data.current_available_water_mm == null;
  const missingText = (data.missing_configuration || []).map(k => CONFIG_LABELS[k] || k).join(', ');
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div>
        <Link to="/water-energy/sensores" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 hover:underline"><ArrowLeft size={13} /> Sensores</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-charcoal">{data.probe?.name}</h1>
            <p className="text-xs text-slate-500">
              {data.lot?.name} · última lectura {data.lastReadingAt ? new Date(data.lastReadingAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">{SOURCE_LABEL[data.source] || data.source}</span>
        </div>
      </div>
      {data.missing ? (
        <div className="rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-charcoal">{data.missing}</p>
        </div>
      ) : (
        <>
          {incomplete ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
              <p className="text-sm font-semibold text-amber-800">Configuración incompleta</p>
              <p className="mt-1 text-xs text-amber-700">Falta configurar: {missingText} — Water & Energy → Configuración.</p>
            </div>
          ) : (
            <StatusCard
              status={data.status}
              availablePercent={data.available_water_percent}
              currentAvailableMm={data.current_available_water_mm}
              deficitMm={data.water_deficit_mm}
              rechargeMm={data.recharge_threshold_mm}
              targetMm={data.target_water_mm}
              tawMm={data.total_available_water_capacity_mm}
            />
          )}
          <ProfileChart readings={data.readings} channels={data.channels} events={data.events} />
          {!incomplete && (
            <RootZoneChart history={data.history} rechargeMm={data.recharge_threshold_mm} targetMm={data.target_water_mm} tawMm={data.total_available_water_capacity_mm} />
          )}
          {data.missing_configuration?.length > 0 && !incomplete && (
            <p className="text-xs text-amber-700">Falta configurar: {missingText} — Water & Energy → Configuración.</p>
          )}
          <p className="text-center text-xs text-slate-400">Estimación experimental del agua útil del perfil a partir de las sondas — módulo de monitoreo, sin recomendación de riego.</p>
        </>
      )}
    </div>
  );
}