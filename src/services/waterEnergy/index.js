// ============================================================
// Water & Energy — fachada de servicios.
// La interfaz importa ÚNICAMENTE desde aquí; nunca llama a
// base44.entities directamente ni conoce el origen de los datos.
// Cada servicio está aislado para poder reemplazarse por APIs
// externas (IoT, meteorología, water-forecast, energy-optimizer)
// sin tocar el frontend.
// ============================================================
export { waterForecastService } from './waterForecastService';
export { sensorService } from './sensorService';
export { soilWaterService, CONFIG_LABELS } from './soilWaterService';
export { soilBehaviorService } from './soilBehaviorService';
export { lotWaterStateService } from './lotWaterStateService';
export { weatherService } from './weatherService';
export { irrigationRecommendationService } from './irrigationRecommendationService';
export { energyService } from './energyService';
export { runUsefulWaterScenario, stepUsefulWaterDay } from './engine/waterBalanceEngine';