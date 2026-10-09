import test from 'node:test';
import assert from 'node:assert/strict';
import { probeProfileLoss, forecastDrydownFactor, afterRiseFactor, drydownFactor } from './soilResponse.js';
import { runUsefulWaterScenario } from './engine/waterBalanceEngine.js';
const model = { calibration_diagnostics: { last_probe_day:'2026-10-08',reference_taw_mm:100,
  transfer_dynamics:{version:1,last_clean_day:'2026-10-08',recent_loss_mm_day:2,loss_per_eto:0.5,
    daily:[{day:'2026-10-07',loss_mm:2},{day:'2026-10-08',loss_mm:0}]}}};
test('histórico sigue la pérdida medida, escala capacidad y respeta pérdida cero',()=>{
  assert.equal(probeProfileLoss(model,{date:'2026-10-07',lotTaw:100}),2);
  assert.equal(probeProfileLoss(model,{date:'2026-10-07',lotTaw:200}),4);
  assert.equal(probeProfileLoss(model,{date:'2026-10-08'}),0);
  assert.equal(probeProfileLoss(model,{date:'2026-10-01'}),null);
});
test('pronóstico sigue secado limpio ajustado por clima, sin ciclo del riego donante',()=>{
  assert.equal(probeProfileLoss(model,{date:'2026-10-09',forecastFactor:1,eto:6,lotTaw:200}),6);
  assert.equal(probeProfileLoss(model,{date:'2026-11-01',forecastFactor:1,eto:6}),null);
  assert.equal(probeProfileLoss(null,{eto:6}),null);
  assert.equal(drydownFactor(model),1);
  assert.equal(afterRiseFactor(model),1);
  assert.equal(forecastDrydownFactor(model,0,0),1);
});
test('el nivel inicial y la recarga pertenecen al lote, con o sin riego programado',()=>{
  const config={total_available_water_capacity_mm:100,recharge_threshold_mm:20,target_water_mm:80};
  const days=[{date:'2026-10-09',profile_loss_mm:2,irrigation_mm:10},{date:'2026-10-10',profile_loss_mm:2}];
  const dry=runUsefulWaterScenario(50,config,days.map(d=>({...d,irrigation_mm:0})));
  const irrigated=runUsefulWaterScenario(50,config,days);
  assert.equal(dry[1].available_water_mm,46);
  assert.equal(irrigated[1].available_water_mm,56);
});
