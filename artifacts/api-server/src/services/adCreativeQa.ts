import type { AdCreative } from '@workspace/db';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { buildGenerationDesignQa } from './contentCreativeRuntime';

export function buildAdCreativeDesignQa(input: {
  creative: AdCreative;
  platform: 'google' | 'meta';
}): DesignQaResult {
  const { creative, platform } = input;
  const headlines = creative.headlines ?? [];
  const descriptions = creative.descriptions ?? [];
  const images = creative.imagens ?? [];
  const text = [...headlines, ...descriptions].join(' ').trim();
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const hasCta = /saiba|fale|compre|solicite|acesse|agende|conhe[cç]a|pe[cç]a|chame|whatsapp/i.test(text);

  const hasRequiredText = platform === 'google'
    ? headlines.length >= 3 && descriptions.length >= 2
    : headlines.length >= 1 && descriptions.length >= 1;
  const hasRequiredMedia = platform === 'google' ? true : images.length >= 1;

  return buildGenerationDesignQa({
    brandScore: 88,
    readabilityScore: wordCount > 0 && wordCount < 500 ? 92 : 78,
    compositionScore: hasRequiredText ? 94 : 65,
    channelFitScore: hasRequiredText && hasRequiredMedia ? 94 : 62,
    ctaScore: hasCta ? 94 : 70,
    technicalScore: hasRequiredText && hasRequiredMedia ? 96 : 58,
    warnings: [
      ...(!hasRequiredText ? ['Criativo incompleto para os requisitos mínimos do canal.'] : []),
      ...(!hasRequiredMedia ? ['Meta Ads exige imagem válida neste fluxo de publicação.'] : []),
      ...(!hasCta ? ['CTA não foi identificado com clareza no criativo.'] : []),
    ],
    recommendations: [
      ...(!hasRequiredText ? ['Completar títulos e descrições antes de publicar.'] : []),
      ...(!hasRequiredMedia ? ['Selecionar uma imagem aprovada antes de publicar na Meta.'] : []),
      ...(!hasCta ? ['Reforçar CTA alinhado ao objetivo da campanha.'] : []),
    ],
    threshold: 78,
  });
}
