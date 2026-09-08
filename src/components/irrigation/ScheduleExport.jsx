import React,{useState} from 'react';
import { jsPDF } from 'jspdf';
import { FileDown } from 'lucide-react';

const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAY_NAMES=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const EMERALD=[74,125,78];

export default function ScheduleExport({programs,logs,lots}){
  const today=new Date();
  const [open,setOpen]=useState(false);
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [busy,setBusy]=useState(false);
  const years=[...new Set([...(programs||[]).map(p=>Number((p.date||'').slice(0,4))).filter(Boolean),today.getFullYear()])].sort();

  const buildPdf=()=>{
    setBusy(true);
    const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    const mm=String(month+1).padStart(2,'0');
    const monthProgs=[...(programs||[])].filter(p=>(p.date||'').startsWith(`${year}-${mm}`))
      .sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.start_time||'').localeCompare(b.start_time||''));
    const lotNames=p=>(p.lot_ids||[]).map(id=>lots.find(l=>l.id===id)?.name).filter(Boolean).join(', ')||'—';
    const fmtRange=p=>{if(!p.start_time)return '—';if(!p.duration_min)return p.start_time;const [h,m]=p.start_time.split(':').map(Number);const e=(h*60+m+p.duration_min)%1440;return `${p.start_time} – ${String(Math.floor(e/60)).padStart(2,'0')}:${String(e%60).padStart(2,'0')}`;};
    const isDone=p=>(logs||[]).some(l=>l.program_id===p.id&&l.date===p.date);
    const fmtDate=s=>{const d=new Date(`${s}T00:00:00`);return `${DAY_NAMES[(d.getDay()+6)%7]} ${String(d.getDate()).padStart(2,'0')}/${mm}`;};

    const drawTable=(startY,cols,rows)=>{
      let y=startY;
      const header=()=>{
        doc.setFillColor(...EMERALD);doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(9);
        let x=12;cols.forEach(c=>{doc.rect(x,y,c.w,7,'F');doc.text(String(c.t),x+1.5,y+4.6);x+=c.w;});
        y+=7;doc.setTextColor(40,40,40);doc.setFont('helvetica','normal');
      };
      header();
      rows.forEach((r,i)=>{
        const lines=cols.map((c,j)=>doc.splitTextToSize(String(r[j]??'—'),c.w-3));
        const rowH=Math.max(6.5,Math.max(...lines.map(l=>l.length))*4.3+2.2);
        if(y+rowH>280){doc.addPage('a4','landscape');y=20;header();}
        if(i%2===0){doc.setFillColor(243,247,243);let x=12;cols.forEach(c=>{doc.rect(x,y,c.w,rowH,'F');x+=c.w;});}
        let x=12;lines.forEach((l,j)=>{doc.text(l,x+1.5,y+4.6);x+=cols[j].w;});
        y+=rowH;
      });
      return y;
    };

    doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(...EMERALD);
    doc.text('Cronograma de riego',12,18);
    doc.setFontSize(11);doc.setTextColor(60,60,60);
    doc.text(`${MONTHS[month]} ${year}`,12,25);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(110,110,110);
    const totalMin=monthProgs.reduce((a,p)=>a+(p.duration_min||0),0);
    doc.text(`${monthProgs.length} programas · ${Math.round(totalMin/60*10)/10} h totales · generado el ${today.toLocaleDateString('es-AR')}`,12,31);

    const calRows=monthProgs.map(p=>[fmtDate(p.date),fmtRange(p),lotNames(p),p.well||'—',p.status||'—',isDone(p)?'Sí':'—']);
    let y=monthProgs.length?drawTable(38,[
      {t:'Fecha',w:26},{t:'Horario',w:32},{t:'Lotes',w:118},{t:'Pozo',w:30},{t:'Estado',w:26},{t:'Realizado',w:21}
    ],calRows):38;
    if(!monthProgs.length){doc.setFontSize(10);doc.setTextColor(130);doc.text('Sin programas configurados para este mes.',12,40);}

    doc.save(`cronograma-riego-${mm}-${year}.pdf`);
    setBusy(false);setOpen(false);
  };

  return (
    <div className="relative">
      <button onClick={()=>setOpen(o=>!o)} className="flex items-center gap-1.5 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-800">
        <FileDown size={13}/>Exportar PDF
      </button>
      {open&&(
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Elegir mes a exportar</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <select value={month} onChange={e=>setMonth(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500">
              {MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e=>setYear(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-emerald-500">
              {years.map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button onClick={buildPdf} disabled={busy} className="mt-3 w-full rounded-lg bg-emerald-900 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:opacity-60">
            {busy?'Generando…':'Descargar PDF'}
          </button>
        </div>
      )}
    </div>
  );
}