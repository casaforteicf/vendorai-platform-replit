export type IoTView =
  | "dashboard"
  | "sensors"
  | "energy"
  | "water"
  | "hvac"
  | "environment"
  | "alerts"
  | "maintenance"
  | "automation"
  | "devices"
  | "map"
  | "ai";

export type DeviceStatus = "online" | "offline" | "warning" | "maintenance";
export type AlertSeverity = "baixo" | "medio" | "alto" | "critico";
export type SensorType = "temperature" | "humidity" | "air_quality" | "energy" | "water" | "occupancy" | "leak" | "hvac";

export type SmartDevice = {
  id: string;
  name: string;
  type: SensorType;
  location: string;
  status: DeviceStatus;
  battery: number;
  lastReading: string;
  value: string;
};

export type EnergyMetric = {
  id: string;
  area: string;
  currentKwh: number;
  baselineKwh: number;
  cost: number;
  savingPotential: number;
};

export type WaterMetric = {
  id: string;
  area: string;
  consumptionLiters: number;
  baselineLiters: number;
  leakRisk: AlertSeverity;
  cost: number;
};

export type HVACZone = {
  id: string;
  zone: string;
  temperature: number;
  humidity: number;
  mode: "auto" | "cooling" | "heating" | "off";
  status: DeviceStatus;
};

export type RealtimeAlert = {
  id: string;
  title: string;
  location: string;
  severity: AlertSeverity;
  status: "open" | "acknowledged" | "resolved";
  timestamp: string;
  recommendation: string;
};

export type MaintenancePrediction = {
  id: string;
  device: string;
  location: string;
  probability: number;
  predictedIssue: string;
  dueIn: string;
  severity: AlertSeverity;
};

export type AutomationRule = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  status: "active" | "paused" | "draft";
};
