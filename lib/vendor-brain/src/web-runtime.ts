import type { BrandProfile, CreativeBrief } from './creative-design';
import { buildSiteGeneratorPlan, type MotionLevel, type SiteGeneratorPlan } from './site-generator-runtime';

export type WebSurface = 'institutional' | 'landing' | 'product' | 'ecommerce';

export interface WebCreativeGuidance {
  surface: WebSurface;
  language: string[];
  structure: string[];
  metrics: string[];
  qaFocus: string[];
}

const WEB_GUIDANCE: Record<WebSurface, WebCreativeGuidance> = {
  institutional: {
    surface: 'institutional',
    language: ['credible', 'clear', 'brand-led', 'benefit-oriented'],
    structure: ['header', 'hero', 'value-proposition', 'services', 'proof', 'process', 'contact-cta', 'footer'],
    metrics: ['engaged-sessions', 'cta-clicks', 'qualified-leads', 'contact-conversion'],
    qaFocus: ['brand-consistency', 'mobile-readability', 'navigation', 'proof', 'cta-clarity', 'seo-basics', 'visual-density'],
  },
  landing: {
    surface: 'landing',
    language: ['specific', 'conversion-oriented', 'single-offer', 'low-friction'],
    structure: ['header', 'hero', 'problem', 'solution', 'benefits', 'proof', 'objections', 'primary-cta', 'footer'],
    metrics: ['conversion-rate', 'cta-clicks', 'form-completion', 'qualified-leads', 'cpa'],
    qaFocus: ['message-match', 'mobile-readability', 'visual-hierarchy', 'form-friction', 'cta-clarity', 'tracking', 'visual-density'],
  },
  product: {
    surface: 'product',
    language: ['product-specific', 'evidence-based', 'benefit-led', 'purchase-oriented'],
    structure: ['header', 'product-hero', 'real-media', 'benefits', 'specifications', 'applications', 'objections', 'purchase-cta', 'footer'],
    metrics: ['product-cta-clicks', 'quote-starts', 'purchase-intent', 'conversion-rate'],
    qaFocus: ['product-accuracy', 'real-media', 'price-data-integrity', 'mobile-readability', 'cta-clarity', 'visual-density'],
  },
  ecommerce: {
    surface: 'ecommerce',
    language: ['scannable', 'commercial', 'trust-building', 'action-oriented'],
    structure: ['header', 'hero', 'categories', 'product-grid', 'availability', 'benefits', 'cart-drawer', 'support', 'footer'],
    metrics: ['product-view-rate', 'add-to-cart', 'checkout-or-whatsapp', 'conversion-rate', 'revenue'],
    qaFocus: ['catalog-accuracy', 'stock-integrity', 'pricing-integrity', 'mobile-commerce', 'cta-clarity', 'tracking', 'visual-density', 'cart-usability'],
  },
};

export interface WebCreativeRuntime {
  brief: CreativeBrief;
  brand: BrandProfile;
  guidance: WebCreativeGuidance;
  siteGeneratorPlan: SiteGeneratorPlan;
  promptContext: string;
}

export function getWebCreativeGuidance(surface: WebSurface): WebCreativeGuidance {
  return WEB_GUIDANCE[surface];
}

