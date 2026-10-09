import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Polygon, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export function readMapView(farm) {
  try { const saved = JSON.parse(sessionStorage.getItem(`lucient:map-view:${farm || 'all'}`)); return saved && Number.isFinite(saved.zoom) && saved.center?.every(Number.isFinite) ? saved : null; } catch { return null; }
}

export function MapViewport({ lots, farm = '', persist = false }) {
  const map = useMap();
  const shape = JSON.stringify(lots.map(l => l.polygon));
  useEffect(() => {
    const saved = persist ? readMapView(farm) : null;
    if (saved) map.setView(saved.center, saved.zoom);
    else {
      const points = lots.flatMap(l => l.polygon || []);
      if (points.length) map.fitBounds(points, { padding: [20, 20], maxZoom: 16 });
    }
  }, [map, farm, shape, persist]);
  useMapEvents({ moveend: () => {
    if (!persist) return;
    try { const center = map.getCenter(); sessionStorage.setItem(`lucient:map-view:${farm || 'all'}`, JSON.stringify({ center: [center.lat, center.lng], zoom: map.getZoom() })); } catch { /* mapa utilizable sin almacenamiento */ }
  } });
  return null;
}

export default function DashboardMap({ lots, rows, farm }) {
  const navigate = useNavigate();
  const mapped = lots.filter(l => l.polygon?.length >= 3);
  const states = new Map(rows.map(r => [r.lot.id, r]));
  const color = lot => {
    const r = states.get(lot.id);
    if (r?.forecast_status !== 'ok' || !Number.isFinite(r.state?.available_water_percent)) return '#94a3b8';
    if (r.state.current_available_water_mm <= r.state.recharge_threshold_mm) return '#dc2626';
    return r.recommendation ? '#eab308' : '#15803d';
  };
  return <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
    <div className="flex items-center justify-between gap-3 p-4"><h2 className="font-bold">Mapa del campo</h2><Link to={`/mapa?finca=${encodeURIComponent(farm || '')}`} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Ver mapa completo</Link></div>
    {mapped.length ? <div className="relative isolate h-[260px] sm:h-[320px]"><MapContainer center={mapped[0].polygon[0]} zoom={14} className="h-full w-full" scrollWheelZoom={false} dragging={false} zoomControl={false} doubleClickZoom={false} touchZoom={false} keyboard={false}>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <MapViewport lots={mapped} farm={farm} />
      {mapped.map(l => <Polygon key={l.id} positions={l.polygon} pathOptions={{ color: '#fff', weight: 2, fillColor: color(l), fillOpacity: 0.65 }} eventHandlers={{ click: () => navigate(`/lotes/${l.id}`) }}><Tooltip>{l.name}</Tooltip></Polygon>)}
    </MapContainer></div> : <p className="p-6 text-sm text-slate-500">No hay lotes con perímetro para esta selección.</p>}
    <p className="flex flex-wrap gap-x-4 gap-y-1 p-3 text-xs text-slate-500">{[['#dc2626', 'Bajo umbral'], ['#eab308', 'Riego recomendado'], ['#15803d', 'Sobre umbral'], ['#94a3b8', 'Sin datos']].map(([c, label]) => <span key={label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />{label}</span>)}</p>
  </section>;
}
