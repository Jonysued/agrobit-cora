import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Gauge } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import { soilWaterService, CONFIG_LABELS } from '@/services/waterEnergy';

// SENSORES — pantalla principal: una sonda por tarjeta,
// solo información de monitoreo del perfil de suelo.
const STATUS_TEXT = { RECARGAR: 'text-red-600', ÓPTIMO: 'text-emerald-700', LLENO: 'text-cyan-700' };
const SOURCE_BADGE = {
  LIVE: 'bg-emerald-100 text-emerald-800',
  CSV: 'bg-blue-100 text-blue-800',
  MANUAL: 'bg-slate-100 text-slate-700',
  DEMO: 'bg-amber-100 text-amber-800',
};

const rel = ts => {
  if (!ts) return '—';
  const h = Math.round((Date.now() - new Date(ts).getTime()) / 3600000);
  return h < 1 ? 'hace instantes' : h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};
const missingLabels = row => (row.missing_configuration || []).map(k => CONFIG_LABELS[k] || k).join(', ');

export default function WaterEnergySoil() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { soilWaterService.getProbeSummaries().then(setRows).catch(() => setErr(true)); }, []);
  if (!rows) return err ? <div className="p-6 text-sm text-slate-500">No se pudo cargar los sensores.</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div>
        <h2 className="text-lg font-bold text-charcoal">Sensores</h2>
        <p className="text-xs text-slate-500">Sondas de humedad del perfil de suelo por lote — solo monitoreo.</p>
      </div>
      {!rows.length ? (
        <div className="rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
          <Gauge className="mx-auto text-slate-300" size={32} />
          <p className="mt-3 text-sm font-semibold text-charcoal">Todavía no hay sondas configuradas</p>
          <p className="mt-1 text-xs text-slate-500">Registrá la sonda en Water & Energy → Configuración → Sensores y vinculá su lote en Vinculación de perfiles.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <button key={row.probe.id} type="button" onClick={() => nav(`/water-energy/sensores/${row.probe.id}`)} className="rounded-2xl border border-black/5 bg-white p-5 text-left shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-charcoal">{row.probe.name}</p>
                  <p className="text-xs text-slate-500">{row.lotName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {row.connectionStatus === 'disconnected' && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">Desconectada</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${SOURCE_BADGE[row.source] || SOURCE_BADGE.MANUAL}`}>{row.source}</span>
                </div>
              </div>
              {row.missing ? (
                <p className="mt-5 text-xs text-slate-400">{row.missing}</p>
              ) : row.current_available_water_mm == null ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold text-amber-700">Configuración incompleta</p>
                  <p className="mt-1 text-xs text-slate-400">Falta configurar: {missingLabels(row)} — Water & Energy → Configuración.</p>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex items-end justify-between">
                    <span className={`text-3xl font-bold tracking-tight ${STATUS_TEXT[row.status] || 'text-charcoal'}`}>{row.total_profile_water_mm} mm</span>
                    <span className="pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">agua en el perfil · 0–{row.measured_profile_depth_cm ?? row.root_zone_depth_cm} cm</span>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <p>Estado hídrico: <b>{row.status || 'Sin configurar'}</b></p>
                    <p>Agua útil en zona radicular: <b>{row.current_available_water_mm} mm</b></p>
                    <p>Déficit hasta objetivo: <b>{row.water_deficit_mm != null ? `${row.water_deficit_mm} mm` : 'Sin configurar'}</b></p>
                    <p>Última lectura: <b>{rel(row.lastReadingAt)}</b></p>
                    {row.missing_configuration?.length > 0 && <p className="text-amber-700">Falta configurar: {missingLabels(row)}</p>}
                  </div>
                </>
              )}
              <span className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900">Ver detalle <ChevronRight size={12} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}