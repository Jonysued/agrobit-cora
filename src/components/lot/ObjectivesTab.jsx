import React,{useState} from 'react';
import { base44 } from '@/api/base44Client';
import { lotMetrics, theoreticalPlants } from '@/lib/farmCalculations';
export default function ObjectivesTab({lot,data}){
  const current=data.Campaign.find(c=>c.is_current)?.name||data.Campaign[data.Campaign.length-1]?.name||'';
  const [form,setForm]=useState({campaign:current,kg_ha:'',estimated_kg_ha:'',total_kg:'',kg_plant:'',category_1_pct:'',max_discard_pct:'',caliber:'',brix:'',comments:''});
  const [busy,setBusy]=useState(false);
  const rows=[...(data.Objective||[])].filter(x=>x.lot_id===lot.id).sort((a,b)=>b.campaign.localeCompare(a.campaign));
  const set=(k,v)=>setForm({...form,[k]:v});
  const add=async e=>{
    e.preventDefault();setBusy(true);
    const plants=theoreticalPlants(lot);
    const payload={
      lot_id:lot.id,campaign:form.campaign,
      kg_ha:Number(form.kg_ha),estimated_kg_ha:Number(form.estimated_kg_ha),
      total_kg:Number(form.total_kg)||Number(form.kg_ha)*lot.area_ha,
      kg_plant:Number(form.kg_plant)||Number(form.kg_ha)*lot.area_ha/plants,
      category_1_pct:form.category_1_pct?Number(form.category_1_pct):undefined,
      max_discard_pct:form.max_discard_pct?Number(form.max_discard_pct):undefined,
      caliber:form.caliber?Number(form.caliber):undefined,
      brix:form.brix?Number(form.brix):undefined,
      comments:form.comments||undefined,
    };
    await base44.entities.Objective.create(payload);
    await data.refetch();
    setForm({...form,kg_ha:'',estimated_kg_ha:'',total_kg:'',kg_plant:'',category_1_pct:'',max_discard_pct:'',caliber:'',brix:'',comments:''});
    setBusy(false);
  };
  const f=(k,label,type='text',opt=false)=> <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">{label}{opt&&<span className="font-normal normal-case text-slate-400">(opcional)</span>}<input type={type} value={form[k]??''} onChange={e=>set(k,e.target.value)} required={!opt} className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>;
  return <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
    <form onSubmit={add} className="h-fit rounded-2xl border bg-white p-5">
      <h2 className="font-bold">Definir objetivo</h2>
      <p className="mt-1 text-xs text-slate-500">Meta productiva y de calidad por campaña.</p>
      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Campaña<select value={form.campaign} onChange={e=>set('campaign',e.target.value)} className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800">{data.Campaign.map(c=><option key={c.id}>{c.name}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">{f('kg_ha','kg/ha objetivo','number')}{f('estimated_kg_ha','kg/ha estimado','number')}</div>
        <div className="grid grid-cols-2 gap-3">{f('total_kg','Total kg (opc.)','number',true)}{f('kg_plant','kg/planta (opc.)','number',true)}</div>
        <div className="grid grid-cols-2 gap-3">{f('category_1_pct','Cat. 1 %','number',true)}{f('max_discard_pct','Descarte máx. %','number',true)}</div>
        <div className="grid grid-cols-2 gap-3">{f('caliber','Calibre','number',true)}{f('brix','Brix','number',true)}</div>
        <label className="grid gap-1 text-xs font-bold uppercase text-slate-500">Comentarios<textarea value={form.comments} onChange={e=>set('comments',e.target.value)} rows="2" className="rounded-xl border px-3 py-2 text-sm normal-case text-slate-800"/></label>
      </div>
      <button disabled={busy} className="mt-4 w-full rounded-xl bg-emerald-900 py-2 font-bold text-white">{busy?'Guardando…':'Guardar objetivo'}</button>
    </form>
    <div className="space-y-3">
      {rows.map(o=>{
        const compl=o.kg_ha?Math.round((o.estimated_kg_ha/o.kg_ha)*100):0;
        const tone=compl>=100?'bg-emerald-100 text-emerald-800':compl>=75?'bg-amber-100 text-amber-800':'bg-rose-100 text-rose-800';
        return <article key={o.id} className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between"><b className="text-lg">Campaña {o.campaign}</b><span className={`rounded-lg px-3 py-1 text-sm font-bold ${tone}`}>{compl}% proyección</span></div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            {[['kg/ha objetivo',o.kg_ha?.toLocaleString()],['kg/ha estimado',o.estimated_kg_ha?.toLocaleString()],['Total kg',o.total_kg?.toLocaleString()],['kg/planta',o.kg_plant?.toFixed(1)],[ 'Cat. 1',o.category_1_pct?`${o.category_1_pct}%`:'-'],['Descarte máx.',o.max_discard_pct?`${o.max_discard_pct}%`:'-'],['Calibre',o.caliber],[ 'Brix',o.brix]].map(([a,b])=><div key={a}><p className="text-xs text-slate-500">{a}</p><b>{b??'-'}</b></div>)}
          </div>
          {o.comments&&<p className="mt-3 text-sm text-slate-600">{o.comments}</p>}
        </article>;
      })}
      {!rows.length&&<p className="text-slate-500">Aún no hay objetivos definidos para este lote.</p>}
    </div>
  </div>;
}