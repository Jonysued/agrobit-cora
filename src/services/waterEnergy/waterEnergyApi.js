import { base44 } from '@/api/base44Client';

// Capa fina de persistencia de la configuración por lote (entidad WaterEnergyConfig).
// La interfaz no llama a Base44 directamente: pasa por este módulo.
export const waterEnergyApi = {
  listConfigs: () => base44.entities.WaterEnergyConfig.list(),
  saveConfig: config => config.id
    ? base44.entities.WaterEnergyConfig.update(config.id, config)
    : base44.entities.WaterEnergyConfig.create(config),
};