import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, ShieldPlus, Trash2 } from 'lucide-react';

export default function HealthTab({lot,data}){
  const rows=data.HealthRecord.filter(x=>x.lot_id===lot.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const counts=rows.reduce((a,x)=>(a[x.problem]=(a[x.problem]||0)+1,a),{});
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({campaign:data.Campaign.find(c=>c.is_current)?.name||'',date:'',problem:'',incidence:'Baja',severity:'',affected_area_ha:'',status:'',treatment:'',result:'',notes:''});
  const set=(k,v)=>setForm({...form,[k]:v});

  const submit=async e=>{
    e.preventDefault();setBusy(true);
    const num=k=>form[k]===''||form[k]==null?undefined:Number(form[k]);
    await base44.entities.HealthRecord.create({
      lot_id:lot.id,campaign:form.campaign,date:form.date,problem:form.problem,
      incidence:form.incidence,severity:form.severity||undefined,affected_area_ha:num('affected_area_ha'),
      status:form.status||undefined,treatment:form.treatment||undefined,result:form.result||undefined,notes:form.notes||undefined,
    });
    await data.refetch();setBusy(false);setOpen(false);
    setForm({campaign:form.campaign,date:'',problem:'',incidence:'Baja',severity:'',affected_area_ha:'',status:'',treatment:'',result:'',notes:''});
  };

  const del=async id=>{await base44.entities.HealthRecord.delete(id);await data.refetch();};

  const f=(k,label,type='text',opt=false)=>(
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}{opt&&<span className="ml-1 font-normal normal-case text-slate-400">· opcional</span>}</label>
      <input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} required={!opt} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
    </div>
  );

  const incColor={'Baja':'bg-emerald-100 text-emerald-800','Media':'bg-amber-100 text-amber-800','Alta':'bg-red-100 text-red-800'};

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
      <section className="space-y-4">
        <div className="rounded-2xl bg-emerald-950 p-6 text-white">
          <h2 className="text-lg font-bold">Problemas recurrentes</h2>
          {Object.keys(counts).length===0&&<p className="mt-3 text-sm text-white/60">Sin registros de sanidad cargados.</p>}
          {Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([p,n])=>
            <p key={p} className="mt-4 rounded-xl bg-white/10 p-4 text-sm">Este lote presentó <b>{p}</b> en {n} {n===1?'campaña':'campañas'}.</p>)}
        </div>
        {!open
          ? <button onClick={()=>setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 py-5 font-bold text-emerald-800 transition hover:bg-emerald-50"><Plus size={18}/>Registrar problema de sanidad</button>
          : (
            <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><ShieldPlus size={18}/></span><h3 className="text-base font-bold text-charcoal">Nuevo registro de sanidad</h3></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Campaña</label>
                  <select value={form.campaign} onChange={e=>set('campaign',e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200">
                    {data.Campaign.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                {f('date','Fecha','date')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {f('problem','Problema / plaga')}
                <div className="grid gap-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Incidencia</label>
                  <select value={form.incidence} onChange={e=>set('incidence',e.target.value)} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200">
                    <option>Baja</option><option>Media</option><option>Alta</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {f('severity','Severidad',undefined,true)}
                {f('affected_area_ha','Superficie afectada (ha)','number',true)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {f('status','Estado',undefined,true)}
                {f('treatment','Tratamiento',undefined,true)}
              </div>
              {f('result','Resultado',undefined,true)}
              <div className="grid gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Observaciones</label>
                <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows="2" className="resize-none rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
              </div>
              <div className="flex gap-3">
                <button disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':'Guardar registro'}</button>
                <button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-slate-300 px-5 py-2.5 font-bold text-slate-600 transition hover:bg-slate-50">Cancelar</button>
              </div>
            </form>
          )}
      </section>

      <section className="space-y-3">
        {rows.length===0&&open===false&&<p className="grid place-items-center rounded-2xl border bg-white p-10 text-center text-slate-500">Aún no hay problemas de sanidad registrados.<br/>Usá «Registrar problema de sanidad» para cargar el primero.</p>}
        {rows.map(h=>(
          <article key={h.id} className="rounded-2xl border bg-white p-5">
            <div className="flex justify-between gap-3">
              <div>
                <b className="text-charcoal">{h.problem}</b>
                <p className="text-xs text-slate-500">{h.campaign} · {h.date}{h.severity?` · ${h.severity}`:''}{h.affected_area_ha!=null?` · ${h.affected_area_ha} ha`:''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${incColor[h.incidence]||'bg-slate-100'}`}>{h.incidence}</span>
                <button onClick={()=>del(h.id)} className="text-slate-300 transition hover:text-red-500"><Trash2 size={16}/></button>
              </div>
            </div>
            {(h.status||h.treatment)&&<p className="mt-2 text-xs text-slate-500">{h.status}{h.status&&h.treatment?' · ':''}{h.treatment}</p>}
            <p className="mt-3 text-sm text-slate-600">{h.notes||h.result||'Sin observaciones'}</p>
          </article>
        ))}
      </section>
    </div>
  );
}