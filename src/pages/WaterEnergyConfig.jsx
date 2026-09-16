import React, { useEffect, useState } from 'react';
import ModuleHeader from '@/components/waterEnergy/ModuleHeader';
import LoadingState from '@/components/LoadingState';
import { waterForecastService, sensorService, energyService, weatherService } from '@/services/waterEnergy';
import ProfileSection from '@/components/waterEnergy/config/ProfileSection';
import SensorSection from '@/components/waterEnergy/config/SensorSection';
import PumpSection from '@/components/waterEnergy/config/PumpSection';
import TariffSection from '@/components/waterEnergy/config/TariffSection';
import LinkSection from '@/components/waterEnergy/config/LinkSection';
import FarmLocationSection from '@/components/waterEnergy/config/FarmLocationSection';
import WeatherSourceSection from '@/components/waterEnergy/config/WeatherSourceSection';
import WeatherStationSection from '@/components/waterEnergy/config/WeatherStationSection';

export default function WaterEnergyConfig() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const refresh = async () => {
    const lots = await waterForecastService.getLots();
    const [profiles, probes, pumps, tariffs, weather] = await Promise.all([
      waterForecastService.getProfiles(),
      sensorService.getProbes(),
      energyService.getPumps(),
      energyService.getTariffs(),
      weatherService.getConfig(lots.map(l => l.farm)),
    ]);
    setData({ lots, profiles, probes, pumps, tariffs, farms: weather.farms, stations: weather.stations });
  };
  useEffect(() => { refresh().catch(() => setError(true)); }, []);
  if (!data) return error ? <div className="p-6 text-sm text-slate-500">No se pudo cargar la configuración.</div> : <LoadingState />;
  return (
    <div className="mx-auto max-w-[1200px] space-y-5 p-4 md:p-6">
      <ModuleHeader />
      <div className="space-y-5">
        <ProfileSection lots={data.lots} profiles={data.profiles} onChange={refresh} />
        <SensorSection lots={data.lots} probes={data.probes} onChange={refresh} />
        <PumpSection lots={data.lots} pumps={data.pumps} onChange={refresh} />
        <TariffSection tariffs={data.tariffs} onChange={refresh} />
        <LinkSection lots={data.lots} profiles={data.profiles} probes={data.probes} pumps={data.pumps} onChange={refresh} />
        <FarmLocationSection lots={data.lots} farms={data.farms} onChange={refresh} />
        <WeatherSourceSection lots={data.lots} farms={data.farms} stations={data.stations} onChange={refresh} />
        <WeatherStationSection farms={data.farms} stations={data.stations} onChange={refresh} />
      </div>
    </div>
  );
}