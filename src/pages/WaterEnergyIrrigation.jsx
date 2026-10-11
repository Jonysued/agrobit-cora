import React from 'react';
import { Navigate } from 'react-router-dom';
export default function WaterEnergyIrrigation() {
  return <Navigate to="/riego?tab=monitoreo" replace />;
}
