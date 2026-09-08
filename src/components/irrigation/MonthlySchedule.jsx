import React,{useState} from 'react';
import { Check, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

const DAY_NAMES=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const JS_DAYS=[1,2,3,4,5,6,0];
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export default function MonthlySchedule({programs,logs,lots,onToggle}){
  const today=new Date();today.setHours(0,0,0,0);
  const [offset,setOffset]=useState(0);
  const view=new Date(today.getFullYear(),today.getMonth()+offset,1);
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const logMap={};(logs||[]).forEach(l=>logMap[`${l.program_id}_${l.date}`]=l);
  const lotNames=p=>(p.lot_ids||[]).map(id=>lots.find(l=>l.id===id)?.name).filter(Boolean).join(', ')||'—';
  const fmt=(t,min)=>{const [h,m]=t.split(':').map(Number);const e=(h*60+m+min)%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};
  const active=programs.filter(p=>p.status!=='Pausado');
  const eventsFor=d=>active.filter(p=>(p.days||[]).includes(d));
  // celdas del mes: lunes primero
  const first=new Date(view);const lead=(first.getDay()+6)%7;
  const daysInMonth=new Date(view.getFullYear(),view.getMonth()+1,0).getDate();
  const cells=[...Array(lead)].map(()=>null).concat([...Array(daysInMonth)].map((_,i)=>new Date(view.getFullYear(),view.getMonth(),i+1)));
  while(cells.length%7)cells.push(null);
  const monthEvents=cells.reduce((a,dt)=>dt?a+eventsFor(dt.getDay()).length:a,0);
  const monthMinutes=cells.reduce((a,dt)=>dt?a+eventsFor(dt.getDay()).reduce((x,p)=>x+(p.duration_min||0),0):a,0);
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><CalendarDays size={17} className="text-emerald-700"/>Cronograma mensual</h2>
        <div className="flex items-center gap-2">
          <p className="mr-2 text-xs font-bold text-slate-500">{monthEvents} riegos · {Math.round(monthMinutes/60*10)/10} h totales</p>
          <button onClick={()=>setOffset(o=>o-1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-emerald-500 hover:text-emerald-700"><ChevronLeft size={15}/></button>
          <b className="w-40 text-center text-sm capitalize">{MONTHS[view.getMonth()]} {view.getFullYear()}</b>
          <button onClick={()=>setOffset(o=>o+1)} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:border-emerald-500 hover:text-emerald-700"><ChevronRight size={15}/></button>
        </div>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {DAY_NAMES.map(d=><span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((dt,i)=>{
          if(!dt)return <div key={i} className="min-h-[90px] rounded-xl bg-slate-50/60"/>;
          const isToday=dt.getTime()===today.getTime(),isPast=dt<today;
          const items=eventsFor(dt.getDay());
          return (
            <div key={i} className={`min-h-[90px] rounded-xl border p-2 ${isToday?'border-emerald-600 bg-emerald-50/50':isPast?'border-slate-100 bg-slate-50':'border-slate-200 bg-white'}`}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <b className={`text-xs ${isToday?'text-emerald-800':isPast?'text-slate-400':'text-slate-600'}`}>{dt.getDate()}</b>
                {isToday&&<span className="text-[10px] font-bold text-emerald-700">hoy</span>}
              </div>
              <div className="space-y-1">
                {items.length?items.map(p=>{
                  const l=logMap[`${p.id}_${iso(dt)}`];
                  return (
                    <button key={p.id} onClick={()=>onToggle(p,dt,l)} title={`${lotNames(p)} · ${p.start_time}`} className={`flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight transition ${l?'border-emerald-600 bg-emerald-600 text-white':'border-slate-200 bg-white text-slate-700 hover:border-emerald-500'}`}>
                      {l&&<Check size={10} className="shrink-0"/>}
                      <span className="truncate">{lotNames(p)}</span>
                      <span className={`ml-auto shrink-0 ${l?'text-emerald-50':'text-slate-400'}`}>{p.start_time}</span>
                    </button>
                  );
                }):<p className="text-[10px] text-slate-300">—</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">Tocá un riego para marcarlo como realizado.</p>
    </section>
  );
}