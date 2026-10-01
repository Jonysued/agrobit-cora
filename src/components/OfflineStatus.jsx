import { isNative } from '@/lib/native';
import { isOnline } from '@/lib/connectivity';
import React, { useEffect, useState } from 'react';
import { Download, WifiOff, CloudUpload } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { watchOffline, flushOffline, retryOffline, startOfflineRuntime, snapshot, pendingOperations, resolvePending } from '@/lib/offline';
import { queryClientInstance } from '@/lib/query-client';
import { supabase } from '@/api/backendClient';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

let started = false;
export default function OfflineStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState({}), [online, setOnline] = useState(isOnline()), [install, setInstall] = useState(null), [help, setHelp] = useState(false);
  const [review, setReview] = useState(false), [pending, setPending] = useState([]), [reviewError, setReviewError] = useState('');
  const [installed, setInstalled] = useState(isNative || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
  useEffect(() => {
    if (!started) { startOfflineRuntime(); started = true; }
    const stop = watchOffline(setStatus);
    const network = () => setOnline(isOnline());
    const prompt = event => { event.preventDefault(); setInstall(event); };
    const done = () => { setInstalled(true); setInstall(null); };
    const synced = () => queryClientInstance.invalidateQueries();
    window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('beforeinstallprompt', prompt); window.addEventListener('appinstalled', done);
    window.addEventListener('lucient:offline-synced', synced);
    return () => { stop(); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('beforeinstallprompt', prompt); window.removeEventListener('appinstalled', done); window.removeEventListener('lucient:offline-synced', synced); };
  }, []);
  useEffect(() => {
    if (!user?.id) return;
    void flushOffline().catch(() => {});
    // Regadores never enumerate equipment or download map data.
    if (user.role === 'regador') return;
    Promise.all([monitoringService.devices(), snapshot('irrigation-map-lots', async () => {
      const { data, error } = await supabase.rpc('irrigation_map_lots'); if (error) throw error; return data || [];
    })]).catch(() => {});
  }, [user?.id, user?.role]);
  const openReview = async () => { setPending(await pendingOperations()); setReviewError(''); setReview(true); };
  const resolve = async (op, discard) => {
    const message = discard ? '¿Descartar este cambio guardado en el teléfono? No se enviará al servidor. Los cambios que dependen de él pueden requerir revisión.' : '¿Aplicar tu versión sobre los campos actuales del servidor? Se conservarán los campos que no editaste.';
    if (!window.confirm(message)) return;
    try { await resolvePending(op.requestId, discard); setPending(await pendingOperations()); setReviewError(''); } catch (error) { setReviewError(error.message); }
  };
  const installApp = async () => {
    if (!install) { setHelp(true); return; }
    await install.prompt(); await install.userChoice; setInstall(null);
  };
  if (!user) return null;
  return <>
    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs ${!online || status.pending || status.error ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-100 bg-emerald-50 text-emerald-900'}`} role="status">
      <span className="flex items-center gap-2">{!online ? <WifiOff size={15} /> : <CloudUpload size={15} />}{!online ? 'Sin conexión · datos guardados en este dispositivo' : status.syncing ? 'Sincronizando automáticamente…' : status.pending ? `${status.pending} cambio(s) pendiente(s) de sincronizar` : status.cached ? 'Mostrando última descarga · reconectando automáticamente' : status.ready ? 'App disponible sin conexión · sincronización automática' : 'Preparando la app para trabajar sin conexión…'}</span>
      <div className="flex gap-3">{status.error && <button onClick={openReview} className="font-bold underline">Revisar pendientes</button>}{status.error && <button onClick={() => retryOffline().catch(() => {})} className="font-bold underline">Reintentar cambio pendiente</button>}{!installed && <button onClick={installApp} className="flex items-center gap-1 font-bold"><Download size={14} />Instalar Lucient</button>}</div>
      {status.error && <p className="w-full font-semibold">Se conserva el cambio en este dispositivo: {status.error}</p>}
      {!online && <p className="w-full opacity-80">Los cambios se sincronizan con la app abierta cuando vuelve la conexión. {user.role === 'regador' ? 'Cada cambio queda pendiente hasta que el servidor lo confirme.' : isNative ? 'El satélite requiere conexión; clima y sondas muestran la última descarga.' : 'El satélite muestra solo las zonas ya visitadas; clima y sondas muestran la última descarga.'}</p>}
    </div>
    <Dialog open={review} onOpenChange={setReview}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar cambios pendientes</DialogTitle></DialogHeader><p className="text-sm">La sincronización conserva el orden de los cambios. Revisá el primero que muestra un error para continuar.</p>{reviewError && <p role="alert" className="text-sm text-red-700">{reviewError}</p>}{pending.map(op => <div className="rounded-lg border p-3 text-xs" key={op.requestId}><b>{op.table || (op.kind === 'irrigation' ? 'Estado de riego' : 'Archivo')} · {op.operation || (op.kind === 'irrigation' ? op.active ? 'Encendido / abierta' : 'Apagado / cerrada' : op.path)}</b><p className="mt-1 break-all">{op.id} {op.occurred_at}</p>{op.payload && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">{JSON.stringify(op.payload, null, 2)}</pre>}{op.error && <p className="mt-2 text-red-700">{op.error}</p>}<div className="mt-3 flex flex-wrap gap-4">{op.error && op.kind === 'entity' && op.operation !== 'create' && online && <button className="font-bold underline" onClick={() => resolve(op, false)}>Aplicar mi versión</button>}<button className="text-red-700 underline" onClick={() => resolve(op, true)}>Descartar este cambio</button></div></div>)}</DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>Instalar Lucient en tu teléfono</DialogTitle></DialogHeader><p className="text-sm"><b>Android:</b> abrí Lucient en Chrome y elegí “Instalar aplicación” o “Agregar a pantalla principal” en el menú.</p><p className="text-sm"><b>iPhone / iPad:</b> abrí Lucient en Safari, tocá Compartir y elegí “Agregar a pantalla de inicio”, con “Abrir como app” activado si aparece.</p><p className="text-sm">Después de instalar, abrí la app e iniciá sesión con conexión para descargar los datos. Visitá las secciones que necesitás offline antes de salir al campo.</p><p className="text-sm">Los registros quedan en este teléfono hasta enviarse. En iPhone, si cerrás la app, la sincronización continúa automáticamente al abrirla de nuevo con conexión. Conservá la app y sus datos hasta que no queden pendientes.</p></DialogContent></Dialog>
  </>;
}
