import React, { useState } from 'react';
import { Upload, Download, LoaderCircle } from 'lucide-react';
import { backend } from '@/api/backendClient';
import * as XLSX from 'xlsx';

const HEADERS = ['lote', 'campaña', 'total_kg', 'kg_ha', 'kg_planta', 'categoria_1_pct', 'categoria_2_pct', 'descarte_pct', 'calibre_promedio', 'brix', 'calidad_comercial', 'fecha_inicio_cosecha', 'fecha_fin_cosecha', 'estimada', 'notas'];

export default function ProductionImport({ lots, onImported }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const downloadTemplate = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const blank = () => Array(HEADERS.length - 1).fill('').join(',');
    const rows = [
      HEADERS.join(','),
      `${esc('EJEMPLO (borrar esta fila)')},2023/24,185000,12300,12.3,82,10,6,18.2,16.5,Extra,15/01/2024,28/02/2024,no,Cosecha manual`,
      ...lots.map(l => `${esc(l.name)},${blank()}`)
    ];
    const blob = new Blob(['\ufeff' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla_produccion.csv';
    a.click();
  };

  const handleFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setBusy(true); setMsg(null);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(firstSheet, { defval: '', raw: false })
        .filter(r => r.lote && !String(r.lote).startsWith('EJEMPLO'));
      const byName = name => lots.find(l => l.name.toLowerCase() === String(name).toLowerCase());
      const payload = records.map(r => {
        const lot = byName(r.lote);
        if (!lot) return null;
        return {
          lot_id: lot.id,
          campaign: r.campaña || r.campaign,
          total_kg: Number(r.total_kg) || 0,
          kg_ha: Number(r.kg_ha) || 0,
          kg_plant: Number(r.kg_planta ?? r.kg_plant) || 0,
          category_1_pct: r.categoria_1_pct != null ? Number(r.categoria_1_pct) : undefined,
          category_2_pct: r.categoria_2_pct != null ? Number(r.categoria_2_pct) : undefined,
          discard_pct: r.descarte_pct != null ? Number(r.descarte_pct) : undefined,
          average_caliber: r.calibre_promedio != null ? Number(r.calibre_promedio) : undefined,
          average_brix: r.brix != null ? Number(r.brix) : undefined,
          commercial_quality: r.calidad_comercial || undefined,
          harvest_start: r.fecha_inicio_cosecha || undefined,
          harvest_end: r.fecha_fin_cosecha || undefined,
          estimated: r.estimada === true || r.estimada === 'si' || r.estimada === 'sí',
          notes: r.notas || undefined
        };
      }).filter(Boolean);
      if (!payload.length) { setMsg('No se encontraron registros válidos. Verifique que la columna "lote" coincida con los nombres de lotes.'); setBusy(false); return; }
      await backend.entities.ProductionRecord.bulkCreate(payload);
      await onImported();
      setMsg(`Se importaron ${payload.length} registros de producción.`);
    } catch (err) {
      setMsg('Error al importar: ' + (err?.message || 'revisá el formato del archivo.'));
    }
    setBusy(false);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <button onClick={downloadTemplate} className="flex items-center gap-2 rounded-xl border border-sand bg-white px-4 py-2.5 text-sm font-bold text-charcoal transition hover:bg-sand-light">
        <Download size={16} /> Descargar plantilla
      </button>
      <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800">
        {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? 'Importando…' : 'Adjuntar plantilla'}
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={busy} />
      </label>
      {msg && <span className="text-sm font-medium text-slate-600">{msg}</span>}
    </div>
  );
}
