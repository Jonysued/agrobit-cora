import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { perimeterAreas } from '@/services/irrigation/perimeterAreas';
import { PORTION_LABELS } from '@/lib/irrigationTurnos';
import { devicePosition } from '@/services/irrigation/sectorGeometry';
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
export default function DeviceMap({ devices, allDevices = devices, lots = [], onSelect, onPick, draft, selectedId }) {
  const areas = useMemo(() => perimeterAreas(devices, allDevices, lots), [devices, allDevices, lots]);
  const located = devices.map(d => ({ device: d, position: devicePosition(d, lots) })).filter(d => d.position);
  const polygons = lots.filter(l => l.polygon?.length > 2);
  const points = useMemo(() => draft ? [[draft.lat, draft.lng]] : onPick && located.length
    ? located.map(d => d.position) : areas.length ? areas.flatMap(a => a.positions) : polygons.flatMap(l => l.polygon), [devices, lots, draft, onPick, areas]);
  return <div className="relative isolate z-0 overflow-hidden rounded-xl border border-slate-200">
    <MapContainer center={points[0] || [-32.1, -68.5]} zoom={13} className={onPick ? 'h-64 w-full' : 'h-[440px] w-full'} scrollWheelZoom>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <MapControl points={points} onPick={onPick} />
      {polygons.map(l => <Polygon key={l.id} positions={l.polygon} pathOptions={{ color: '#e2e8f0', weight: 1, fillOpacity: 0.015 }}><Tooltip>{l.name}</Tooltip></Polygon>)}
      {!onPick && areas.map(area => <Polygon key={area.key} positions={area.positions}
        pathOptions={{ color: area.status.color, weight: area.device.id === selectedId ? 5 : 3, opacity: 1, fillColor: area.status.color, fillOpacity: 0.035 }}
        eventHandlers={{ click: () => onSelect?.(area.device) }}>
        <Tooltip sticky>{area.lot.name} · {PORTION_LABELS[area.valve.portion || '']} · {area.device.name} · {area.status.label}{area.device.kind === 'well' ? ` · Válvula ${area.valve.name}` : ''}</Tooltip>
      </Polygon>)}
      {onPick && located.map(({ device, position }) => <Marker key={device.id} position={position}
        icon={L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div style="width:12px;height:12px;background:#64748b;border:2px solid white;border-radius:50%"></div>' })}>
        <Tooltip>{device.name}</Tooltip>
      </Marker>)}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={L.divIcon({ className: '', iconSize: [22, 22], html: '<div style="width:22px;height:22px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px #2563eb55"></div>' })} />}
    </MapContainer>
    {onPick && <p className="absolute bottom-5 left-2 z-[400] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold">Tocá el mapa para ubicar el equipo</p>}
  </div>;
}
