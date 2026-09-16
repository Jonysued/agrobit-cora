import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Save } from 'lucide-react';
import ConfigPanel, { Field, inputCls } from './ConfigPanel';
import { weatherService } from '@/services/waterEnergy/weatherService';

// Centro por defecto: zona Retamito, San Juan (aprox.) hasta elegir ubicación.
const DEFAULT_CENTER = [-31.55, -68.36];
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#065f46;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function MapClick({ onPick }) {
  useMapEvents({ click: e => onPick(e.latlng) });
  return null;
}

// Ubicación meteorológica de cada finca: se marca en el mapa y se guarda
// lat/lon en la finca. Con la ubicación, el pronóstico pasa a ser real.
export default function FarmLocationSection({ lots, farms, onChange }) {
  const names = [...new Set([...(lots || []).map(l => l.farm).filter(Boolean), ...(farms || []).map(f => f.name)])];
  const [name, setName] = useState(names[0] || '');
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [saving, setSaving] = useState(false);
  const farm = (farms || []).find(f => f.name === name);
  useEffect(() => { setLat(farm?.latitude ?? null); setLon(farm?.longitude ?? null); }, [farm?.id]);
  const pick = ll => { setLat(Number(ll.lat.toFixed(5))); setLon(Number(ll.lng.toFixed(5))); };
  const useGps = () => navigator.geolocation?.getCurrentPosition(pos => pick({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
  const save = async () => {
    setSaving(true);
    if (farm) await weatherService.saveFarmLocation(farm.id, lat, lon);
    else await weatherService.createFarmLocation(name, lat, lon);
    setSaving(false);
    onChange();
  };
  const center = lat != null && lon != null ? [lat, lon] : DEFAULT_CENTER;
  return (
    <ConfigPanel title="Ubicación meteorológica" description="Elegí la finca y marcala en el mapa: click en el mapa, arrastrá el marcador o usá tu ubicación actual. Con la ubicación configurada, el pronóstico pasa a ser real (Open-Meteo) en lugar de simulado.">
      {!names.length ? (
        <p className="text-sm text-slate-400">Todavía no hay fincas cargadas en los lotes.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-3">
            <Field label="Finca">
              <select value={name} onChange={e => setName(e.target.value)} className={inputCls}>
                {names.map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <button type="button" onClick={useGps} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              <Crosshair size={14} /> Usar mi ubicación actual
            </button>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
              Coordenadas: <b>{lat != null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : 'sin ubicación — hacé click en el mapa'}</b>
              <br />Pronóstico: <b>{lat != null ? 'Open-Meteo (real)' : 'simulado'}</b>
            </p>
            <button type="button" onClick={save} disabled={saving || lat == null} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">
              <Save size={15} /> {saving ? 'Guardando…' : 'Guardar ubicación'}
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <MapContainer key={`${center[0]},${center[1]}`} center={center} zoom={12} scrollWheelZoom className="h-64 w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
              <MapClick onPick={pick} />
              {lat != null && lon != null && <Marker position={[lat, lon]} icon={pinIcon} draggable eventHandlers={{ dragend: e => pick(e.target.getLatLng()) }} />}
            </MapContainer>
          </div>
        </div>
      )}
    </ConfigPanel>
  );
}