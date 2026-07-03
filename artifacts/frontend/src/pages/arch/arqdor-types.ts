export type RegionState =
  | 'LOCK'
  | 'MATERIAL'
  | 'REFERENCE'
  | 'MODIFY'
  | 'REPLACE'
  | 'ADD'
  | 'REMOVE'
  | 'AUTO';

export interface Region {
  id: string;
  name: string;
  element: string;
  state: RegionState;
  confidence: number;
  notes: string;
  materialColor?: string;
  materialName?: string;
  referenceImageUrl?: string;
  promptFragment?: string;
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
