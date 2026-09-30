import React,{useState, lazy, Suspense} from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarDays, Radio } from 'lucide-react';
const IrrigationMonitor = lazy(() => import('@/components/irrigation/monitor/IrrigationMonitor'));
import { useFarm } from '@/lib/FarmContext';
import { useAuth } from '@/lib/AuthContext';
import { backend } from '@/api/backendClient';
import LoadingState from '@/components/LoadingState';
import ProgramForm from '@/components/irrigation/ProgramForm';
import ProgramList from '@/components/irrigation/ProgramList';
import MonthlySchedule from '@/components/irrigation/MonthlySchedule';

export default function Irrigation(){
  const d=useFarm();
  const {user}=useAuth();
  const regador=user?.role==='regador';
  const [edit,setEdit]=useState(null);
  const [params, setParams] = useSearchParams();
  const tab = regador || params.get("tab") === "monitoreo" ? "monitoreo" : "cronograma";
  const selectTab = value => { const next = new URLSearchParams(params); next.set("tab", value); if (value !== "monitoreo") next.delete("equipo"); setParams(next); };
  const selectToken = token => { const next = new URLSearchParams(params); next.set("tab", "monitoreo"); if (token) next.set("equipo", token); else next.delete("equipo"); setParams(next); };
  if(d.loading)return <LoadingState/>;
  const lots=d.Lot||[],designs=d.IrrigationDesign||[];
  const programs=[...(d.IrrigationProgram||[])].sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
  const iso=dt=>{const x=new Date(dt);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const toggle=async(p,day,log)=>{
    if(log) await backend.entities.IrrigationLog.delete(log.id);
    else await backend.entities.IrrigationLog.create({program_id:p.id,date:iso(day)});
    await d.refetch();
  };
  return <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
    <div className="mb-7">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-emerald-700">Manejo del recurso hídrico</p>
      <h1 className="text-3xl font-bold tracking-tight">Riego</h1>
    </div>
    <div role="tablist" aria-label="Secciones de riego" className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {[["cronograma", "Cronograma de riegos", CalendarDays], ["monitoreo", "Monitoreo de riegos", Radio]].filter(([value]) => !regador || value === 'monitoreo').map(([value, label, Icon]) => <button key={value} id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`panel-${value}`} onClick={() => selectTab(value)} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === value ? 'bg-emerald-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}><Icon size={17}/>{label}</button>)}
    </div>
    {tab === 'monitoreo' ? <div role="tabpanel" id="panel-monitoreo" aria-labelledby="tab-monitoreo"><Suspense fallback={<LoadingState/>}><IrrigationMonitor lots={lots} token={params.get('equipo')} onSelectToken={selectToken}/></Suspense></div> : <div role="tabpanel" id="panel-cronograma" aria-labelledby="tab-cronograma" className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <ProgramForm key={edit?.id||'new'} lots={lots} designs={designs} programs={programs} edit={edit}
        onSaved={async()=>{setEdit(null);await d.refetch();}}
        onCancel={()=>setEdit(null)}/>
      <div className="space-y-6">
        <MonthlySchedule programs={programs} logs={d.IrrigationLog||[]} lots={lots} onToggle={toggle}/>
        <ProgramList programs={programs} lots={lots} onEdit={p=>{setEdit(p);window.scrollTo({top:0,behavior:'smooth'});}} onChange={d.refetch}/>
      </div>
    </div>}
  </div>;
}