import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { deviceStatus } from '@/services/irrigation/monitoringUtils';
import { devicePosition, deviceSector } from '@/services/irrigation/sectorGeometry';
function MapControl({ points, onPick }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    map.invalidateSize();
    if (points.length > 1) map.fitBounds(points, { padding: [35, 35], maxZoom: 17 });
    else if (points.length === 1) map.setView(points[0], 16);
  }, [map, key]);
  useMapEvents({ click: e => onPick?.(e.latlng) });
  return null;
}
export default function DeviceMap({ devices, allDevices = devices, lots = [], onSelect, onPick, draft }) {
  const located = devices.map(d => ({ device: d, position: devicePosition(d, lots) })).filter(d => d.position);
  const polygons = lots.filter(l => l.polygon?.length > 2);
  const points = useMemo(() => draft ? [[draft.lat, draft.lng]] : located.length
    ? located.map(d => d.position) : polygons.flatMap(l => l.polygon), [devices, lots, draft]);
  return <div className="relative isolate z-0 overflow-hidden rounded-xl border border-slate-200">
    <MapContainer center={points[0] || [-32.1, -68.5]} zoom={13} className={onPick ? 'h-64 w-full' : 'h-[440px] w-full'} scrollWheelZoom>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <MapControl points={points} onPick={onPick} />
      {polygons.map(l => <Polygon key={l.id} positions={l.polygon} pathOptions={{ color: '#e2e8f0', weight: 1, fillOpacity: 0.08 }}><Tooltip>{l.name}</Tooltip></Polygon>)}
      {!onPick && devices.filter(d => d.kind === 'valve').map(d => {
        const sector = deviceSector(d, lots), status = deviceStatus(d, allDevices);
        return sector.length ? <Polygon key={`sector-${d.id}`} positions={sector} pathOptions={{ color: status.color, weight: 2, fillOpacity: 0.2 }} eventHandlers={{ click: () => onSelect?.(d) }}><Tooltip>{d.name} · {d.turno || 'Sin turno registrado'} · {status.label}</Tooltip></Polygon> : null;
      })}
      {located.map(({ device: d, position }) => {
        const status = deviceStatus(d, allDevices);
        const icon = L.divIcon({ className: '', iconSize: [32, 32], iconAnchor: [16, 16], html: `<div style="width:32px;height:32px;border:3px solid white;box-shadow:0 2px 6px #0008;border-radius:${d.kind === 'well' ? '50%' : '6px'};background:${status.color};color:white;text-align:center;line-height:26px;font-weight:800;font-size:14px">${d.kind === 'well' ? 'P' : 'V'}</div>` });
        return <Marker key={d.id} position={position} icon={icon} eventHandlers={{ click: () => onSelect?.(d) }}><Tooltip>{d.name} · {status.label}{d.latitude == null ? ' · Centro de referencia' : ''}</Tooltip></Marker>;
      })}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={L.divIcon({ className: '', iconSize: [22, 22], html: '<div style="width:22px;height:22px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px #2563eb55"></div>' })} />}
    </MapContainer>
    {onPick && <p className="absolute bottom-5 left-2 z-[400] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold">Tocá el mapa para ubicar el equipo</p>}
  </div>;
}
