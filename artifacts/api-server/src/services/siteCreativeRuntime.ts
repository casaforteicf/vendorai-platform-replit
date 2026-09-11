import { buildWebCreativeRuntime, type WebSurface } from '@workspace/vendor-brain/web-runtime';
import type { CreativeBrief } from '@workspace/vendor-brain/creative-design';
import { resolveContentAutopilotBrandContext } from './contentAutopilotCreativeBridge';
import { buildGenerationDesignQa } from './contentCreativeRuntime';
import { buildPaidMediaLearningPromptBlock } from './paidMediaLearning';

export interface SiteCreativeRuntimeInput {
  tenantId: string;
  surface: WebSurface;
  campaignId?: string | null;
  campaignName?: string | null;
  businessName?: string | null;
  productId?: string | null;
  productName?: string | null;
  objective: string;
  audience?: string | null;
  offer?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  assetIds?: string[];
}

export async function resolveSiteCreativeRuntime(input: SiteCreativeRuntimeInput) {
  const brand = await resolveContentAutopilotBrandContext({
    tenantId: input.tenantId,
    logoUrl: input.logoUrl ?? null,
    brandColor: input.brandColor ?? null,
  });

  const brief: CreativeBrief = {
    tenantId: input.tenantId,
    campaignId: input.campaignId ?? null,
    objective: input.objective,
    audience: input.audience ?? null,
    productId: input.productId ?? null,
    offer: input.offer ?? null,
    channel: 'web',
    format: input.surface,
    cta: input.cta ?? null,
    visualDirection: input.visualDirection ?? null,
    assetIds: input.assetIds ?? [],
  };

  const runtime = buildWebCreativeRuntime({
    brief,
    brand,
    surface: input.surface,
    businessName: input.businessName ?? input.campaignName ?? null,
    productName: input.productName ?? null,
  });

  let paidMediaLearning = '';
  try {
    paidMediaLearning = await buildPaidMediaLearningPromptBlock(input.tenantId);
  } catch {
    paidMediaLearning = '';
  }

  return { ...runtime, promptContext: runtime.promptContext + paidMediaLearning };
}

const ASAAS_COMMERCE_POLICY = `
CHECKOUT FINANCEIRO VENDORAI — REGRA INEGOCIÁVEL
- Se a página tiver produto, carrinho, compra ou e-commerce, WhatsApp NUNCA pode finalizar pagamento. WhatsApp é somente contato, suporte ou venda assistida.
- O botão final deve dizer algo como "Finalizar compra" ou "Pagar com Asaas" e abrir um formulário curto com nome, e-mail, telefone e CPF/CNPJ opcional.
- Ao confirmar, envie POST JSON para /api/public/tenant-commerce/checkout com: siteSlug, customer, billingType:"UNDEFINED", items:[{sku,quantity}] e pageUrl:location.href.
- Use exclusivamente SKUs reais recebidos no catálogo. Nunca envie preço do navegador; o backend consulta o preço oficial do tenant.
- Redirecione para paymentUrl retornada pela API. Esse é o fluxo financeiro oficial via Asaas.
- Se a API retornar asaas_not_configured, informe que a empresa precisa conectar o Asaas. É proibido cair para checkout via WhatsApp como fallback.
- Itens recorrentes são cobrados no primeiro pagamento e a recorrência mensal é provisionada pelo backend após confirmação no Asaas.
`;

export function enrichSiteGeneratorServicesContext(existingServices: unknown, promptContext: string): string {
  const current = typeof existingServices === 'string' ? existingServices.trim() : '';
  const marker = 'DIREÇÃO CRIATIVA WEB OFICIAL DO VENDORAI';
  const hasCreativeContext = promptContext.trim() && !current.includes(marker);
  const parts = [current];
  if (hasCreativeContext) parts.push(promptContext.trim());
  if (!current.includes('CHECKOUT FINANCEIRO VENDORAI — REGRA INEGOCIÁVEL')) parts.push(ASAAS_COMMERCE_POLICY.trim());
  return parts.filter(Boolean).join('\n\n');
}

