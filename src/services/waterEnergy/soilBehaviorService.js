import { backend } from '@/api/backendClient';

// El servidor calibra los modelos cada día. El navegador solo lee el
// resultado para calcular cada lote con su estado y riegos propios.
export const soilBehaviorService = {
  async getModels() { return backend.entities.SoilBehaviorModel.list(); },

  getModelForProfile(profile, models) {
    if (!profile) return null;
    return (models || []).find(model => model.id === profile.soil_behavior_model_id)
      || (models || []).find(model => model.reference_probe_id === profile.probe_id)
      || null;
  },
};
