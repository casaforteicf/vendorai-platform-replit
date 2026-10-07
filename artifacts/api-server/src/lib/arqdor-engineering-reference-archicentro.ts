import type {
  ComponentRule,
  EngineeringConfiguration,
  PerformanceEvidence,
} from "./arqdor-engineering-engine.js";

/**
 * Catálogo técnico Archicentro recebido como material de referência.
 * Somente dados explicitamente demonstrados nos PDFs enviados são cadastrados aqui.
 * Não contém custo, plano de corte, ferragens completas ou fórmulas de fabricação não comprovadas.
 */
export const ARCHICENTRO_REFERENCE_SOURCE = {
  manufacturer: "Archicentro",
  status: "reference_only",
  files: [
    "04c_Janela_Maximar_Comfort_Archicentro.pdf",
    "05c_Janela_de_Correr_Tripla_Vedacao_Comfort_Archicentro.pdf",
    "06c_Modelos_Marcos_de_Correr_Archicentro.pdf",
    "07c_Porta_de_Correr_2_Folhas_Comfort_Archicentro.pdf",
    "10e_Janela_Oscilo_Batente_Elegance_Archicentro.pdf",
    "11e_Porta_de_Correr_Elegance_Archicentro.pdf",
    "15e_Porta_Elevadora_Elegance_Archicentro.pdf",
    "16p_Persiana_Premium_Persax_Archicentro.pdf",
    "17c_Conexoes_Archicentro.pdf",
    "19t_Tipologia_de_instalacao_no_vao_Archicentro.pdf",
  ],
} as const;

export const archicentroReferenceConfigurations: EngineeringConfiguration[] = [
  {
    id: "ref-archicentro-comfort-maximar",
    code: "COMFORT-MAXIMAR",
    name: "Janela Maxim-ar Comfort",
    productKind: "window",
    openingType: "maxim_ar",
    leafCount: 1,
    minWidthMm: 400,
    maxWidthMm: 1000,
    minHeightMm: 400,
    maxHeightMm: 1000,
    allowedGlassThicknessMm: [4, 6, 8, 10, 16, 20, 22, 24],
  },
  {
    id: "ref-archicentro-comfort-correr-tripla",
    code: "COMFORT-CORRER-2F-TRIPLA",
    name: "Janela de correr duas folhas com tripla vedação Comfort",
    productKind: "window",
    openingType: "sliding",
    leafCount: 2,
    minWidthMm: 400,
    maxWidthMm: 1500,
    minHeightMm: 600,
    maxHeightMm: 1800,
    allowedGlassThicknessMm: [4, 6, 8, 10, 16, 20, 22, 24],
  },
  {
    id: "ref-archicentro-comfort-porta-correr-2f",
    code: "COMFORT-PORTA-CORRER-2F",
    name: "Porta de correr duas folhas Comfort",
    productKind: "door",
    openingType: "sliding",
    leafCount: 2,
    minWidthMm: 1000,
    maxWidthMm: 3000,
    minHeightMm: 1000,
    maxHeightMm: 2500,
    allowedGlassThicknessMm: [4, 6, 8, 10, 16, 20, 22, 24],
  },
  {
    id: "ref-archicentro-elegance-oscilo",
    code: "ELEGANCE-OSCILO-BATENTE",
    name: "Janela oscilo-batente Elegance",
    productKind: "window",
    openingType: "tilt_turn",
    leafCount: 1,
    minWidthMm: 500,
    maxWidthMm: 1200,
    minHeightMm: 500,
    maxHeightMm: 1800,
    allowedGlassThicknessMm: [4, 6, 8, 10, 12, 20, 22, 24, 26, 31, 34],
  },
  {
    id: "ref-archicentro-elegance-porta-correr",
    code: "ELEGANCE-PORTA-CORRER",
    name: "Porta de correr Elegance",
    productKind: "door",
    openingType: "sliding",
    minWidthMm: 1200,
    maxWidthMm: 5000,
    minHeightMm: 1000,
    maxHeightMm: 3200,
    allowedGlassThicknessMm: [4, 6, 8, 10, 12, 20, 22, 24, 26, 31, 34],
  },
  {
    id: "ref-archicentro-elegance-elevadora",
    code: "ELEGANCE-PORTA-ELEVADORA",
    name: "Porta elevadora Elegance",
    productKind: "door",
    openingType: "lift_slide",
    minWidthMm: 1500,
    maxWidthMm: 5000,
    minHeightMm: 1800,
    maxHeightMm: 3200,
    maxLeafWeightKg: 400,
    allowedGlassThicknessMm: [4, 6, 8, 10, 12, 20, 22, 24, 26, 31, 34],
  },
];

