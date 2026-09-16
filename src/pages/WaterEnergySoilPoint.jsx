import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import StatusCard from '@/components/waterEnergy/soil/StatusCard';
import ProfileChart from '@/components/waterEnergy/soil/ProfileChart';
import RootZoneChart from '@/components/waterEnergy/soil/RootZoneChart';
import DecisionCard from '@/components/waterEnergy/soil/DecisionCard';
import { soilWaterService } from '@/services/waterEnergy';

// MONITOREO DE SUELO — detalle del punto: SOLO 4 bloques
// (Estado hídrico · Humedad por profundidad · Agua en zona radicular ·
//  Recomendación). Sin variables técnicas del sensor.
const SOURCE_LABEL = { LIVE: 'En vivo', CSV: 'Importado CSV', MANUAL: 'Manual', DEMO: 'Demo' };

export default function WaterEnergySoilPoint() {
  const { pointId } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { setData(null); setErr(false); soilWaterService.getPointAnalysis(pointId).then(setData).catch(() => setErr(true)); }, [pointId]);
  if (!data) return err ? <div className="p-6 text-sm text-slate-500">No se pudo cargar el punto de monitoreo.</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div>
        <Link to="/water-energy/suelo" className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 hover:underline"><ArrowLeft size={13} /> Monitoreo de Suelo</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-charcoal">{data.point?.name}</h1>
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
          <p className="mt-1 text-xs text-slate-500">Configurá sondas y canales en Water & Energy → Configuración.</p>
        </div>
      ) : (
        <>
          <StatusCard status={data.status} pct={data.pct} thresholds={data.thresholds} currentMm={data.currentMm} deficitMm={data.deficitMm} nextIrrigation={data.nextIrrigation} />
          <ProfileChart readings={data.readings} channels={data.channels} events={data.events} />
          <RootZoneChart history={data.history} forecastA={data.forecastA} forecastB={data.forecastB} thresholds={data.thresholds} />
          <DecisionCard lot={data.lot} recommendation={data.recommendation} energy={data.energy} nextIrrigation={data.nextIrrigation} />
          <p className="text-center text-xs text-slate-400">Estimación experimental del agua del perfil a partir de las sondas — no constituye una predicción agronómica validada.</p>
        </>
      )}
    </div>
  );
}