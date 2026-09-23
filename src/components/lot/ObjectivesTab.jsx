import React,{useState} from 'react';
import { backend } from '@/api/backendClient';
import { theoreticalPlants } from '@/lib/farmCalculations';
import { Target, Plus, TrendingUp, Pencil, Trash2, X } from 'lucide-react';

const blank=campaign=>({campaign,kg_ha:'',estimated_kg_ha:'',total_kg:'',kg_plant:'',category_1_pct:'',max_discard_pct:'',caliber:'',brix:'',comments:''});

export default function ObjectivesTab({lot,data}){
  const current=data.Campaign.find(c=>c.is_current)?.name||data.Campaign[data.Campaign.length-1]?.name||'';
  const [form,setForm]=useState(blank(current));
  const [busy,setBusy]=useState(false),[editId,setEditId]=useState(null);
  const rows=[...(data.Objective||[])].filter(x=>x.lot_id===lot.id).sort((a,b)=>b.campaign.localeCompare(a.campaign));
  const plants=theoreticalPlants(lot);
  const set=(k,v)=>setForm({...form,[k]:v});
  const setKgHa=v=>{const n=Number(v)||0;setForm({...form,kg_ha:v,total_kg:String(Math.round(n*lot.area_ha)),kg_plant:String(Math.round(n*lot.area_ha/plants*100)/100)});};
  const startEdit=o=>{setEditId(o.id);setForm({campaign:o.campaign,kg_ha:String(o.kg_ha??''),estimated_kg_ha:String(o.estimated_kg_ha??''),total_kg:String(o.total_kg??''),kg_plant:String(o.kg_plant??''),category_1_pct:o.category_1_pct!=null?String(o.category_1_pct):'',max_discard_pct:o.max_discard_pct!=null?String(o.max_discard_pct):'',caliber:o.caliber!=null?String(o.caliber):'',brix:o.brix!=null?String(o.brix):'',comments:o.comments||''});};
  const cancelEdit=()=>{setEditId(null);setForm(blank(current));};
  const del=async o=>{await backend.entities.Objective.delete(o.id);await data.refetch();if(editId===o.id)cancelEdit();};
  const submit=async e=>{
    e.preventDefault();setBusy(true);
    const payload={
      campaign:form.campaign,
      kg_ha:Number(form.kg_ha),estimated_kg_ha:Number(form.estimated_kg_ha),
      total_kg:Number(form.total_kg)||Number(form.kg_ha)*lot.area_ha,
      kg_plant:Number(form.kg_plant)||Number(form.kg_ha)*lot.area_ha/plants,
      category_1_pct:form.category_1_pct?Number(form.category_1_pct):undefined,
      max_discard_pct:form.max_discard_pct?Number(form.max_discard_pct):undefined,
      caliber:form.caliber?Number(form.caliber):undefined,
      brix:form.brix?Number(form.brix):undefined,
      comments:form.comments||undefined,
    };
    if(editId) await backend.entities.Objective.update(editId,payload);
    else await backend.entities.Objective.create({lot_id:lot.id,...payload});
    await data.refetch();
    setBusy(false);
    if(editId)cancelEdit();else setForm(blank(form.campaign));
  };

  const field=(k,label,type='text',opt=false,onChange)=>(
    <div className="grid gap-1.5">
      <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}{opt&&<span className="ml-1 font-normal normal-case text-slate-400">· opcional</span>}</label>
      <input type={type} value={form[k]??''} onChange={onChange?e=>onChange(e.target.value):e=>set(k,e.target.value)} required={!opt} className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-2 focus:ring-emerald-200"/>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Formulario */}
      <form onSubmit={submit} className="h-fit self-start rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Target size={18}/></span>
            <div>
              <h2 className="text-base font-bold text-charcoal">{editId?'Editar objetivo':'Definir objetivo'}</h2>
              <p className="text-xs text-slate-500">Meta productiva y de calidad por campaña</p>
            </div>
          </div>
          {editId&&<button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>}
        </div>

        <div className="mt-5 space-y-4">
          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Campaña</label>
            <select value={form.campaign} onChange={e=>set('campaign',e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500">{data.Campaign.map(c=><option key={c.id}>{c.name}</option>)}</select>
          </div>

          <fieldset className="rounded-xl border border-emerald-200 p-4">
            <legend className="px-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Rendimiento</legend>
            <div className="grid grid-cols-2 gap-3">{field('kg_ha','kg/ha objetivo','number',false,setKgHa)}{field('estimated_kg_ha','kg/ha estimado','number')}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">{field('total_kg','Total kg','number',true)}{field('kg_plant','kg/planta','number',true)}</div>
          </fieldset>

          {lot.crop!=='Olivos' && (
          <fieldset className="rounded-xl border border-sand p-4">
            <legend className="px-2 text-[11px] font-bold uppercase tracking-wide text-charcoal">Calidad</legend>
            <div className="grid grid-cols-2 gap-3">{field('category_1_pct','Cat. 1 %','number',true)}{field('max_discard_pct','Descarte máx. %','number',true)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">{field('caliber','Calibre','number',true)}{field('brix','Brix','number',true)}</div>
          </fieldset>
          )}

          <div className="grid gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Comentarios</label>
            <textarea value={form.comments} onChange={e=>set('comments',e.target.value)} rows="2" placeholder="Notas sobre el objetivo…" className="resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-1 focus:ring-emerald-500"/>
          </div>
        </div>

        <button disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 py-2.5 font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">{busy?'Guardando…':editId?<><Pencil size={16}/>Guardar cambios</>:<><Plus size={16}/>Guardar objetivo</>}</button>
      </form>

      {/* Listado */}
      <div>
        {rows.length===0 ? (
          <div className="grid h-full min-h-[300px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center">
            <div>
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Target size={26}/></span>
              <p className="mt-4 font-bold text-charcoal">Sin objetivos definidos</p>
              <p className="mt-1 text-sm text-slate-500">Definí la meta productiva de la próxima campaña desde el panel izquierdo.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map(o=>{
              const compl=o.kg_ha?Math.min(150,Math.round((o.estimated_kg_ha/o.kg_ha)*100)):0;
              const status=compl>=100?{label:'En línea',cls:'bg-emerald-600'}:compl>=75?{label:'Cercano',cls:'bg-amber-500'}:{label:'Lejano',cls:'bg-rose-500'};
              const metrics=[
                {k:'kg/ha objetivo',v:o.kg_ha?.toLocaleString(),pri:true},
                {k:'kg/ha estimado',v:o.estimated_kg_ha?.toLocaleString(),pri:true},
                {k:'Total kg',v:o.total_kg?o.total_kg.toLocaleString():'-'},
                {k:'kg/planta',v:o.kg_plant?o.kg_plant.toFixed(1):'-'},
                ...(lot.crop!=='Olivos'?[
                  {k:'Cat. 1',v:o.category_1_pct!=null?`${o.category_1_pct}%`:'-'},
                  {k:'Descarte máx.',v:o.max_discard_pct!=null?`${o.max_discard_pct}%`:'-'},
                  {k:'Calibre',v:o.caliber??'-'},
                  {k:'Brix',v:o.brix??'-'},
                ]:[]),
              ];
              return (
                <article key={o.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${editId===o.id?'ring-2 ring-emerald-700':''}`}>
                  <header className="flex items-center justify-between bg-emerald-950 px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                      <TrendingUp size={18}/>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-200">Campaña</p>
                        <h3 className="text-lg font-bold leading-tight">{o.campaign}</h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-emerald-200">Proyección</p>
                        <p className="text-2xl font-bold leading-none">{compl}%</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${status.cls}`}>{status.label}</span>
                      <div className="ml-1 flex gap-2">
                        <button onClick={()=>startEdit(o)} className="text-emerald-200 hover:text-white"><Pencil size={16}/></button>
                        <button onClick={()=>del(o)} className="text-emerald-200 hover:text-rose-400"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  </header>
                  <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
                    {metrics.map(m=>(
                      <div key={m.k} className={`bg-white p-4 ${m.pri?'bg-emerald-50/40':''}`}>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{m.k}</p>
                        <p className={`mt-1 ${m.pri?'text-lg font-bold text-emerald-800':'text-base font-semibold text-charcoal'}`}>{m.v??'-'}</p>
                      </div>
                    ))}
                  </div>
                  {o.comments&&<p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">{o.comments}</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}