function buildAdvancedUiContract(surface: WebSurface): string[] {
  const common = [
    'PADRÃO VISUAL AVANÇADO OBRIGATÓRIO:',
    '- O resultado deve parecer produto digital profissional de 2026, não protótipo de IA e não página genérica de template.',
    '- Use composição limpa: um único contêiner principal por seção; evite card dentro de card dentro de card, molduras repetidas e bordas decorativas em excesso.',
    '- Limite largura de conteúdo a 1180-1240px; use grid fluido; mantenha alinhamento vertical consistente e espaços de 8/12/16/24/32/48/64px.',
    '- Header: altura alvo 64-72px; logo legível; navegação e ações sempre em uma linha no desktop; no mobile, logo + no máximo 2 ações compactas + menu. Nunca empilhe letras de um botão verticalmente.',
    '- Controles de header, carrinho e CTAs devem usar white-space: nowrap, min-width: max-content e flex-shrink: 0 quando houver risco de quebra.',
    '- Nunca use writing-mode vertical, word-break: break-all, overflow-wrap:anywhere em navegação, botões, preço, nomes de produto ou carrinho.',
    '- Mobile 360px é requisito de aprovação: sem overflow horizontal, sem elementos fixos cobrindo conteúdo, sem header gigante e sem botões estreitos que quebrem texto em várias linhas.',
    '- Títulos mobile: H1 entre 32-44px, H2 entre 26-34px; corpo 16-18px; line-height confortável; não usar blocos de texto excessivamente largos ou densos.',
    '- Um CTA primário dominante por seção; botões com altura mínima 44px; nunca usar dois botões visualmente idênticos disputando prioridade sem necessidade.',
    '- Contraste mínimo WCAG AA; logo e texto precisam permanecer legíveis sobre o fundo escolhido.',
    '- Imagens e mídia reais do tenant têm prioridade sobre ícones abstratos; placeholders só quando não houver mídia oficial.',
    '- Não inventar estatísticas, depoimentos, garantias, selos ou números comerciais ausentes nas fontes oficiais.',
  ];

  if (surface !== 'ecommerce') return common;

  return [
    ...common,
    'CONTRATO VISUAL ESPECÍFICO DE E-COMMERCE:',
    '- Estrutura obrigatória: header comercial compacto → hero curto → categorias/filtros → grade de produtos → benefícios/confiança → suporte → footer.',
    '- A grade deve ser o elemento dominante da página; não transformar a loja em uma landing page longa antes dos produtos.',
    '- Cards de produto: uma única superfície visual, imagem em proporção estável, nome de até 2 linhas, descrição curta, preço destacado e CTA claro. Sem card externo envolvendo outro card interno.',
    '- Desktop: 3-4 produtos por linha quando houver espaço; tablet: 2-3; mobile: 1 produto por linha ou 2 somente se cada card mantiver legibilidade real.',
    '- Imagem do produto com aspect-ratio entre 1:1 e 4:3, object-fit: cover/contain conforme o produto; nunca usar bloco vazio gigante para substituir foto existente.',
    '- Preço e unidade sempre juntos e visualmente próximos; preço não pode quebrar caractere por caractere.',
    '- Filtros no mobile devem rolar horizontalmente ou virar select/chips compactos; não criar dezenas de botões grandes ocupando a primeira tela.',
    '- Carrinho no header deve ser ícone compacto com badge ou rótulo curto em uma única linha; largura aproximada máxima 110px no mobile. Nunca exibir "Carrinho" em coluna vertical.',
    '- Carrinho lateral/drawer precisa ter largura <= 92vw no mobile, fechar facilmente, listar item/quantidade/preço e manter CTA final visível.',
    '- O primeiro produto deve aparecer cedo na rolagem; hero e textos institucionais não podem empurrar a vitrine várias telas para baixo.',
    '- Não repetir longos blocos institucionais entre produtos. Loja deve favorecer descoberta, comparação e compra.',
  ];
}

export function buildWebCreativeRuntime(input: {
  brief: CreativeBrief;
  brand: BrandProfile;
  surface: WebSurface;
  businessName?: string | null;
  productName?: string | null;
  motionLevel?: MotionLevel;
}): WebCreativeRuntime {
  const guidance = getWebCreativeGuidance(input.surface);
  const siteGeneratorPlan = buildSiteGeneratorPlan({
    surface: input.surface,
    motionLevel: input.motionLevel,
  });

  const promptContext = [
    'DIREÇÃO CRIATIVA WEB OFICIAL DO VENDORAI',
    `Superfície: ${guidance.surface}`,
    input.businessName ? `Empresa: ${input.businessName}` : null,
    input.productName ? `Produto/serviço: ${input.productName}` : null,
    `Objetivo: ${input.brief.objective}`,
    input.brief.audience ? `Público: ${input.brief.audience}` : null,
    input.brief.offer ? `Oferta: ${input.brief.offer}` : null,
    input.brief.cta ? `CTA: ${input.brief.cta}` : null,
    input.brief.visualDirection ? `Direção visual: ${input.brief.visualDirection}` : null,
    input.brand.logoUrl ? 'Usar a logo canônica do tenant.' : 'Não inventar logo; usar identidade textual segura se a logo não estiver disponível.',
    input.brand.colors?.length ? `Cores da marca: ${input.brand.colors.join(', ')}` : null,
    input.brand.tone?.length ? `Tom da marca: ${input.brand.tone.join(' | ')}` : null,
    input.brand.visualStyle?.length ? `Estilo visual: ${input.brand.visualStyle.join(' | ')}` : null,
    `Linguagem web: ${guidance.language.join(' | ')}`,
    `Estrutura recomendada: ${guidance.structure.join(' → ')}`,
    `Foco de QA: ${guidance.qaFocus.join(' | ')}`,
    `Componentes disponíveis para esta superfície: ${siteGeneratorPlan.recommendedComponents.join(' | ')}`,
    ...buildAdvancedUiContract(input.surface),
    siteGeneratorPlan.promptContract,
    'Priorizar mobile, clareza, contraste, hierarquia visual, acessibilidade, velocidade e coerência entre anúncio/campanha e página.',
    'Não inventar números, depoimentos, certificações, preços, garantias ou provas sociais que não existam nas fontes oficiais.',
  ].filter(Boolean).join('\n');

  return { brief: input.brief, brand: input.brand, guidance, siteGeneratorPlan, promptContext };
}
