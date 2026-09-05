import type { MarketingAgentPlan } from './marketing-agent';

export type MarketingSurface =
  | 'planner'
  | 'campaigns'
  | 'content'
  | 'media'
  | 'ads'
  | 'calendar'
  | 'performance'
  | 'site'
  | 'video'
  | 'unknown';

export interface MarketingAgentUiCard {
  surface: MarketingSurface;
  title: string;
  description: string;
  primaryAction: string;
  secondaryActions: string[];
}

const SURFACE_CARDS: Record<MarketingSurface, Omit<MarketingAgentUiCard, 'surface'>> = {
  planner: {
    title: 'IA de Marketing — Estratégia',
    description: 'Analisa metas, público, canais e oportunidades para melhorar o plano vigente.',
    primaryAction: 'Revisar plano',
    secondaryActions: ['Encontrar oportunidades', 'Sugerir canais', 'Revisar frequência'],
  },
  campaigns: {
    title: 'IA de Marketing — Campanha',
    description: 'Usa a campanha atual como fonte de verdade e prepara melhorias sem criar duplicações.',
    primaryAction: 'Melhorar campanha',
    secondaryActions: ['Criar variações', 'Revisar público', 'Adaptar por canal'],
  },
  content: {
    title: 'IA de Marketing — Conteúdo',
    description: 'Transforma o plano e a campanha em peças específicas para cada canal.',
    primaryAction: 'Criar conteúdo da campanha',
    secondaryActions: ['Adaptar formatos', 'Revisar copy', 'Gerar variações'],
  },
  media: {
    title: 'IA de Marketing — Mídias',
    description: 'Seleciona e organiza os melhores ativos do tenant para a campanha e o canal atuais.',
    primaryAction: 'Selecionar melhores mídias',
    secondaryActions: ['Revisar qualidade', 'Classificar ativos', 'Sugerir uso'],
  },
  ads: {
    title: 'IA de Marketing — Anúncios',
    description: 'Adapta linguagem, criativos e configuração ao canal, respeitando autonomia e orçamento.',
    primaryAction: 'Revisar anúncio',
    secondaryActions: ['Criar variação', 'Revisar canal', 'Analisar performance'],
  },
  calendar: {
    title: 'IA de Marketing — Calendário',
    description: 'Conecta a frequência planejada com campanhas, conteúdos e datas já existentes.',
    primaryAction: 'Revisar calendário',
    secondaryActions: ['Preencher lacunas', 'Ajustar frequência', 'Priorizar campanhas'],
  },
  performance: {
    title: 'IA de Marketing — Performance',
    description: 'Explica resultados, identifica gargalos e recomenda próximas ações.',
    primaryAction: 'Diagnosticar performance',
    secondaryActions: ['Comparar canais', 'Revisar criativos', 'Gerar teste A/B'],
  },
  site: {
    title: 'IA de Marketing — Site / LP',
    description: 'Conecta página, campanha, copy, brand e conversão ao objetivo comercial.',
    primaryAction: 'Revisar página',
    secondaryActions: ['Melhorar conversão', 'Revisar copy', 'Revisar mídias'],
  },
  video: {
    title: 'IA de Marketing — Vídeo',
    description: 'Cria e revisa roteiro, hook, cenas, legendas e adaptações específicas por canal.',
    primaryAction: 'Revisar vídeo',
    secondaryActions: ['Criar roteiro', 'Adaptar por canal', 'Revisar hook'],
  },
  unknown: {
    title: 'IA de Marketing',
    description: 'Analisa o contexto de Marketing atual e sugere a próxima ação mais útil.',
    primaryAction: 'Analisar contexto',
    secondaryActions: ['Ver oportunidades'],
  },
};

export function inferMarketingSurface(pathname: string): MarketingSurface {
  const path = pathname.toLowerCase();
  if (path.includes('planej') || path.includes('media-plan')) return 'planner';
  if (path.includes('campanh')) return 'campaigns';
  if (path.includes('content') || path.includes('conteudo')) return 'content';
  if (path.includes('media') || path.includes('midia')) return 'media';
  if (path.includes('ads') || path.includes('anuncio')) return 'ads';
  if (path.includes('calendar') || path.includes('calendario')) return 'calendar';
  if (path.includes('performance') || path.includes('analytics')) return 'performance';
  if (path.includes('site') || path.includes('landing') || path.includes('lp')) return 'site';
  if (path.includes('video')) return 'video';
  return 'unknown';
}

export function buildMarketingAgentUiCard(pathname: string, _plan?: MarketingAgentPlan): MarketingAgentUiCard {
  const surface = inferMarketingSurface(pathname);
  return { surface, ...SURFACE_CARDS[surface] };
}
