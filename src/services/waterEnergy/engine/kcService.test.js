import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kcService } from '../kcService.js';

describe('kcService dinámico', () => {
  it('usa la curva adulta de cada cultivo en las fechas ancla', () => {
    assert.equal(kcService.kcForLotDate({ crop: 'Granadas', planting_year: 2012 }, '2026-09-15'), 0.27);
    assert.equal(kcService.kcForLotDate({ crop: 'Olivos', planting_year: 2010 }, '2026-09-15'), 0.5);
  });

  it('reduce Kc en montes jóvenes según su edad', () => {
    assert.equal(kcService.kcForLotDate({ crop: 'Granadas', planting_year: 2024 }, '2026-09-15'), 0.162);
    assert.equal(kcService.kcForLotDate({ crop: 'Olivos', planting_year: 2026 }, '2026-09-15'), 0.125);
  });

  it('aplica el atraso fenológico solo dentro de la campaña configurada', () => {
    const lot = { crop: 'Granadas', planting_year: 2012 };
    const profile = {
      phenology_delay_days: 35,
      phenology_delay_start_date: '2026-09-01',
      phenology_delay_end_date: '2027-04-30',
    };
    const delayed = kcService.detailsForLotDate(lot, '2026-09-24', profile);
    assert.equal(delayed.effective_date, '2026-08-20');
    assert.equal(delayed.stage, 'Reposo invernal');
    assert.ok(delayed.kc < 0.27);
    assert.equal(kcService.detailsForLotDate(lot, '2027-09-24', profile).phenology_delay_days, 0);
  });

  it('interpola diariamente sin saltos al cambiar de mes', () => {
    const lot = { crop: 'Granadas', planting_year: 2012 };
    const sep30 = kcService.kcForLotDate(lot, '2026-09-30');
    const oct1 = kcService.kcForLotDate(lot, '2026-10-01');
    assert.ok(Math.abs(oct1 - sep30) < 0.01);
  });

  it('limita el override manual a sus fechas', () => {
    const lot = { crop: 'Olivos', planting_year: 2010 };
    const profile = {
      current_kc: 0.9,
      kc_override_start_date: '2026-10-01',
      kc_override_end_date: '2026-10-10',
    };
    assert.notEqual(kcService.kcForLotDate(lot, '2026-09-30', profile), 0.9);
    assert.equal(kcService.kcForLotDate(lot, '2026-10-05', profile), 0.9);
    assert.notEqual(kcService.kcForLotDate(lot, '2026-10-11', profile), 0.9);
  });
});
