import React, { useEffect, useState } from 'react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import PendingIrrigationList from '@/components/waterEnergy/PendingIrrigationList';
import LoadingState from '@/components/LoadingState';
import { backend } from '@/api/backendClient';
import { waterForecastService } from '@/services/waterEnergy';

// Pestaña "Riegos" de Water & Energy: TODOS los riegos a confirmar
// del sistema (programas de hoy o de fechas pasadas que todavía no
// tienen su IrrigationLog), agrupados en una sola lista centralizada.
export default function WaterEnergyIrrigation() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    setItems(null);
    setError(null);
    waterForecastService.getPendingIrrigations()
      .then(setItems)
      .catch(e => setError(e?.message || 'Error desconocido'));
  }, [reloadKey]);
  // Si el productor modifica el cronograma (IrrigationProgram), la
  // lista de riegos a confirmar se actualiza inmediatamente.
  useEffect(() => {
    const unsubscribe = backend.entities.IrrigationProgram.subscribe(() => setReloadKey(k => k + 1));
    return unsubscribe;
  }, []);
  if (!items) return error ? <div className="p-6 text-sm text-slate-500">{error}</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1400px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div>
        <h2 className="text-lg font-bold text-charcoal">Riegos a confirmar</h2>
        <p className="text-xs text-slate-500">Todos los lotes · riegos de hoy o de fechas pasadas sin ejecución confirmada.</p>
      </div>
      <PendingIrrigationList items={items} onConfirmed={() => setReloadKey(k => k + 1)} />
    </div>
  );
}