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
  const lerp=(a,b,t)=>Math.round(a+(b-a)*t),toHex=x=>x.toString(16).padStart(2,'0');
  const gradColor=(mn,mx,v)=>{if(!mx||mx===mn||v==null)return '#eab308';const t=(v-mn)/(mx-mn);const r=t<=.5?lerp(220,234,t*2):lerp(234,22,(t-.5)*2),g=t<=.5?lerp(38,179,t*2):lerp(179,163,(t-.5)*2),b=t<=.5?lerp(38,8,t*2):lerp(8,74,(t-.5)*2);return `#${toHex(r)}${toHex(g)}${toHex(b)}`};
  const rangesByCrop=(vals)=>{const map={};lots.forEach(l=>{const v=vals(l);if(v==null||isNaN(v))return;((map[l.crop]||=[]).push(v));});const r={};for(const c in map)r[c]=map[c].length?[Math.min(...map[c]),Math.max(...map[c])]:[0,0];return r;};
  const trendValue=(m)=>{const a=m.history.filter(p=>!p.estimated).slice(-3).map(p=>p.kg_ha);const ds=a.map((v,i)=>i?v-a[i-1]:0).slice(1);return ds.length?ds.reduce((x,y)=>x+y,0)/ds.length:0};
  const metricRanges=(pick)=>rangesByCrop(l=>{const m=lotMetrics(l,d.ProductionRecord,d.Objective,d.HealthRecord);const v=pick(m);return v==null||isNaN(v)?null:v});
  const gradForCrop=(pick)=>{const r=metricRanges(pick);return(l,v)=>gradColor((r[l.crop]||[0,0])[0],(r[l.crop]||[0,0])[1],v)};
  const gLast=gradForCrop(m=>m.last?.kg_ha),gMean5=gradForCrop(m=>m.mean5),gBest=gradForCrop(m=>m.best?.kg_ha),gEst=gradForCrop(m=>m.objective?.estimated_kg_ha),gTrend=gradForCrop(trendValue),gKgPlant=gradForCrop(m=>(m.last?.kg_plant||0)*700);
  const healthVal=(l)=>{const inc=d.HealthRecord.filter(h=>h.lot_id===l.id);const severe=inc.filter(h=>h.incidence==='Alta').length;return -(inc.length+severe*2);};
  const healthRanges=rangesByCrop(healthVal);
  const toMin=t=>{const [h,m]=t.split(':').map(Number);return h*60+m;};
  const now=new Date();
  const todayIso=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const nowMin=now.getHours()*60+now.getMinutes();
  const wateringNow=new Set(),wateringLater=new Set();
  (d.IrrigationProgram||[]).forEach(p=>{
    if(p.date!==todayIso||!p.start_time||!p.duration_min||!(p.status==='Programado'||p.status==='Activo'))return;
    const s=toMin(p.start_time),e=s+Number(p.duration_min);
    (p.lot_ids||[]).forEach(id=>{if(nowMin>=s&&nowMin<e)wateringNow.add(id);else if(nowMin<s)wateringLater.add(id);});
  });
  const color=(l)=>{const m=lotMetrics(l,d.ProductionRecord,d.Objective,d.HealthRecord);if(view==='Riego activo/programado')return wateringNow.has(l.id)?'#2563eb':wateringLater.has(l.id)?'#eab308':'#94a3b8';if(view==='Estado sanitario')return gradColor((healthRanges[l.crop]||[0,0])[0],(healthRanges[l.crop]||[0,0])[1],healthVal(l));if(view==='Problemas sanitarios recurrentes'){const n=d.HealthRecord.filter(h=>h.lot_id===l.id).length;return n<2?'#16a34a':n<3?'#eab308':'#dc2626'}if(view==='Cumplimiento del objetivo')return m.compliance>=100?'#16a34a':m.compliance>=85?'#eab308':'#dc2626';if(view==='Tendencia productiva')return gTrend(l,trendValue(m));const metric=view==='Producción estimada campaña actual'?m.objective?.estimated_kg_ha:view==='Promedio 5 campañas'?m.mean5:view==='Mejor campaña histórica'?m.best?.kg_ha:view==='Objetivo campaña actual'?m.objective?.kg_ha:view==='kg/planta'?(m.last?.kg_plant||0)*700:m.last?.kg_ha;if(!['Cultivo','Variedad','Edad','Año de plantación','Densidad'].includes(view)){if(view==='Producción última campaña'||view==='kg/ha')return gLast(l,metric);if(view==='Promedio 5 campañas')return gMean5(l,metric);if(view==='Mejor campaña histórica')return gBest(l,metric);if(view==='Producción estimada campaña actual')return gEst(l,metric);if(view==='kg/planta')return gKgPlant(l,metric);return metric>=ranges.high?'#16a34a':metric>=ranges.low?'#eab308':'#dc2626';}const key=view==='Variedad'?l.variety:view==='Cultivo'?l.crop:view==='Edad'?new Date().getFullYear()-l.planting_year:view==='Densidad'?10000/(l.row_spacing*l.plant_spacing):l.planting_year;return categorical[Math.abs(String(key).split('').reduce((a,c)=>a+c.charCodeAt(0),0))%categorical.length]};
  const center=lots[0]?.polygon?.[0]||[-33.03,-68.88];
  const startDraw=()=>{setMode('draw');setDraft([]);setSelected(null);};
  const startEdit=(l)=>{setEditLot(l);setDraft(l.polygon.map(p=>[...p]));setMode('edit');setSelected(null);};
  const finishDraw=()=>{if(draft.length>=3){setShowForm(true);}};
  const saveEdit=async()=>{await base44.entities.Lot.update(editLot.id,{polygon:draft,area_ha:+polygonAreaHa(draft).toFixed(1)});await d.refetch();setMode('view');setEditLot(null);setDraft([]);};
  const delLot=async()=>{const id=confirmDel.id;await Promise.all([base44.entities.Lot.delete(id),base44.entities.ProductionRecord.deleteMany({lot_id:id}),base44.entities.Objective.deleteMany({lot_id:id}),base44.entities.HealthRecord.deleteMany({lot_id:id}),base44.entities.IrrigationDesign.deleteMany({lot_id:id}),base44.entities.LotDocument.deleteMany({lot_id:id}),base44.entities.Observation.deleteMany({lot_id:id})]);await d.refetch();setConfirmDel(null);setSelected(null);};
  return <div className="relative h-[calc(100vh-4rem)]">
    <MapContainer center={center} zoom={15} className="h-full w-full" zoomControl doubleClickZoom={false}>
      <TileLayer attribution="&copy; Esri" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"/>
      {lots.map(l=><Polygon key={l.id} positions={mode==='edit'&&editLot?.id===l.id?draft:l.polygon} pathOptions={{color:'#fff',weight:2,fillColor:color(l),fillOpacity:.62}} interactive={mode==='view'} eventHandlers={{click:()=>setSelected(l)}}><Tooltip permanent direction="center" className="lot-label">{l.name}</Tooltip></Polygon>)}
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

    {mode==='view' && <div className="absolute bottom-5 right-4 z-[1000] rounded-xl bg-white/95 px-4 py-3 text-xs shadow-xl"><b>{lots.length} lotes visibles</b><p className="mt-1 text-slate-500">Clic en un lote para ver opciones.</p>{view==='Riego activo/programado'&&<p className="mt-2 flex flex-col gap-1 border-t pt-2"><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{background:'#2563eb'}}/>Riego en curso</span><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{background:'#eab308'}}/>Programado hoy (más tarde)</span><span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded" style={{background:'#94a3b8'}}/>Sin riego hoy</span></p>}</div>}

    {selected && mode==='view' && <div className="absolute bottom-5 left-4 z-[1000] flex w-[min(420px,calc(100%-2rem))] items-center gap-3 rounded-2xl bg-white p-4 shadow-2xl">
      <div className="min-w-0 flex-1"><b className="truncate">{selected.name} · {selected.farm}</b><p className="truncate text-sm text-slate-500">{selected.crop} {selected.variety} · {selected.area_ha} ha</p></div>
      <Btn onClick={()=>nav(`/lotes/${selected.id}`)}><FileText size={15}/>Ficha</Btn>
      <Btn onClick={()=>setSelected(null)}><X size={15}/></Btn>
    </div>}

    {showForm && <LotFormModal polygon={draft} onSaved={d.refetch} onClose={()=>{setShowForm(false);setMode('view');setDraft([]);}}/>}

    {confirmDel && <div className="fixed inset-0 z-[2000] grid place-items-center bg-black/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl"><h3 className="text-lg font-bold">Eliminar {confirmDel.name}</h3><p className="mt-2 text-sm text-slate-500">Se borrarán también su historial productivo, sanitario, objetivos, riego, documentos y observaciones.</p><div className="mt-5 flex gap-2"><button onClick={()=>setConfirmDel(null)} className="flex-1 rounded-xl border py-2 font-bold">Cancelar</button><button onClick={delLot} className="flex-1 rounded-xl bg-red-600 py-2 font-bold text-white">Eliminar</button></div></div></div>}
  </div>;
}