import type { AutomationRule, EnergyMetric, HVACZone, MaintenancePrediction, RealtimeAlert, SmartDevice, WaterMetric } from "./iotTypes";

export const devices: SmartDevice[] = [
  { id: "dev-001", name: "Sensor Temperatura Sala", type: "temperature", location: "Sala de Estar", status: "online", battery: 92, lastReading: "Agora", value: "23.4°C" },
  { id: "dev-002", name: "Sensor Umidade Cozinha", type: "humidity", location: "Cozinha", status: "online", battery: 88, lastReading: "2 min", value: "54%" },
  { id: "dev-003", name: "Medidor Energia Geral", type: "energy", location: "Quadro Geral", status: "online", battery: 100, lastReading: "Agora", value: "8.2 kWh" },
  { id: "dev-004", name: "Detector Vazamento Cozinha", type: "leak", location: "Cozinha", status: "warning", battery: 76, lastReading: "5 min", value: "Risco médio" },
  { id: "dev-005", name: "Sensor CO₂ Sala", type: "air_quality", location: "Sala de Estar", status: "online", battery: 81, lastReading: "Agora", value: "620 ppm" },
  { id: "dev-006", name: "Controlador HVAC", type: "hvac", location: "Área Social", status: "maintenance", battery: 100, lastReading: "8 min", value: "Auto" },
];

export const energyMetrics: EnergyMetric[] = [
  { id: "en-001", area: "Sala de Estar", currentKwh: 82, baselineKwh: 96, cost: 78.4, savingPotential: 14.5 },
  { id: "en-002", area: "Cozinha", currentKwh: 118, baselineKwh: 132, cost: 112.7, savingPotential: 10.6 },
  { id: "en-003", area: "Iluminação", currentKwh: 44, baselineKwh: 61, cost: 42.1, savingPotential: 27.8 },
  { id: "en-004", area: "Climatização", currentKwh: 154, baselineKwh: 168, cost: 147.2, savingPotential: 8.3 },
];

export const waterMetrics: WaterMetric[] = [
  { id: "wt-001", area: "Cozinha", consumptionLiters: 820, baselineLiters: 760, leakRisk: "medio", cost: 18.6 },
  { id: "wt-002", area: "Lavabo", consumptionLiters: 340, baselineLiters: 360, leakRisk: "baixo", cost: 7.8 },
  { id: "wt-003", area: "Área Técnica", consumptionLiters: 210, baselineLiters: 180, leakRisk: "alto", cost: 5.1 },
];

export const hvacZones: HVACZone[] = [
  { id: "hv-001", zone: "Sala de Estar", temperature: 23.4, humidity: 52, mode: "auto", status: "online" },
  { id: "hv-002", zone: "Cozinha", temperature: 24.8, humidity: 54, mode: "cooling", status: "online" },
  { id: "hv-003", zone: "Suíte", temperature: 22.1, humidity: 49, mode: "auto", status: "online" },
  { id: "hv-004", zone: "Área Social", temperature: 25.2, humidity: 58, mode: "auto", status: "maintenance" },
];

export const alerts: RealtimeAlert[] = [
  {
    id: "al-001",
    title: "Risco de vazamento na cozinha",
    location: "Cozinha",
    severity: "alto",
    status: "open",
    timestamp: "Agora",
    recommendation: "Verificar sensor e registro de água da cozinha.",
  },
  {
    id: "al-002",
    title: "HVAC em manutenção preventiva",
    location: "Área Social",
    severity: "medio",
    status: "acknowledged",
    timestamp: "8 min",
    recommendation: "Agendar limpeza de filtro e revisão de desempenho.",
  },
  {
    id: "al-003",
    title: "Consumo de energia acima do padrão",
    location: "Climatização",
    severity: "medio",
    status: "open",
    timestamp: "14 min",
    recommendation: "Ajustar curva de temperatura e horários automáticos.",
  },
];

export const maintenancePredictions: MaintenancePrediction[] = [
  { id: "mp-001", device: "Controlador HVAC", location: "Área Social", probability: 82, predictedIssue: "Filtro com baixa eficiência", dueIn: "7 dias", severity: "medio" },
  { id: "mp-002", device: "Detector Vazamento Cozinha", location: "Cozinha", probability: 74, predictedIssue: "Possível falso positivo por umidade elevada", dueIn: "3 dias", severity: "alto" },
  { id: "mp-003", device: "Medidor Energia Geral", location: "Quadro Geral", probability: 41, predictedIssue: "Pico de consumo recorrente", dueIn: "14 dias", severity: "baixo" },
];

export const automationRules: AutomationRule[] = [
  { id: "ar-001", name: "Reduzir HVAC quando ambiente vazio", trigger: "Ocupação = 0 por 20 min", action: "Modo econômico", status: "active" },
  { id: "ar-002", name: "Alerta de vazamento", trigger: "Sensor leak = risco médio/alto", action: "Notificar manutenção", status: "active" },
  { id: "ar-003", name: "Iluminação eficiente", trigger: "Luz ligada sem ocupação", action: "Desligar após 10 min", status: "active" },
  { id: "ar-004", name: "Qualidade do ar", trigger: "CO₂ > 900 ppm", action: "Aumentar ventilação", status: "draft" },
];

export const aiSmartInsights = [
  {
    title: "Cozinha precisa inspeção preventiva",
    description: "Consumo de água acima da linha base e detector de vazamento em warning.",
    impact: "Alta prioridade",
    action: "Criar chamado",
  },
  {
    title: "Economia relevante na iluminação",
    description: "LED e automação podem reduzir consumo em 27,8% nessa categoria.",
    impact: "Economia",
    action: "Aplicar regra",
  },
  {
    title: "HVAC deve entrar em manutenção",
    description: "Probabilidade de 82% de perda de eficiência por filtro.",
    impact: "Prevenção",
    action: "Agendar manutenção",
  },
];
