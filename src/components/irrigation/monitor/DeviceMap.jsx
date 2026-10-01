import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, Polygon, Pane, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { perimeterAreas } from '@/services/irrigation/perimeterAreas';
import { PORTION_LABELS } from '@/lib/irrigationTurnos';
import { devicePosition } from '@/services/irrigation/sectorGeometry';
import { deviceStatus } from '@/services/irrigation/monitoringUtils';
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
  const wells = located.filter(({ device }) => device.kind === 'well');
  const polygons = lots.filter(l => l.polygon?.length > 2);
  const points = useMemo(() => draft ? [[draft.lat, draft.lng]] : onPick && located.length
    ? located.map(d => d.position) : [...(areas.length ? areas.flatMap(a => a.positions) : polygons.flatMap(l => l.polygon)), ...wells.map(w => w.position)], [devices, lots, draft, onPick, areas]);
  return <div className="relative isolate z-0 overflow-hidden rounded-xl border border-slate-200">
    <MapContainer center={points[0] || [-32.1, -68.5]} zoom={13} className={onPick ? 'h-64 w-full' : 'h-[440px] w-full'} scrollWheelZoom>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
      <MapControl points={points} onPick={onPick} />
      <Pane name="lot-border-contrast" style={{ zIndex: 401, pointerEvents: 'none' }}>
        {polygons.map(l => <Polygon key={l.id} positions={l.polygon} interactive={false}
          pathOptions={{ color: '#0f172a', weight: 6, opacity: 0.95, fill: false, lineJoin: 'round' }} />)}
      </Pane>
      <Pane name="lot-borders" style={{ zIndex: 402 }}>
        {polygons.map(l => <Polygon key={l.id} positions={l.polygon}
          pathOptions={{ color: '#ffffff', weight: 3, opacity: 1, fillOpacity: 0.015, lineJoin: 'round' }}><Tooltip>{l.name}</Tooltip></Polygon>)}
      </Pane>
      {!onPick && <>
        <Pane name="irrigation-border-shadow" style={{ zIndex: 403, pointerEvents: 'none' }}>
          {areas.map(area => <Polygon key={area.key} positions={area.positions} interactive={false}
            pathOptions={{ color: '#0f172a', weight: area.device.id === selectedId ? 10 : 8, opacity: 1, fill: false, lineJoin: 'round' }} />)}
        </Pane>
        <Pane name="irrigation-border-contrast" style={{ zIndex: 404, pointerEvents: 'none' }}>
          {areas.map(area => <Polygon key={area.key} positions={area.positions} interactive={false}
            pathOptions={{ color: '#ffffff', weight: area.device.id === selectedId ? 8 : 6, opacity: 1, fill: false, lineJoin: 'round' }} />)}
        </Pane>
        <Pane name="irrigation-state-borders" style={{ zIndex: 405 }}>
      {areas.map(area => <Polygon key={area.key} positions={area.positions}
        pathOptions={{ color: area.status.color, weight: area.device.id === selectedId ? 6 : 4, opacity: 1, fillColor: area.status.color, fillOpacity: 0.035, lineJoin: 'round' }}
        eventHandlers={{ click: () => onSelect?.(area.device) }}>
        <Tooltip sticky>{area.lot.name} · {PORTION_LABELS[area.valve.portion || '']} · {area.device.name} · {area.status.label}{area.device.kind === 'well' ? ` · Válvula ${area.valve.name}` : ''}</Tooltip>
      </Polygon>)}
        </Pane>
      </>}
      {!onPick && wells.map(({ device, position }) => {
        const status = deviceStatus(device, allDevices), size = device.id === selectedId ? 24 : 18;
        return <Marker key={device.id} position={position} title={`${device.name} · ${status.label}`}
          icon={L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2], html: `<div style="width:${size}px;height:${size}px;background:${status.color};border:2px solid white;border-radius:50%;box-shadow:0 0 0 2px #0f172a"></div>` })}
          eventHandlers={{ click: () => onSelect?.(device) }}>
          <Tooltip direction="top">Pozo {device.name} · {status.label}</Tooltip>
        </Marker>;
      })}
      {onPick && located.map(({ device, position }) => <Marker key={device.id} position={position}
        icon={L.divIcon({ className: '', iconSize: [12, 12], iconAnchor: [6, 6], html: '<div style="width:12px;height:12px;background:#64748b;border:2px solid white;border-radius:50%"></div>' })}>
        <Tooltip>{device.name}</Tooltip>
      </Marker>)}
      {draft && <Marker position={[draft.lat, draft.lng]} icon={L.divIcon({ className: '', iconSize: [22, 22], html: '<div style="width:22px;height:22px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 4px #2563eb55"></div>' })} />}
    </MapContainer>
    {onPick && <p className="absolute bottom-5 left-2 z-[400] rounded-lg bg-white/95 px-3 py-2 text-xs font-semibold">Tocá el mapa para ubicar el equipo</p>}
  </div>;
}
