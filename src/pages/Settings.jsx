import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, History, Upload } from 'lucide-react';
import { backend } from '@/api/backendClient';
import { useFarm } from '@/lib/FarmContext';
import LoadingState from '@/components/LoadingState';
import Production from '@/pages/Production';

const types = {
  lotes: 'Lot',
  produccion: 'ProductionRecord',
  objetivos: 'Objective',
  sanidad: 'HealthRecord',
  riego: 'IrrigationDesign',
};

export default function Settings() {
  const d = useFarm();
  const [params, setParams] = useSearchParams();
  const activeTab = params.get('tab') === 'produccion' ? 'produccion' : 'administracion';
  const [type, setType] = useState('lotes');
  const [busy, setBusy] = useState(false);
  const [ranges, setRanges] = useState(() => JSON.parse(localStorage.getItem('mapRanges') || '{"low":30000,"high":38000}'));

  if (d.loading) return <LoadingState />;

  const selectTab = tab => {
    if (tab === 'administracion') setParams({});
    else setParams({ tab });
  };

  const load = async event => {
    const file = event.target.files[0];
    if (!file) return;
    setBusy(true);
    const text = await file.text();
    const [head, ...lines] = text.trim().split(/\r?\n/);
    const keys = head.split(',').map(item => item.trim());
    const rows = lines.map(line => Object.fromEntries(line.split(',').map((value, index) => [keys[index], value.trim()])));
    await backend.entities[types[type]].bulkCreate(rows);
    await d.refetch();
    setBusy(false);
  };

  return (
    <div className={`mx-auto p-5 lg:p-8 ${activeTab === 'produccion' ? 'max-w-[1400px]' : 'max-w-[1000px]'}`}>
      <p className="text-sm font-bold uppercase tracking-widest text-emerald-700">Administración</p>
      <h1 className="text-3xl font-bold">Configuración</h1>

      <nav className="my-6 flex gap-2 overflow-x-auto">
        {[
          ['administracion', 'Configuración general', Database],
          ['produccion', 'Históricos de producción', History],
        ].map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => selectTab(value)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${activeTab === value ? 'bg-emerald-900 text-white shadow-sm' : 'border bg-white text-slate-600 hover:bg-emerald-50'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </nav>

      {activeTab === 'produccion' ? (
        <Production embedded />
      ) : (
        <>
          <section className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">Importación masiva CSV</h2>
            <p className="mt-1 text-sm text-slate-500">Cargá maestros e históricos sin ingresar registros uno por uno.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <select value={type} onChange={event => setType(event.target.value)} className="rounded-xl border px-4 py-3">
                {Object.keys(types).map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
              </select>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-900 px-4 py-3 font-bold text-white">
                <Upload size={17} />{busy ? 'Importando…' : 'Elegir CSV'}
                <input type="file" accept=".csv" onChange={load} className="hidden" />
              </label>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Rangos del mapa productivo</h2>
            <p className="mt-1 text-sm text-slate-500">Definí los cortes de desempeño en kg/ha.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm font-bold">Límite rojo<input type="number" value={ranges.low} onChange={event => setRanges({ ...ranges, low: Number(event.target.value) })} className="rounded-xl border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm font-bold">Inicio verde<input type="number" value={ranges.high} onChange={event => setRanges({ ...ranges, high: Number(event.target.value) })} className="rounded-xl border px-3 py-2" /></label>
              <button onClick={() => localStorage.setItem('mapRanges', JSON.stringify(ranges))} className="rounded-xl bg-emerald-900 px-4 py-2 font-bold text-white">Guardar rangos</button>
            </div>
          </section>

          <section className="mt-5 rounded-2xl border bg-white p-6">
            <h2 className="text-xl font-bold">Campañas</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {d.Campaign.map(campaign => <span key={campaign.id} className={`rounded-full px-4 py-2 text-sm font-bold ${campaign.is_current ? 'bg-emerald-900 text-white' : 'bg-slate-100'}`}>{campaign.name}{campaign.is_current ? ' · actual' : ''}</span>)}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
