import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { parseQr, stateLabel } from '@/services/irrigation/monitoringUtils';
import { QrScanner } from './QrTools';

export default function RegadorScanner({ token, onSelectToken }) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const validToken = token ? parseQr(token) : null;
  const query = useQuery({
    queryKey: ['irrigation-scanned-device', user?.id, user?.role, validToken],
    queryFn: () => monitoringService.scannedDevice(validToken),
    enabled: !!validToken,
    refetchInterval: 15000,
  });
  const device = query.data;
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { setConfirm(null); setError(''); setNotice(''); }, [token]);
  const act = async () => {
    if (!confirm || !device || busy) return;
    setBusy(true); setError('');
    try {
      await monitoringService.action(device.id, confirm.active, confirm.requestId);
      setConfirm(null); setNotice('Cambio de estado guardado.');
      await query.refetch();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-5">
    <h1 className="text-2xl font-bold">Escanear QR y cambiar estado</h1>
    {!online && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Sin conexión. Reconectate para confirmar el cambio de estado.</p>}
    {!token && <QrScanner onFound={onSelectToken} />}
    {token && <>
      {validToken && query.isLoading && <p role="status">Leyendo equipo…</p>}
      {(!validToken || (!query.isLoading && !query.error && !device)) && <p role="alert" className="text-sm text-red-700">El QR no corresponde a un equipo disponible.</p>}
      {query.error && <p role="alert" className="text-sm text-red-700">No se pudo leer el equipo. <button onClick={() => query.refetch()} className="underline">Reintentar</button></p>}
      {device && <div className="space-y-4 rounded-2xl border bg-white p-5">
        <p className="text-sm text-slate-500">{device.kind === 'well' ? 'Pozo' : 'Válvula'}</p>
        <h2 className="text-2xl font-bold">{device.name}</h2>
        <p className="font-semibold">Estado: {stateLabel(device)}</p>
        <div className="grid grid-cols-2 gap-2">{[true, false].map(active => <button key={String(active)} disabled={busy || !online || !!query.error || device.current_active === active} onClick={() => { setError(''); setNotice(''); setConfirm({ active, requestId: crypto.randomUUID() }); }} className={`rounded-xl px-3 py-3 font-bold text-white disabled:opacity-35 ${active ? 'bg-green-600' : 'bg-red-600'}`}>{device.kind === 'well' ? (active ? 'Encender' : 'Apagar') : (active ? 'Abrir' : 'Cerrar')}</button>)}</div>
        {confirm && <div className="space-y-3 border-t pt-4">
          <p>Confirmar: <b>{stateLabel(device, confirm.active)}</b> · {device.name}</p>
          <button disabled={busy || !online} onClick={act} className="w-full rounded-xl bg-emerald-900 py-3 font-bold text-white disabled:opacity-35">{busy ? 'Guardando…' : 'Confirmar cambio'}</button>
          <button disabled={busy} onClick={() => { setConfirm(null); setError(''); }} className="text-sm underline">Cancelar</button>
        </div>}
      </div>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} onClick={() => onSelectToken(null)} className="w-full rounded-xl border bg-white py-3 font-bold disabled:opacity-35">Escanear otro QR</button>
    </>}
  </section>;
}
