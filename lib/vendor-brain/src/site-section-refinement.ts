export interface EditableSiteSection {
  index: number;
  key: string;
  title: string;
}

export interface SectionRefinementResolution {
  mode: 'targeted' | 'global';
  targetSectionKey: string | null;
  targetSectionIndex: number | null;
  targetSectionTitle: string | null;
  preserveSectionKeys: string[];
  confidence: number;
  reason: string;
}

const GLOBAL_HINTS = [
  'site inteiro', 'página inteira', 'pagina inteira', 'todo o site', 'toda a página', 'toda pagina',
  'em todas as seções', 'em todas as secoes', 'globalmente', 'layout inteiro', 'design inteiro',
  'troque a fonte do site', 'mude a fonte do site', 'cor do site inteiro', 'tema inteiro',
];

const SECTION_ALIASES: Array<{ aliases: string[]; terms: string[] }> = [
  { aliases: ['hero', 'banner', 'primeira dobra', 'topo principal'], terms: ['hero', 'banner', 'principal', 'início', 'inicio'] },
  { aliases: ['header', 'cabeçalho', 'cabecalho', 'menu', 'navegação', 'navegacao'], terms: ['header', 'cabeçalho', 'cabecalho', 'menu', 'nav'] },
  { aliases: ['benefícios', 'beneficios', 'vantagens', 'diferenciais'], terms: ['benefício', 'beneficio', 'vantagem', 'diferencial'] },
  { aliases: ['prova social', 'depoimentos', 'depoimento', 'cases', 'números', 'numeros'], terms: ['depoimento', 'case', 'prova', 'números', 'numeros', 'clientes'] },
  { aliases: ['galeria', 'fotos', 'imagens', 'portfólio', 'portfolio'], terms: ['galeria', 'foto', 'imagem', 'portfólio', 'portfolio'] },
  { aliases: ['produtos', 'produto', 'catálogo', 'catalogo', 'vitrine'], terms: ['produto', 'catálogo', 'catalogo', 'vitrine'] },
  { aliases: ['preços', 'precos', 'pricing', 'planos', 'comparativo'], terms: ['preço', 'preco', 'plano', 'comparativo', 'pricing'] },
  { aliases: ['faq', 'perguntas', 'dúvidas', 'duvidas'], terms: ['faq', 'pergunta', 'dúvida', 'duvida'] },
  { aliases: ['formulário', 'formulario', 'contato', 'cadastro'], terms: ['formulário', 'formulario', 'contato', 'cadastro'] },
  { aliases: ['cta', 'chamada', 'botão final', 'botao final'], terms: ['cta', 'chamada', 'ação', 'acao', 'contato'] },
  { aliases: ['footer', 'rodapé', 'rodape'], terms: ['footer', 'rodapé', 'rodape'] },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalize(value).split(' ').filter((word) => word.length >= 3);
}

function titleScore(message: string, title: string): number {
  const messageWords = new Set(words(message));
  const titleWords = words(title);
  if (!titleWords.length) return 0;
  const matches = titleWords.filter((word) => messageWords.has(word)).length;
  return matches / titleWords.length;
}

function aliasScore(message: string, title: string): number {
  const normalizedMessage = normalize(message);
  const normalizedTitle = normalize(title);
  let best = 0;

  for (const group of SECTION_ALIASES) {
    const aliasHit = group.aliases.some((alias) => normalizedMessage.includes(normalize(alias)));
    if (!aliasHit) continue;
    const titleHit = group.terms.some((term) => normalizedTitle.includes(normalize(term)));
    if (titleHit) best = Math.max(best, 0.94);
  }

  return best;
}

export function resolveSectionRefinement(
  message: string,
  sections: EditableSiteSection[],
): SectionRefinementResolution {
  const normalizedMessage = normalize(message);
  const allKeys = sections.map((section) => section.key);

  if (!sections.length || GLOBAL_HINTS.some((hint) => normalizedMessage.includes(normalize(hint)))) {
    return {
      mode: 'global',
      targetSectionKey: null,
      targetSectionIndex: null,
      targetSectionTitle: null,
      preserveSectionKeys: [],
      confidence: sections.length ? 0.98 : 1,
      reason: sections.length ? 'Pedido explicitamente global.' : 'A página não possui seções identificáveis.',
    };
  }

  const ranked = sections
    .map((section) => {
      const exactTitle = normalizedMessage.includes(normalize(section.title)) ? 1 : 0;
      const lexical = titleScore(message, section.title);
      const semanticAlias = aliasScore(message, section.title);
      const score = Math.max(exactTitle, semanticAlias, lexical >= 0.5 ? Math.min(0.9, 0.55 + lexical * 0.35) : lexical * 0.45);
      return { section, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best || best.score < 0.52) {
    return {
      mode: 'global',
      targetSectionKey: null,
      targetSectionIndex: null,
      targetSectionTitle: null,
      preserveSectionKeys: [],
      confidence: best?.score ?? 0,
      reason: 'Nenhuma seção foi identificada com confiança suficiente; mantém refinamento global para não editar a seção errada.',
    };
  }

  return {
    mode: 'targeted',
    targetSectionKey: best.section.key,
    targetSectionIndex: best.section.index,
    targetSectionTitle: best.section.title,
    preserveSectionKeys: allKeys.filter((key) => key !== best.section.key),
    confidence: Number(best.score.toFixed(2)),
    reason: `Pedido associado à seção “${best.section.title}”.`,
  };
}

export function buildTargetedRefinementInstruction(resolution: SectionRefinementResolution): string {
  if (resolution.mode !== 'targeted' || resolution.targetSectionIndex == null) {
    return 'O pedido não aponta com segurança para uma seção única. Aplique somente as mudanças explicitamente solicitadas e preserve o restante sempre que possível.';
  }

  return [
    'EDIÇÃO LOCALIZADA OBRIGATÓRIA — SITE GENERATOR 2.0',
    `Seção alvo: índice ${resolution.targetSectionIndex}, título “${resolution.targetSectionTitle ?? ''}”.`,
    'Altere somente essa seção para atender ao pedido.',
    'Não reescreva, reordene, remova ou estilize novamente as demais seções.',
    'Preserve header/footer e metadados globais, exceto quando o pedido mencionar explicitamente esses elementos.',
    'Retorne o HTML completo, mantendo byte-a-byte o máximo possível fora da seção alvo.',
  ].join('\n');
}
