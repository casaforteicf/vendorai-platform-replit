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
  const hasCta = /saiba|fale|compre|solicite|acesse|agende|conhe[cç]a|pe[cç]a|chame|whatsapp/i.test(text);

  const requiredHeadlines = platform === 'google' ? 3 : 1;
  const requiredDescriptions = platform === 'google' ? 2 : 1;
  const requiredImages = platform === 'meta' ? 1 : 0;

  const headlineCoverage = ratioScore(headlines.length, requiredHeadlines);
  const descriptionCoverage = ratioScore(descriptions.length, requiredDescriptions);
  const mediaCoverage = ratioScore(images.length, requiredImages);
  const hasRequiredText = headlineCoverage === 100 && descriptionCoverage === 100;
  const hasRequiredMedia = mediaCoverage === 100;

  const readabilityScore = wordCount === 0 ? 0 : wordCount <= 500 ? 100 : ratioScore(500, wordCount);
  const compositionScore = Math.round((headlineCoverage + descriptionCoverage) / 2);
  const channelFitScore = platform === 'meta'
    ? Math.round((headlineCoverage + descriptionCoverage + mediaCoverage) / 3)
    : Math.round((headlineCoverage + descriptionCoverage) / 2);
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
      ...(wordCount > 500 ? ['Texto excede 500 palavras neste QA estrutural.'] : []),
    ],
    recommendations: [
      'Validar logo, cores, tipografia e estilo visual contra o Brand Profile antes de publicação autônoma.',
      ...(!hasRequiredText ? ['Completar títulos e descrições antes de publicar.'] : []),
      ...(!hasRequiredMedia ? ['Selecionar uma imagem aprovada antes de publicar na Meta.'] : []),
      ...(!hasCta ? ['Reforçar CTA alinhado ao objetivo da campanha.'] : []),
    ],
    threshold: 78,
  });
}
