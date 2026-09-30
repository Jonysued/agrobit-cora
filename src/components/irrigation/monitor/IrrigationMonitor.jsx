import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, QrCode, MapPin, List, Printer, Radio } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { backend } from '@/api/backendClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { monitoringService } from '@/services/irrigation/monitoringService';
import { deviceStatus, dateTime } from '@/services/irrigation/monitoringUtils';
import DeviceMap from './DeviceMap';
import { devicePosition } from '@/services/irrigation/sectorGeometry';
import DeviceForm from './DeviceForm';
import DeviceDetail from './DeviceDetail';
import { QrScanner, downloadDeviceQrs } from './QrTools';
const button = 'flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40';
export default function IrrigationMonitor({ lots, token, onSelectToken }) {
  const { user } = useAuth(), client = useQueryClient(), detailRef = useRef(null);
  const [farm, setFarm] = useState(''), [kind, setKind] = useState(''), [search, setSearch] = useState(''), [view, setView] = useState('map');
  const [form, setForm] = useState(null), [scanner, setScanner] = useState(false), [error, setError] = useState(''), [printing, setPrinting] = useState(false), [online, setOnline] = useState(navigator.onLine);
  const admin = user?.role === 'admin';
  const query = useQuery({ queryKey: ['irrigation-monitor', 'devices'], queryFn: monitoringService.devices, refetchInterval: 15000 });
  const pumpsQuery = useQuery({ queryKey: ['irrigation-monitor', 'pumps'], queryFn: () => backend.entities.Pump.list(), enabled: admin && !!form });
  const devices = query.data || [], selected = devices.find(d => d.qr_token === token);
  useEffect(() => {
    const update = () => client.invalidateQueries({ queryKey: ['irrigation-monitor'] });
    const stop = monitoringService.subscribe(update);
    const network = () => { setOnline(navigator.onLine); if (navigator.onLine) update(); };
    const visible = () => { if (!document.hidden) update(); };
    window.addEventListener('online', network); window.addEventListener('offline', network); document.addEventListener('visibilitychange', visible); window.addEventListener('lucient:offline-synced', update); window.addEventListener('lucient:data-mutated', update);
    return () => { stop(); window.removeEventListener('online', network); window.removeEventListener('offline', network); document.removeEventListener('visibilitychange', visible); window.removeEventListener('lucient:offline-synced', update); window.removeEventListener('lucient:data-mutated', update); };
  }, [client]);
  useEffect(() => { if (selected) { setFarm(selected.farm); detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }, [token, selected?.id]);
  const visible = devices.filter(d => (!farm || d.farm === farm) && (!kind || d.kind === kind) && (!search || `${d.name} ${d.farm}`.toLowerCase().includes(search.toLowerCase())));
  const farmLots = lots.filter(l => !farm || l.farm === farm);
  const select = d => { setError(''); onSelectToken(d.qr_token); };
  const print = async () => { setPrinting(true); setError(''); try { await downloadDeviceQrs(visible); } catch { setError('No se pudieron generar los QRs. Intentá nuevamente.'); } finally { setPrinting(false); } };
  const stats = [
    { title: 'Pozos encendidos', value: visible.filter(d => d.kind === 'well' && d.current_active === true).length },
    { title: 'Válvulas regando', value: visible.filter(d => d.kind === 'valve' && deviceStatus(d, devices).effective).length },
    { title: 'Abiertas sin riego confirmado', value: visible.filter(d => d.kind === 'valve' && d.current_active === true && !deviceStatus(d, devices).effective).length },
    { title: 'Equipos sin ubicación', value: visible.filter(d => !devicePosition(d, lots)).length },
  ];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Monitoreo de riegos</h2><p className="mt-1 text-sm text-slate-500">Estado registrado en campo, ubicación y tiempo efectivo de riego.</p><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Radio size={12} />Actualización automática · {query.dataUpdatedAt ? `última lectura ${dateTime(query.dataUpdatedAt)}` : 'conectando…'}</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setScanner(true)} className="flex items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-bold text-white"><QrCode size={17} />Escanear QR</button><button disabled={!visible.length || printing} onClick={print} className={button}><Printer size={16} />{printing ? 'Generando…' : 'QRs para imprimir'}</button>{admin && <button onClick={() => setForm({})} className={button}><Plus size={16} />Nuevo equipo</button>}</div></div>
    {!online && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Sin conexión. Podés escanear y guardar estados en este teléfono. Se sincronizarán automáticamente al recuperar conexión. Los datos de otros dispositivos y el mapa satelital pueden estar desactualizados.</p>}
    {(error || query.error) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error || `No se pudo actualizar el monitoreo: ${query.error.message}. Se reintentará automáticamente.`}</p>}
    {token && !selected && !query.isLoading && !query.error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">El QR no corresponde a un equipo disponible. <button onClick={() => onSelectToken(null)} className="underline">Cerrar ficha</button></p>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{stats.map(s => <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-4"><b className="text-2xl">{s.value}</b><p className="mt-1 text-xs text-slate-500">{s.title}</p></div>)}</div>
    <div className="flex flex-wrap gap-2"><select aria-label="Filtrar por finca" value={farm} onChange={e => setFarm(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Todas las fincas</option>{[...new Set(devices.map(d => d.farm))].map(f => <option key={f}>{f}</option>)}</select><select aria-label="Filtrar por tipo" value={kind} onChange={e => setKind(e.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Pozos y válvulas</option><option value="well">Pozos</option><option value="valve">Válvulas</option></select><input aria-label="Buscar equipo" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar equipo…" className="min-w-0 rounded-lg border px-3 py-2 text-sm" /><div className="flex gap-1 rounded-lg border bg-white p-1"><button aria-pressed={view === 'map'} onClick={() => setView('map')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm ${view === 'map' ? 'bg-emerald-100 text-emerald-900' : ''}`}><MapPin size={15} />Mapa</button><button aria-pressed={view === 'list'} onClick={() => setView('list')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-sm ${view === 'list' ? 'bg-emerald-100 text-emerald-900' : ''}`}><List size={15} />Equipos</button></div></div>
    <div className={`grid items-start gap-5 ${selected ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : ''}`}>
      <div className="min-w-0 space-y-3">
        {view === 'map' && <><DeviceMap devices={visible} allDevices={devices} lots={farmLots} onSelect={select} /><div className="flex flex-wrap gap-4 text-xs text-slate-600">{[['#16a34a', 'Encendido / abierta con riego'], ['#dc2626', 'Apagado / cerrada'], ['#f97316', 'Abierta sin riego confirmado'], ['#64748b', 'Sin registro']].map(([color, label]) => <span key={color} className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />{label}</span>)}</div><p className="text-xs text-slate-500">P: pozo · V: válvula. Los sectores Este/Oeste o Norte/Sur dividen el lote en dos mitades. Cada válvula se ubica en el centro de su sector; la ubicación física puede ajustarse con “Editar / ubicar”.</p></>}
        <div className="overflow-hidden rounded-xl border bg-white"><div className="border-b px-4 py-3 text-sm font-bold">{visible.length} equipos{view === 'map' ? ' · tocar para operar o ubicar' : ''}</div>{query.isLoading && <p className="p-4 text-sm text-slate-500">Cargando equipos…</p>}{visible.map(d => {
          const s = deviceStatus(d, devices);
          return <button key={d.id} onClick={() => select(d)} className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-slate-50 ${d.id === selected?.id ? 'bg-emerald-50' : ''}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center font-bold text-white ${d.kind === 'well' ? 'rounded-full' : 'rounded-md'}`} style={{ backgroundColor: s.color }}>{d.kind === 'well' ? 'P' : 'V'}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{d.name} · {d.farm}</b><span className="text-xs text-slate-500">{s.label}{d._offline_pending ? ' · Pendiente de sincronizar' : ''}{d.turno ? ` · ${d.turno}` : ''}{!devicePosition(d, lots) ? ' · Sin ubicación' : d.latitude == null ? ' · Centro de referencia' : ''}</span></span><span className="text-xs font-semibold text-emerald-800">Abrir ficha</span></button>;
        })}{!query.isLoading && !visible.length && <p className="p-4 text-sm text-slate-500">No hay equipos que coincidan con la búsqueda.</p>}</div>
      </div>
      {selected && <div ref={detailRef}><DeviceDetail key={selected.id} device={selected} devices={devices} lots={lots} admin={admin} onEdit={setForm} /></div>}
    </div>
    <Dialog open={scanner} onOpenChange={setScanner}><DialogContent><DialogHeader><DialogTitle>Escanear equipo de riego</DialogTitle></DialogHeader>{scanner && <QrScanner onFound={t => { setScanner(false); onSelectToken(t); }} />}</DialogContent></Dialog>
    <Dialog open={!!form} onOpenChange={open => { if (!open) setForm(null); }}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>{form?.id ? 'Editar / ubicar equipo' : 'Nuevo equipo de riego'}</DialogTitle></DialogHeader>{form && <DeviceForm device={form.id ? form : null} devices={devices} lots={lots} pumps={pumpsQuery.data || []} onCancel={() => setForm(null)} onSaved={async () => { setForm(null); await client.invalidateQueries({ queryKey: ['irrigation-monitor'] }); }} />}</DialogContent></Dialog>
  </div>;
}
