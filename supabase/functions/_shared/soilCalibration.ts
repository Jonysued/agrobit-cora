// @ts-nocheck
// Calibración diaria en el servidor. Los lotes comparten parámetros de
// respuesta del suelo, nunca la humedad absoluta de la sonda.
import { serviceClient } from './backend.ts';
import { dailyProbeProfile, estimateCalibration } from './soilCalibrationMath.js';
import { aggregateGaritaObservations } from '../../../src/services/waterEnergy/garitaWeather.js';
import { kcService } from '../../../src/services/waterEnergy/kcService.js';

const DAYS = 45;
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

function lotIrrigationByDay(logs, programs, lotId) {
  const byProgram = new Map(programs.map(program => [program.id, program]));
  const result = new Map();
  for (const log of logs) {
    const program = byProgram.get(log.program_id);
    if (!log.date || !program || !(program.lot_ids || []).includes(lotId)) continue;
    const factor = (program.items || []).find(item => item.lot_id === lotId)?.factor ?? 1;
    const mm = Number(log.applied_mm) * Number(factor);
    if (Number.isFinite(mm) && mm > 0) result.set(log.date, (result.get(log.date) || 0) + mm);
  }
  return result;
}

export async function calibrateAllSoilModels() {
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();
  const [{ data: probes, error: probeError }, { data: currentModels, error: modelError },
    { data: points, error: pointError }, { data: lots, error: lotError },
    { data: profiles, error: profileError }, { data: stations, error: stationError },
    { data: logs, error: logError }, { data: programs, error: programError }] = await Promise.all([
    serviceClient.from('soil_probes').select('*').eq('provider', 'sentek').eq('active', true),
    serviceClient.from('soil_behavior_models').select('*'),
    serviceClient.from('soil_monitoring_points').select('id,lot_id'),
    serviceClient.from('lots').select('*'),
    serviceClient.from('soil_profiles').select('lot_id,probe_id,current_kc,kc_override_start_date,kc_override_end_date,phenology_delay_days,phenology_delay_start_date,phenology_delay_end_date'),
    serviceClient.from('weather_stations').select('id,name,active'),
    serviceClient.from('irrigation_logs').select('*'),
    serviceClient.from('irrigation_programs').select('*'),
  ]);
  for (const error of [probeError, modelError, pointError, lotError, profileError, stationError, logError, programError]) {
    if (error) throw new Error(error.message);
  }
  const garita = stations.find(station => station.name?.trim().toLowerCase() === 'garita' && station.active !== false);
  if (!garita) throw new Error('No se encontró la estación Garita activa.');
  const observations = await pages('weather_observations', 'id,timestamp,rainfall_mm,eto_mm,et_day_mm',
    query => query.eq('weather_station_id', garita.id).gte('timestamp', since));
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
        query => query.eq('probe_id', probe.id).gte('timestamp', since));
      const days = dailyProbeProfile(channels, readings);
      // El sitio físico debe estar indicado en la sonda o en su punto
      // de monitoreo. Un lote beneficiario arbitrario NO es su ubicación.
      const physicalLotId = points.find(point => point.id === probe.monitoring_point_id)?.lot_id || probe.lot_id;
      const physicalLot = lots.find(lot => lot.id === physicalLotId);
      const physicalProfile = profiles.find(profile => profile.lot_id === physicalLotId);
      const siteVerified = Boolean(physicalLot && physicalProfile?.probe_id === probe.id);
      const irrigation = siteVerified ? lotIrrigationByDay(logs, programs, physicalLotId) : new Map();
      const estimated = estimateCalibration(days, weather, irrigation,
        siteVerified ? day => kcService.kcForLotDate(physicalLot, day, physicalProfile) : null);
      const attemptAt = new Date().toISOString();
      const summary = {
        ...estimated,
        physical_lot_id: siteVerified ? physicalLotId : null,
        reference_status: siteVerified ? 'verified' : 'unverified',
        last_probe_reading_at: probe.last_reading_at,
        weather_station: 'Garita',
      };
      for (const model of matching) {
        const recharge = estimated.recharge_efficiency ?? model.recharge_efficiency;
        const etc = estimated.etc_correction_factor ?? model.etc_correction_factor;
        const status = days.length < 5 ? 'sin_datos'
          : recharge != null && etc != null ? 'calibrated'
          : recharge != null || etc != null ? 'partial' : 'uncalibrated';
        const updates = {
          calibration_status: status,
          sample_count: estimated.recharge_sample_count + estimated.depletion_sample_count,
          recharge_sample_count: estimated.recharge_sample_count,
          depletion_sample_count: estimated.depletion_sample_count,
          calibration_diagnostics: summary,
          last_calibration_attempt_at: attemptAt,
        };
        if (estimated.recharge_efficiency != null) updates.recharge_efficiency = estimated.recharge_efficiency;
        if (estimated.etc_correction_factor != null) updates.etc_correction_factor = estimated.etc_correction_factor;
        if (estimated.depletion_rate_mm_day != null) updates.depletion_rate_mm_day = estimated.depletion_rate_mm_day;
        if (estimated.recharge_efficiency != null || estimated.etc_correction_factor != null) updates.last_calibration_at = attemptAt;
        const { error } = await serviceClient.from('soil_behavior_models').update(updates).eq('id', model.id);
        if (error) throw new Error(error.message);
      }
      results.push({ probe: probe.name, ok: true, status: days.length < 5 ? 'sin_datos' : 'evaluated',
        models: matching.length, ...summary });
    } catch (error) {
      results.push({ probe: probe.name, ok: false, message: error.message });
    }
  }
  return { ok: results.every(result => result.ok), calibrated: results, ran_at: new Date().toISOString() };
}
