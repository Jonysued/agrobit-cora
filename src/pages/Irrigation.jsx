import React,{useState} from 'react';
import { useFarm } from '@/lib/FarmContext';
import { base44 } from '@/api/base44Client';
import LoadingState from '@/components/LoadingState';
import ProgramForm from '@/components/irrigation/ProgramForm';
import ProgramList from '@/components/irrigation/ProgramList';
import MonthlySchedule from '@/components/irrigation/MonthlySchedule';

export default function Irrigation(){
  const d=useFarm();
  const [edit,setEdit]=useState(null);
  if(d.loading)return <LoadingState/>;
  const lots=d.Lot||[],designs=d.IrrigationDesign||[];
  const programs=[...(d.IrrigationProgram||[])].sort((a,b)=>(a.start_time||'').localeCompare(b.start_time||''));
  const iso=dt=>{const x=new Date(dt);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
  const toggle=async(p,day,log)=>{
    if(log) await base44.entities.IrrigationLog.delete(log.id);
    else await base44.entities.IrrigationLog.create({program_id:p.id,date:iso(day)});
    await d.refetch();
  };
  return <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
    <div className="mb-7">
      <p className="text-sm font-bold uppercase tracking-[.18em] text-emerald-700">Manejo del recurso hídrico</p>
      <h1 className="text-3xl font-bold tracking-tight">Riego</h1>
    </div>
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      <ProgramForm key={edit?.id||'new'} lots={lots} designs={designs} programs={programs} edit={edit}
        onSaved={async()=>{setEdit(null);await d.refetch();}}
        onCancel={()=>setEdit(null)}/>
      <div className="space-y-6">
        <MonthlySchedule programs={programs} logs={d.IrrigationLog||[]} lots={lots} onToggle={toggle}/>
        <ProgramList programs={programs} lots={lots} onEdit={p=>{setEdit(p);window.scrollTo({top:0,behavior:'smooth'});}} onChange={d.refetch}/>
      </div>
    </div>
  </div>;
}