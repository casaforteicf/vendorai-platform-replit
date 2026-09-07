import type { MarketingAgentPlan } from './marketing-agent';

export type MarketingSurface =
  | 'planner'
  | 'campaigns'
  | 'production'
  | 'approvals'
  | 'publishing'
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
    description: 'Analisa metas, público, canais, orçamento e oportunidades para melhorar o plano vigente.',
    primaryAction: 'Revisar plano',
    secondaryActions: ['Encontrar oportunidades', 'Sugerir canais', 'Revisar frequência', 'Revisar orçamento'],
  },
  campaigns: {
    title: 'IA de Marketing — Campanha',
    description: 'Usa a campanha atual como fonte de verdade e prepara melhorias sem criar duplicações.',
    primaryAction: 'Melhorar campanha',
    secondaryActions: ['Criar variações', 'Revisar público', 'Adaptar por canal'],
  },
  production: {
    title: 'IA de Marketing — Produção',
    description: 'Transforma briefings aprovados em peças finais, mantendo campanha, canal, oferta, público e KPI.',
    primaryAction: 'Produzir próxima peça',
    secondaryActions: ['Revisar fila', 'Resolver pendências', 'Adaptar formato'],
  },
  approvals: {
    title: 'IA de Marketing — Aprovações',
    description: 'Organiza o que precisa de decisão humana e explica o impacto de aprovar, editar ou recusar cada item.',
    primaryAction: 'Revisar pendências',
    secondaryActions: ['Comparar versões', 'Explicar impacto', 'Priorizar aprovações'],
  },
  publishing: {
    title: 'IA de Marketing — Publicação',
    description: 'Confere canal, data, ativo, CTA e capacidade de publicação antes de agendar ou publicar.',
    primaryAction: 'Revisar publicação',
    secondaryActions: ['Checar integrações', 'Revisar agenda', 'Diagnosticar falhas'],
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
    description: 'Conecta a frequência planejada com campanhas, conteúdos, aprovações e datas já existentes.',
    primaryAction: 'Revisar calendário',
    secondaryActions: ['Preencher lacunas', 'Ajustar frequência', 'Priorizar campanhas'],
  },
  performance: {
    title: 'IA de Marketing — Performance',
    description: 'Explica resultados reais, identifica gargalos e recomenda a próxima ação com base no que já performou.',
    primaryAction: 'Diagnosticar performance',
    secondaryActions: ['Comparar canais', 'Revisar criativos', 'Gerar teste A/B', 'Revisar orçamento'],
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

  // Fluxos operacionais precisam ser resolvidos antes das superfícies genéricas.
  if (
    path.includes('approval') ||
    path.includes('aprovacao') ||
    path.includes('aprovação') ||
    path.includes('fila-de-aprov') ||
    path.includes('review-queue')
  ) return 'approvals';

  if (
    path.includes('publish') ||
    path.includes('publicacao') ||
    path.includes('publicação') ||
    path.includes('agendamento') ||
    path.includes('scheduled-post')
  ) return 'publishing';

  if (
    path.includes('production') ||
    path.includes('producao') ||
    path.includes('produção') ||
    path.includes('fila-de-produc') ||
    path.includes('production-queue')
  ) return 'production';

  // Site/LP lives inside ContentHub as /content?tab=campanhas&view=lp, so it
  // must be resolved before the generic campaign/content checks.
  if (
    path.includes('view=lp') ||
    path.includes('view=site') ||
    path.includes('view=landing') ||
    path.includes('site-generator')
  ) return 'site';

  // The canonical planner route is /marketing/plano-de-midia and the planner
  // also lives as the planejamento tab inside ContentHub.
  if (
    path.includes('planej') ||
    path.includes('media-plan') ||
    path.includes('plano-de-midia') ||
    path.includes('tab=planejamento')
  ) return 'planner';

  if (path.includes('campanh')) return 'campaigns';
  // Video routes often live under /content-studio/video, so video must be
  // resolved before the generic content check.
  if (path.includes('video')) return 'video';
  if (path.includes('performance') || path.includes('analytics')) return 'performance';
  if (path.includes('calendar') || path.includes('calendario')) return 'calendar';
  if (path.includes('ads') || path.includes('anuncio')) return 'ads';
  if (path.includes('content') || path.includes('conteudo')) return 'content';
  if (path.includes('media') || path.includes('midia')) return 'media';
  if (path.includes('site') || path.includes('landing') || path.includes('lp')) return 'site';
  return 'unknown';
}

export function buildMarketingAgentUiCard(pathname: string, _plan?: MarketingAgentPlan): MarketingAgentUiCard {
  const surface = inferMarketingSurface(pathname);
  return { surface, ...SURFACE_CARDS[surface] };
}
