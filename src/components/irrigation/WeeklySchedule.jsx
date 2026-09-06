import React from 'react';
import { Check, CalendarDays } from 'lucide-react';

const DAY_NAMES=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const JS_DAYS=[1,2,3,4,5,6,0];

export default function WeeklySchedule({programs,logs,lots,onToggle}){
  const today=new Date();today.setHours(0,0,0,0);
  const monday=new Date(today);monday.setDate(today.getDate()-((today.getDay()+6)%7));
  const days=[...Array(7)].map((_,i)=>{const dt=new Date(monday);dt.setDate(monday.getDate()+i);return dt;});
  const iso=x=>`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;
  const logMap={};(logs||[]).forEach(l=>logMap[`${l.program_id}_${l.date}`]=l);
  const lotNames=p=>(p.lot_ids||[]).map(id=>lots.find(l=>l.id===id)?.name).filter(Boolean).join(', ')||'—';
  const fmt=(t,min)=>{const [h,m]=t.split(':').map(Number);const e=(h*60+m+min)%1440;return `${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};
  const active=programs.filter(p=>p.status!=='Pausado');
  const total=active.reduce((a,p)=>a+(p.days||[]).length,0);
  const minutes=active.reduce((a,p)=>a+(p.days||[]).length*(p.duration_min||0),0);
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-bold"><CalendarDays size={17} className="text-emerald-700"/>Cronograma de la semana</h2>
        <p className="text-xs font-bold text-slate-500">{total} riegos programados · {Math.round(minutes/60*10)/10} h totales</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((dt,i)=>{
          const isToday=dt.getTime()===today.getTime(),isPast=dt<today;
          const items=active.filter(p=>(p.days||[]).includes(JS_DAYS[i]));
          return (
            <div key={i} className={`min-h-[110px] rounded-xl border p-3 ${isToday?'border-emerald-600 bg-emerald-50/50':isPast?'bg-slate-50':'bg-white'}`}>
              <div className="mb-2 flex items-baseline justify-between">
                <b className={`text-sm ${isToday?'text-emerald-800':''}`}>{DAY_NAMES[i]}</b>
                <span className="text-[11px] text-slate-500">{dt.getDate()}/{dt.getMonth()+1}{isToday&&' · hoy'}</span>
              </div>
              <div className="space-y-2">
                {items.length?items.map(p=>{
                  const l=logMap[`${p.id}_${iso(dt)}`];
                  return (
                    <button key={p.id} onClick={()=>onToggle(p,dt,l)} className={`flex w-full flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left text-xs transition ${l?'border-emerald-600 bg-emerald-600 text-white':'border-slate-200 bg-white text-slate-700 hover:border-emerald-500'}`}>
                      <b className="flex items-center gap-1">{l&&<Check size={12}/>}{lotNames(p)}</b>
                      <span className={l?'text-emerald-50':'text-slate-500'}>{p.start_time}{p.duration_min?`–${fmt(p.start_time,p.duration_min)}`:''}</span>
                    </button>
                  );
                }):<p className="text-xs text-slate-400">Sin riego</p>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">Tocá un riego para marcarlo como realizado.</p>
    </section>
  );
}