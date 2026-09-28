// @ts-nocheck
// Calibración diaria a partir de TODO el historial disponible de la sonda.
// No presupone dónde está instalada: el vínculo ya está en soil_profiles.
import { serviceClient } from './backend.ts';
import { probeProfileSnapshots, estimateProbeDynamics } from './soilCalibrationMath.js';
import { aggregateGaritaObservations } from '../../../src/services/waterEnergy/garitaWeather.js';

const PAGE_SIZE = 1000;

async function pages(table, columns, configure) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = serviceClient.from(table).select(columns);
    query = configure(query).order('timestamp', { ascending: true })
      .order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    all.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return all;
  }
}

export async function calibrateAllSoilModels() {
  const [{ data: probes, error: probeError }, { data: currentModels, error: modelError },
    { data: stations, error: stationError }] = await Promise.all([
    serviceClient.from('soil_probes').select('*').eq('provider', 'sentek').eq('active', true),
    serviceClient.from('soil_behavior_models').select('*'),
    serviceClient.from('weather_stations').select('id,name,active'),
  ]);
  for (const error of [probeError, modelError, stationError]) {
    if (error) throw new Error(error.message);
  }
  const garita = stations.find(station => station.name?.trim().toLowerCase() === 'garita' && station.active !== false);
  if (!garita) throw new Error('No se encontró la estación Garita activa.');
  const observations = await pages('weather_observations', 'id,timestamp,rainfall_mm,eto_mm,et_day_mm',
    query => query.eq('weather_station_id', garita.id));
  const weather = aggregateGaritaObservations(observations).byDay;
  const models = [...currentModels];
  const results = [];
  for (const probe of probes) {
    try {
      let matching = models.filter(model => model.reference_probe_id === probe.id);
      if (!matching.length && probe.last_reading_at) {
        const { data, error } = await serviceClient.from('soil_behavior_models').insert({
          name: `Modelo de suelo · ${probe.name}`,
          reference_probe_id: probe.id,
          calibration_status: 'uncalibrated',
        }).select('*').single();
        if (error) throw new Error(error.message);
        matching = [data];
        models.push(data);
      }
      if (!matching.length) {
        results.push({ probe: probe.name, ok: true, status: 'sin_datos', models: 0 });
        continue;
      }
      const { data: channels, error: channelError } = await serviceClient.from('soil_probe_channels')
        .select('id,probe_id,sensor_type,depth_cm').eq('probe_id', probe.id).eq('sensor_type', 'soil_moisture');
      if (channelError) throw new Error(channelError.message);
      const readings = await pages('sensor_readings', 'id,timestamp,probe_channel_id,value',
        query => query.eq('probe_id', probe.id));
      const snapshots = probeProfileSnapshots(channels, readings);
      const byDay = new Map(snapshots.map(snapshot => [snapshot.day, snapshot]));
      const days = [...byDay.values()];
      const estimated = estimateProbeDynamics(days, weather, snapshots);
      const attemptAt = new Date().toISOString();
      for (const model of matching) {
        const summary = {
          ...estimated,
          method: 'probe_history_rise_and_fall',
          first_probe_day: days[0]?.day || null,
          last_probe_day: days.at(-1)?.day || null,
          last_probe_reading_at: probe.last_reading_at,
          weather_station: 'Garita',
        };
        const transitions = estimated.recharge_sample_count + estimated.depletion_sample_count;
        const status = days.length < 2 ? 'sin_datos'
          : transitions ? 'partial' : 'uncalibrated';
        const updates = {
          calibration_status: status,
          sample_count: transitions,
          recharge_sample_count: estimated.recharge_sample_count,
          depletion_sample_count: estimated.depletion_sample_count,
          calibration_diagnostics: summary,
          last_calibration_attempt_at: attemptAt,
        };
        // Sin lámina aplicada ni Kc del sitio de referencia no se pueden
        // inferir eficiencia de riego ni multiplicador absoluto de ETc.
        updates.recharge_efficiency = null;
        updates.etc_correction_factor = null;
        updates.depletion_rate_mm_day = estimated.depletion_rate_mm_day;
        if (transitions) updates.last_calibration_at = attemptAt;
        const { error } = await serviceClient.from('soil_behavior_models').update(updates).eq('id', model.id);
        if (error) throw new Error(error.message);
      }
      results.push({ probe: probe.name, ok: true, status: days.length < 2 ? 'sin_datos' : 'evaluated',
        models: matching.length, ...estimated });
    } catch (error) {
      results.push({ probe: probe.name, ok: false, message: error.message });
    }
  }
  return { ok: results.every(result => result.ok), calibrated: results, ran_at: new Date().toISOString() };
}
