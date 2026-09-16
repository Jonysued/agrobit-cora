import React, { useEffect, useState } from 'react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import { waterForecastService, sensorService, energyService } from '@/services/waterEnergy';
import ProfileSection from '@/components/waterEnergy/config/ProfileSection';
import SensorSection from '@/components/waterEnergy/config/SensorSection';
import PumpSection from '@/components/waterEnergy/config/PumpSection';
import TariffSection from '@/components/waterEnergy/config/TariffSection';
import LinkSection from '@/components/waterEnergy/config/LinkSection';

export default function WaterEnergyConfig() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const refresh = async () => {
    const [lots, profiles, sensors, pumps, tariffs] = await Promise.all([
      waterForecastService.getLots(),
      waterForecastService.getProfiles(),
      sensorService.getSensors(),
      energyService.getPumps(),
      energyService.getTariffs(),
    ]);
    setData({ lots, profiles, sensors, pumps, tariffs });
  };
  useEffect(() => { refresh().catch(() => setError(true)); }, []);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la configuración.</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div className="space-y-5">
        <ProfileSection lots={data.lots} profiles={data.profiles} onChange={refresh} />
        <SensorSection lots={data.lots} sensors={data.sensors} onChange={refresh} />
        <PumpSection lots={data.lots} pumps={data.pumps} onChange={refresh} />
        <TariffSection tariffs={data.tariffs} onChange={refresh} />
        <LinkSection lots={data.lots} profiles={data.profiles} sensors={data.sensors} onChange={refresh} />
      </div>
    </div>
  );
}