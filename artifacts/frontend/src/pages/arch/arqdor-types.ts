export type RegionState =
  | 'LOCK'
  | 'MATERIAL'
  | 'REFERENCE'
  | 'MODIFY'
  | 'REPLACE'
  | 'ADD'
  | 'REMOVE'
  | 'AUTO';

export type FonteVerdade =
  | 'ORIGINAL_IMAGE'
  | 'USER_INPUT'
  | 'MATERIAL_REFERENCE'
  | 'MATERIAL_LIBRARY'
  | 'MEMORIAL'
  | 'AI_DETECTION';

export interface Region {
  id: string;
  name: string;
  element: string;
  state: RegionState;
  confidence: number;
  notes: string;
  fonteVerdade: FonteVerdade;
  materialDetectado: string;
  materialConfirmado: string;
  materialColor?: string;
  materialName?: string;
  referenceImageUrl?: string;
  aprovado: boolean;
}

export interface TechReading {
  ambiente: string;
  estilo: string;
  iluminacao: string;
  complexidade: 'Baixa' | 'Média' | 'Alta' | 'Muito Alta';
  angulo: string;
  dimensaoEstimada: string;
  elementos: Array<{
    nome: string;
    tipo: string;
    confianca: number;
    observacao: string;
    materialDetectado: string;
  }>;
}

export interface RiskItem {
  regionId: string;
  regionName: string;
  risco: string;
  severidade: 'BAIXO' | 'MÉDIO' | 'ALTO' | 'CRÍTICO';
  recomendacao: string;
}

export interface ArqdorPrompt {
  core: string;
  project: string;
  style: string;
  negative: string;
}
