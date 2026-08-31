import React,{useMemo,useState} from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, Check, FileText } from 'lucide-react';
import { useFarm } from '@/lib/FarmContext';
import { lotMetrics, polygonAreaHa } from '@/lib/farmCalculations';
import { base44 } from '@/api/base44Client';
import MapFilters from '@/components/MapFilters';
import LoadingState from '@/components/LoadingState';
import { DrawLayer, EditLayer } from '@/components/map/MapEditing';
import LotFormModal from '@/components/map/LotFormModal';
const categorical=['#15803d','#2563eb','#7c3aed','#c2410c','#0f766e','#be123c'];
const Btn=({onClick,children,primary,danger})=><button onClick={onClick} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold shadow-lg ${danger?'bg-red-600 text-white':primary?'bg-emerald-900 text-white':'bg-white text-slate-700'}`}>{children}</button>;
export default function MapPage(){
  const d=useFarm(),nav=useNavigate();
  const [view,setView]=useState('Cultivo'),[filters,setFilters]=useState({});
  const [mode,setMode]=useState('view'); // view | draw | edit
  const [draft,setDraft]=useState([]),[selected,setSelected]=useState(null),[editLot,setEditLot]=useState(null),[showForm,setShowForm]=useState(false),[confirmDel,setConfirmDel]=useState(null);
  const ranges=JSON.parse(localStorage.getItem('mapRanges')||'{"low":30000,"high":38000}');
  const lots=useMemo(()=> (d.Lot||[]).filter(l=>Object.entries(filters).every(([k,v])=>!v||(k==='age'?String(new Date().getFullYear()-l.planting_year)===v:String(l[k])===v))),[d.Lot,filters]);
  if(d.loading)return <LoadingState/>;
  const color=(l)=>{const m=lotMetrics(l,d.ProductionRecord,d.Objective,d.HealthRecord);if(view==='Estado sanitario')return m.healthState==='Bueno'?'#16a34a':m.healthState==='Intermedio'?'#eab308':'#dc2626';if(view==='Problemas sanitarios recurrentes'){const n=d.HealthRecord.filter(h=>h.lot_id===l.id).length;return n<2?'#16a34a':n<3?'#eab308':'#dc2626'}if(view==='Cumplimiento del objetivo')return m.compliance>=100?'#16a34a':m.compliance>=85?'#eab308':'#dc2626';if(view==='Tendencia productiva')return m.trend==='Creciente'?'#16a34a':m.trend==='Decreciente'?'#dc2626':'#eab308';const metric=view==='Producción estimada campaña actual'?m.objective?.estimated_kg_ha:view==='Promedio 5 campañas'?m.mean5:view==='Mejor campaña histórica'?m.best?.kg_ha:view==='Objetivo campaña actual'?m.objective?.kg_ha:view==='kg/planta'?(m.last?.kg_plant||0)*700:m.last?.kg_ha;if(!['Cultivo','Variedad','Edad','Año de plantación','Densidad'].includes(view))return metric>=ranges.high?'#16a34a':metric>=ranges.low?'#eab308':'#dc2626';const key=view==='Variedad'?l.variety:view==='Cultivo'?l.crop:view==='Edad'?new Date().getFullYear()-l.planting_year:view==='Densidad'?10000/(l.row_spacing*l.plant_spacing):l.planting_year;return categorical[Math.abs(String(key).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%categorical.length]};
  const center=lots[0]?.polygon?.[0]||[-33.03,-68.88];
  const startDraw=()=>{setMode('draw');setDraft([]);setSelected(null);};
  const startEdit=(l)=>{setEditLot(l);setDraft(l.polygon.map(p=>[...p]));setMode('edit');setSelected(null);};
  const finishDraw=()=>{if(draft.length>=3){setShowForm(true);}};
  const saveEdit=async()=>{await base44.entities.Lot.update(editLot.id,{polygon:draft,area_ha:+polygonAreaHa(draft).toFixed(1)});await d.refetch();setMode('view');setEditLot(null);setDraft([]);};
  const delLot=async()=>{const id=confirmDel.id;await Promise.all([base44.entities.Lot.delete(id),base44.entities.ProductionRecord.deleteMany({lot_id:id}),base44.entities.Objective.deleteMany({lot_id:id}),base44.entities.HealthRecord.deleteMany({lot_id:id}),base44.entities.IrrigationDesign.deleteMany({lot_id:id}),base44.entities.LotDocument.deleteMany({lot_id:id}),base44.entities.Observation.deleteMany({lot_id:id})]);await d.refetch();setConfirmDel(null);setSelected(null);};
  return <div className="relative h-[calc(100vh-4rem)]">
    <MapContainer center={center} zoom={15} className="h-full w-full" zoomControl doubleClickZoom={false}>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"/>
      {lots.map(l=><Polygon key={l.id} positions={mode==='edit'&&editLot?.id===l.id?draft:l.polygon} pathOptions={{color:'#fff',weight:2,fillColor:color(l),fillOpacity:.62}} interactive={mode==='view'} eventHandlers={{click:()=>setSelected(l)}}><Tooltip permanent direction="center" className="lot-label">{l.code}</Tooltip></Polygon>)}
      {mode==='draw'&&<DrawLayer points={draft} setPoints={setDraft} onFinish={finishDraw}/>}
      {mode==='edit'&&editLot&&<EditLayer points={draft} setPoints={setDraft}/>}
    </MapContainer>

    {mode==='view' && <div className="absolute left-4 top-4 z-[1000] w-[min(360px,calc(100%-2rem))]"><MapFilters view={view} setView={setView} filters={filters} setFilters={setFilters} lots={d.Lot||[]}/></div>}

    <div className="absolute right-4 top-4 z-[1000] flex gap-2">
      {mode==='view' && <Btn onClick={startDraw} primary><Plus size={16}/>Nuevo lote</Btn>}
      {mode==='draw' && <><Btn onClick={finishDraw} primary disabled={draft.length<3}><Check size={16}/>Finalizar</Btn><Btn onClick={()=>{setMode('view');setDraft([]);}}><X size={16}/>Cancelar</Btn></>}
      {mode==='edit' && <><Btn onClick={saveEdit} primary><Check size={16}/>Guardar</Btn><Btn onClick={()=>{setMode('view');setEditLot(null);setDraft([]);}}><X size={16}/>Cancelar</Btn></>}
    </div>

    {mode==='draw' && <div className="absolute bottom-5 left-1/2 z-[1000] -translate-x-1/2 rounded-xl bg-white/95 px-4 py-3 text-sm shadow-xl">Clic para agregar vértices · doble clic o “Finalizar” para terminar ({draft.length} puntos)</div>}

    {mode==='view' && <div className="absolute bottom-5 right-4 z-[1000] rounded-xl bg-white/95 px-4 py-3 text-xs shadow-xl"><b>{lots.length} lotes visibles</b><p className="mt-1 text-slate-500">Clic en un lote para ver opciones.</p></div>}

    {selected && mode==='view' && <div className="absolute bottom-5 left-4 z-[1000] flex w-[min(420px,calc(100%-2rem))] items-center gap-3 rounded-2xl bg-white p-4 shadow-2xl">
      <div className="min-w-0 flex-1"><b className="truncate">{selected.code} · {selected.name}</b><p className="truncate text-sm text-slate-500">{selected.crop} {selected.variety} · {selected.area_ha} ha</p></div>
      <Btn onClick={()=>nav(`/lotes/${selected.id}`)}><FileText size={15}/>Ficha</Btn>
      <Btn onClick={()=>startEdit(selected)}><Pencil size={15}/>Editar</Btn>
      <Btn danger onClick={()=>setConfirmDel(selected)}><Trash2 size={15}/></Btn>
      <Btn onClick={()=>setSelected(null)}><X size={15}/></Btn>
    </div>}

    {showForm && <LotFormModal polygon={draft} onSaved={d.refetch} onClose={()=>{setShowForm(false);setMode('view');setDraft([]);}}/>}

    {confirmDel && <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"><h3 className="text-lg font-bold">Eliminar {confirmDel.code}</h3><p className="mt-2 text-sm text-slate-500">Se borrarán también su historial productivo, sanitario, objetivos, riego, documentos y observaciones.</p><div className="mt-5 flex gap-2"><button onClick={()=>setConfirmDel(null)} className="flex-1 rounded-xl border py-2 font-bold">Cancelar</button><button onClick={delLot} className="flex-1 rounded-xl bg-red-600 py-2 font-bold text-white">Eliminar</button></div></div></div>}
  </div>;
}