export const archicentroReferenceFrames: ComponentRule[] = [
  {
    code: "C42.01.0005",
    name: "Marco 2 trilhos sem aba",
    group: "profile",
    role: "frame",
    unit: "m",
    metadata: { line: "Comfort", source: "06c_Modelos_Marcos_de_Correr_Archicentro.pdf" },
  },
  {
    code: "C42.01.0006",
    name: "Marco 2 trilhos com aba",
    group: "profile",
    role: "frame",
    unit: "m",
    metadata: { line: "Comfort", source: "06c_Modelos_Marcos_de_Correr_Archicentro.pdf" },
  },
  {
    code: "C42.01.0009",
    name: "Marco baixo com aba",
    group: "profile",
    role: "frame",
    unit: "m",
    metadata: { line: "Comfort", source: "06c_Modelos_Marcos_de_Correr_Archicentro.pdf" },
  },
  {
    code: "C42.01.0016",
    name: "Marco 2 trilhos com vedação tripla",
    group: "profile",
    role: "frame",
    unit: "m",
    metadata: { line: "Comfort", source: "06c_Modelos_Marcos_de_Correr_Archicentro.pdf" },
  },
  {
    code: "C42.01.0004",
    name: "Marco 3 trilhos com aba",
    group: "profile",
    role: "frame",
    unit: "m",
    metadata: { line: "Comfort", source: "06c_Modelos_Marcos_de_Correr_Archicentro.pdf" },
  },
];

export const archicentroReferenceInstallationFinishes: ComponentRule[] = [
  {
    code: "ARR.01.0007",
    name: "Arremate 70",
    group: "finish",
    role: "trim",
    unit: "m",
    metadata: { source: "19t_Tipologia_de_instalacao_no_vao_Archicentro.pdf" },
  },
  {
    code: "ARR.01.0001",
    name: "Arremate 45",
    group: "finish",
    role: "trim",
    unit: "m",
    metadata: { source: "19t_Tipologia_de_instalacao_no_vao_Archicentro.pdf" },
  },
  {
    code: "ARR.01.0006",
    name: "Arremate 26",
    group: "finish",
    role: "trim",
    unit: "m",
    metadata: { source: "19t_Tipologia_de_instalacao_no_vao_Archicentro.pdf" },
  },
  {
    code: "ACE.01.0006",
    name: "Tapa deságue",
    group: "accessory",
    role: "drain_cover",
    unit: "un",
    metadata: { source: "19t_Tipologia_de_instalacao_no_vao_Archicentro.pdf" },
  },
];

export const archicentroReferenceCornerConnections: ComponentRule[] = [
  ["EME.01.0560", "Conexão de canto arredondado para marco 60/88 mm"],
  ["BAY.01.0000", "Conexão de canto arredondado para marco 60 e 88 mm"],
  ["EME.01.0988", "Conexão de ângulo 135° para marco 80/88 mm"],
  ["EME.01.0360", "Conexão de canto arredondado 90° para marco 60 mm"],
  ["EME.01.0088", "Conexão simples para marco 88 mm"],
  ["BAY.01.0188", "Conexão de canto arredondado para marco 60/88 mm"],
  ["EME.01.0101/0103", "Conexão T reforçada"],
  ["EME.01.0000", "Coluna de reforço"],
].map(([code, name]) => ({
  code,
  name,
  group: "accessory",
  role: "corner_connection",
  unit: "un",
  metadata: { source: "17c_Conexoes_Archicentro.pdf" },
}));

/**
 * A planilha de ensaios recebida deve ser importada para esta estrutura sem
 * extrapolar resultados: cada evidência fica vinculada à configuração e às
 * condições exatas de vidro/persiana/espuma do ensaio.
 */
export const archicentroReferencePerformanceEvidence: PerformanceEvidence[] = [];
