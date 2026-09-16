import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin } from 'lucide-react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import { soilWaterService } from '@/services/waterEnergy';

// MONITOREO DE SUELO — pantalla principal: un punto de monitoreo por
// tarjeta, solo información para la decisión de riego.
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

export default function WaterEnergySoil() {
  const nav = useNavigate();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  useEffect(() => { soilWaterService.getPointSummaries().then(setRows).catch(() => setErr(true)); }, []);
  if (!rows) return err ? <div className="p-6 text-sm text-slate-500">No se pudo cargar el monitoreo de suelo.</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div>
        <h2 className="text-lg font-bold text-charcoal">Monitoreo de Suelo</h2>
        <p className="text-xs text-slate-500">Comportamiento hídrico del perfil por punto de monitoreo — datos, interpretación y decisión de riego.</p>
      </div>
      {!rows.length ? (
        <div className="rounded-2xl border border-black/5 bg-white p-10 text-center shadow-sm">
          <MapPin className="mx-auto text-slate-300" size={32} />
          <p className="mt-3 text-sm font-semibold text-charcoal">Todavía no hay puntos de monitoreo</p>
          <p className="mt-1 text-xs text-slate-500">Un punto de monitoreo es una ubicación física del lote donde hay una sonda instalada a distintas profundidades.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <button key={row.point.id} type="button" onClick={() => nav(`/water-energy/suelo/${row.point.id}`)} className="rounded-2xl border border-black/5 bg-white p-5 text-left shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold text-charcoal">{row.point.name}</p>
                  <p className="text-xs text-slate-500">{row.lotName}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${SOURCE_BADGE[row.source] || SOURCE_BADGE.MANUAL}`}>{row.source}</span>
              </div>
              {row.missing ? (
                <p className="mt-5 text-xs text-slate-400">{row.missing}</p>
              ) : (
                <>
                  <div className="mt-4 flex items-end justify-between">
                    <span className={`text-3xl font-bold tracking-tight ${STATUS_TEXT[row.status] || ''}`}>{row.pct}%</span>
                    <span className="pb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">agua disponible</span>
                  </div>
                  <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <p>Estado hídrico: <b>{row.status}</b></p>
                    <p>Próximo riego: <b>{row.nextIrrigation ? `en ${row.nextIrrigation.days} día${row.nextIrrigation.days > 1 ? 's' : ''}` : 'sin riesgo a 7 días'}</b></p>
                    <p>Última lectura: <b>{rel(row.lastReadingAt)}</b></p>
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