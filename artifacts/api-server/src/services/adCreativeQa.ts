import type { AdCreative } from '@workspace/db';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { buildGenerationDesignQa } from './contentCreativeRuntime';

function ratioScore(actual: number, required: number) {
  if (required <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, actual) / required) * 100);
}

export function buildAdCreativeDesignQa(input: {
  creative: AdCreative;
  platform: 'google' | 'meta';
}): DesignQaResult {
  const { creative, platform } = input;
  const headlines = (creative.headlines ?? []).filter((value) => value.trim().length > 0);
  const descriptions = (creative.descriptions ?? []).filter((value) => value.trim().length > 0);
  const images = (creative.imagens ?? []).filter((value) => value.trim().length > 0);
  const text = [...headlines, ...descriptions].join(' ').trim();
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const hasCta = /saiba|fale|compre|solicite|acesse|agende|conhe[cç]a|pe[cç]a|chame|whatsapp|comece|ver|teste/i.test(text);

  const requiredHeadlines = platform === 'google' ? 3 : 1;
  const requiredDescriptions = platform === 'google' ? 2 : 1;
  const requiredImages = platform === 'meta' ? 1 : 0;

  const headlineCoverage = ratioScore(headlines.length, requiredHeadlines);
  const descriptionCoverage = ratioScore(descriptions.length, requiredDescriptions);
  const mediaCoverage = ratioScore(images.length, requiredImages);
  const hasRequiredText = headlineCoverage === 100 && descriptionCoverage === 100;
  const hasRequiredMedia = mediaCoverage === 100;

  // Padrão visual aprovado: uma mensagem principal, apoio curto, um CTA e um único foco visual.
  // Para Meta, criativos excessivamente textuais perdem leitura no feed e não devem passar com nota máxima.
  const preferredMaxWords = platform === 'meta' ? 55 : 140;
  const hardMaxWords = platform === 'meta' ? 90 : 220;
  const tooManyHeadlines = platform === 'meta' && headlines.length > 2;
  const tooManyDescriptions = platform === 'meta' && descriptions.length > 2;
  const tooManyImages = platform === 'meta' && images.length > 1;
  const isCluttered = wordCount > hardMaxWords || tooManyHeadlines || tooManyDescriptions || tooManyImages;

  const readabilityScore = wordCount === 0
    ? 0
    : wordCount <= preferredMaxWords
      ? 100
      : ratioScore(preferredMaxWords, wordCount);

  const structuralComposition = Math.round((headlineCoverage + descriptionCoverage) / 2);
  const compositionScore = isCluttered
    ? Math.min(65, structuralComposition)
    : structuralComposition;

  const channelFitBase = platform === 'meta'
    ? Math.round((headlineCoverage + descriptionCoverage + mediaCoverage) / 3)
    : Math.round((headlineCoverage + descriptionCoverage) / 2);
  const channelFitScore = isCluttered ? Math.min(65, channelFitBase) : channelFitBase;
  const ctaScore = hasCta ? 100 : 0;
  const technicalScore = hasRequiredText && hasRequiredMedia ? 100 : 0;

  return buildGenerationDesignQa({
    // Este helper não recebe pixels renderizados nem evidência de logo/cores/tipografia.
    // Portanto não afirma compliance de marca sem observação real.
    brandScore: 0,
    readabilityScore,
    compositionScore,
    channelFitScore,
    ctaScore,
    technicalScore,
    warnings: [
      'Brand compliance não foi comprovado por este QA estrutural; é necessária evidência visual ou revisão humana.',
      ...(!hasRequiredText ? ['Criativo incompleto para os requisitos mínimos do canal.'] : []),
      ...(!hasRequiredMedia ? ['Meta Ads exige imagem válida neste fluxo de publicação.'] : []),
      ...(!hasCta ? ['CTA não foi identificado com clareza no criativo.'] : []),
      ...(wordCount > preferredMaxWords ? [`Texto acima do padrão visual recomendado para ${platform}: ${wordCount} palavras.`] : []),
      ...(tooManyHeadlines ? ['Meta: use uma headline principal e no máximo uma linha complementar.'] : []),
      ...(tooManyDescriptions ? ['Meta: excesso de blocos de apoio; reduza para uma mensagem curta.'] : []),
      ...(tooManyImages ? ['Meta: mantenha um único foco visual por peça; evite mosaico de imagens no criativo principal.'] : []),
      ...(isCluttered ? ['Criativo visualmente carregado: simplificação obrigatória antes da publicação autônoma.'] : []),
    ],
    recommendations: [
      'Validar logo, cores, tipografia e estilo visual contra o Brand Profile antes de publicação autônoma.',
      'Priorizar fotografia realista do contexto do negócio, com uma mensagem principal, apoio curto e CTA único.',
      'Evitar excesso de cards, selos, métricas, ícones, dashboards decorativos, hologramas e elementos competindo entre si.',
      ...(!hasRequiredText ? ['Completar títulos e descrições antes de publicar.'] : []),
      ...(!hasRequiredMedia ? ['Selecionar uma imagem aprovada antes de publicar na Meta.'] : []),
      ...(!hasCta ? ['Reforçar CTA alinhado ao objetivo da campanha.'] : []),
      ...(isCluttered ? ['Reduzir o criativo até que a proposta seja compreendida em aproximadamente 2 segundos.'] : []),
    ],
    threshold: 78,
  });
}