export function inspectGeneratedSite(input: {
  html: string;
  hasBrandContext: boolean;
  expectedCta?: string | null;
  requiredImageCount?: number;
  injectedImageCount?: number;
  seoScore?: number | null;
  technicalValid: boolean;
  surface?: WebSurface;
}) {
  const html = input.html || '';
  const cssAndHtml = html.toLowerCase();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const hasH1 = /<h1\b/i.test(html);
  const hasMain = /<main\b/i.test(html);
  const sectionCount = (html.match(/<section\b/gi) ?? []).length;
  const hasSections = sectionCount >= 3;
  const hasResponsiveMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasMobileMedia = /@media[\s\S]{0,500}(max-width|min-width)/i.test(html);
  const hasCta = input.expectedCta?.trim()
    ? text.toLowerCase().includes(input.expectedCta.trim().toLowerCase())
    : /fale|solicite|compre|agende|saiba mais|entre em contato|whatsapp/i.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;

  const hasVerticalWriting = /writing-mode\s*:\s*(vertical|sideways)/i.test(html);
  const hasBreakAll = /word-break\s*:\s*break-all/i.test(html);
  const hasAnywhereWrap = /overflow-wrap\s*:\s*anywhere/i.test(html);
  const hasViewportWidthHack = /width\s*:\s*100vw/i.test(html) && /overflow-x\s*:\s*hidden/i.test(html);
  const hasFixedGiantHeader = /(?:header|nav)[\s\S]{0,700}(?:height|min-height)\s*:\s*(?:1[2-9]\d|[2-9]\d{2,})px/i.test(html);
  const suspiciousMobileTypography = /@media[\s\S]{0,1400}(?:h1|\.hero[^,{]*)[\s\S]{0,250}font-size\s*:\s*(?:5[6-9]|[6-9]\d|\d{3,})px/i.test(html);
  const hasCartCue = /carrinho|cart|adicionar ao carrinho|add to cart/i.test(text);
  const hasProductCue = /produto|preço|r\$|comprar/i.test(text);
  const ecommerceMissingCore = input.surface === 'ecommerce' && (!hasCartCue || !hasProductCue);
  const ecommerceUsesWhatsAppCheckout = input.surface === 'ecommerce' && (
    /id=["'][^"']*checkout[^"']*["'][^>]{0,500}href=["']https?:\/\/(?:wa\.me|api\.whatsapp)/i.test(html)
    || /getElementById\(["'][^"']*checkout[^"']*["']\)[\s\S]{0,500}(?:wa\.me|api\.whatsapp)/i.test(html)
    || /finalizar[^<\n]{0,120}whatsapp/i.test(cssAndHtml)
  );
  const ecommerceHasAsaasCheckout = input.surface !== 'ecommerce'
    || /\/api\/public\/tenant-commerce\/checkout/i.test(html);

  const severeLayoutIssues = [
    hasVerticalWriting,
    hasBreakAll,
    hasFixedGiantHeader,
    suspiciousMobileTypography,
    ecommerceMissingCore,
    ecommerceUsesWhatsAppCheckout,
    !ecommerceHasAsaasCheckout,
  ].filter(Boolean).length;
  const moderateLayoutIssues = [hasAnywhereWrap, hasViewportWidthHack, !hasMobileMedia].filter(Boolean).length;

  const imageIntegrity = input.requiredImageCount && input.requiredImageCount > 0
    ? Math.max(0, Math.min(100, Math.round(((input.requiredImageCount - (input.injectedImageCount ?? 0)) / input.requiredImageCount) * 100)))
    : 92;
  const seo = typeof input.seoScore === 'number' ? Math.max(0, Math.min(100, input.seoScore)) : 85;

  const baseReadability = words > 80 && words < 5_000 ? 92 : 80;
  const readabilityScore = Math.max(45, baseReadability - severeLayoutIssues * 18 - moderateLayoutIssues * 6);
  const baseComposition = hasH1 && hasMain && hasSections ? 94 : 80;
  const compositionScore = Math.max(40, baseComposition - severeLayoutIssues * 20 - moderateLayoutIssues * 7);
  const mobileScore = hasResponsiveMeta && hasMobileMedia ? 96 : hasResponsiveMeta ? 78 : 60;
  const channelFitScore = Math.max(40, Math.round((mobileScore * 0.62 + seo * 0.38) - severeLayoutIssues * 12 - moderateLayoutIssues * 5));
  const technicalScore = input.technicalValid
    ? Math.max(45, Math.round((96 + imageIntegrity) / 2) - severeLayoutIssues * 12 - moderateLayoutIssues * 4)
    : 45;

  return buildGenerationDesignQa({
    brandScore: input.hasBrandContext ? 94 : 76,
    readabilityScore,
    compositionScore,
    channelFitScore,
    ctaScore: hasCta ? 96 : 65,
    technicalScore,
    warnings: [
      ...(!input.hasBrandContext ? ['Contexto de marca incompleto para a página.'] : []),
      ...(!hasResponsiveMeta ? ['Viewport responsivo não identificado.'] : []),
      ...(!hasMobileMedia ? ['Regras responsivas explícitas para mobile não foram identificadas.'] : []),
      ...(!hasCta ? ['CTA principal não identificado com clareza.'] : []),
      ...(!input.technicalValid ? ['HTML não passou na validação técnica do Site Generator.'] : []),
      ...(hasVerticalWriting ? ['Texto vertical detectado. Navegação, carrinho e CTAs não podem quebrar em coluna.'] : []),
      ...(hasBreakAll ? ['word-break: break-all detectado; isso pode destruir a legibilidade mobile.'] : []),
      ...(hasAnywhereWrap ? ['overflow-wrap:anywhere detectado; revisar controles compactos e cabeçalho.'] : []),
      ...(hasViewportWidthHack ? ['Uso de 100vw com overflow-x hidden sugere correção visual por recorte em vez de layout responsivo.'] : []),
      ...(hasFixedGiantHeader ? ['Header/nav com altura fixa excessiva detectado.'] : []),
      ...(suspiciousMobileTypography ? ['Tipografia mobile excessivamente grande detectada.'] : []),
      ...(ecommerceMissingCore ? ['E-commerce sem sinais suficientes de catálogo e carrinho.'] : []),
      ...(ecommerceUsesWhatsAppCheckout ? ['Checkout financeiro via WhatsApp detectado. Pagamentos de e-commerce devem finalizar exclusivamente pelo Asaas.'] : []),
      ...(!ecommerceHasAsaasCheckout ? ['E-commerce sem integração ao checkout oficial Asaas do tenant.'] : []),
      ...((input.injectedImageCount ?? 0) > 0 ? ['Parte das mídias obrigatórias precisou ser reinserida pelo fallback determinístico.'] : []),
    ],
    recommendations: [
      ...(!hasCta ? ['Reforçar um único CTA principal alinhado ao objetivo da campanha.'] : []),
      ...(!input.hasBrandContext ? ['Completar logo, cor e tom no Perfil da Empresa.'] : []),
      ...(!hasResponsiveMeta || !hasMobileMedia ? ['Garantir layout mobile-first real em 360px, 768px e desktop.'] : []),
      ...(severeLayoutIssues > 0 ? ['Regenerar a composição usando o padrão visual avançado antes de publicar.'] : []),
      ...(ecommerceMissingCore ? ['Reposicionar a grade de produtos como foco da página e usar carrinho compacto e funcional.'] : []),
      ...(ecommerceUsesWhatsAppCheckout || !ecommerceHasAsaasCheckout ? ['Trocar a finalização por POST /api/public/tenant-commerce/checkout e redirecionar para paymentUrl do Asaas.'] : []),
    ],
    threshold: severeLayoutIssues > 0 ? 88 : 82,
  });
}