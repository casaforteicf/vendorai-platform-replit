export interface SiteMediaQualityResult {
  imageCount: number;
  videoCount: number;
  brokenOrPlaceholderCount: number;
  missingAltCount: number;
  destructiveCropRiskCount: number;
  unstableMediaCount: number;
  hasAdaptiveGrid: boolean;
  hasStableMediaSizing: boolean;
  severeIssues: string[];
  warnings: string[];
  score: number;
}

function countMatches(value: string, pattern: RegExp): number {
  return (value.match(pattern) ?? []).length;
}

function getImgTags(html: string): string[] {
  return html.match(/<img\b[^>]*>/gi) ?? [];
}

function attr(tag: string, name: string): string | null {
  return tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))?.[1] ?? null;
}

export function inspectSiteMediaQuality(html: string): SiteMediaQualityResult {
  const source = html || '';
  const images = getImgTags(source);
  const videoCount = countMatches(source, /<(?:video|iframe)\b/gi);

  let brokenOrPlaceholderCount = 0;
  let missingAltCount = 0;
  let unstableMediaCount = 0;

  for (const tag of images) {
    const src = (attr(tag, 'src') ?? '').trim();
    const alt = (attr(tag, 'alt') ?? '').trim();
    const width = attr(tag, 'width');
    const height = attr(tag, 'height');

    if (!src || /(?:placeholder|placehold\.co|via\.placeholder|dummyimage|example\.com|unsplash\.com|pexels\.com)/i.test(src)) {
      brokenOrPlaceholderCount += 1;
    }
    if (!alt) missingAltCount += 1;
    if (!width && !height && !/aspect-ratio\s*:/i.test(source)) unstableMediaCount += 1;
  }

  const coverCount = countMatches(source, /object-fit\s*:\s*cover/gi);
  const containCount = countMatches(source, /object-fit\s*:\s*contain/gi);
  const positionedCropCount = countMatches(source, /object-position\s*:/gi);
  const destructiveCropRiskCount = Math.max(0, coverCount - positionedCropCount - containCount);

  const hasAdaptiveGrid = /grid-template-columns\s*:\s*repeat\s*\(\s*auto-(?:fit|fill)/i.test(source)
    || (/grid-template-columns\s*:[^;]*(?:minmax|1fr)/i.test(source) && /@media[\s\S]{0,1800}(?:grid-template-columns|display\s*:\s*grid)/i.test(source));
  const hasStableMediaSizing = /aspect-ratio\s*:/i.test(source)
    || images.every((tag) => Boolean(attr(tag, 'width') && attr(tag, 'height')));

  const severeIssues: string[] = [];
  const warnings: string[] = [];

  if (brokenOrPlaceholderCount > 0) severeIssues.push(`${brokenOrPlaceholderCount} mídia(s) quebrada(s), placeholder ou fonte externa genérica detectada(s).`);
  if (images.length >= 3 && !hasAdaptiveGrid) severeIssues.push('Conjunto de imagens sem grade responsiva/adaptativa detectável.');
  if (images.length >= 2 && destructiveCropRiskCount >= Math.ceil(images.length / 2)) severeIssues.push('Risco alto de cortes destrutivos: object-fit:cover sem enquadramento suficiente.');
  if (missingAltCount > 0) warnings.push(`${missingAltCount} imagem(ns) sem texto alternativo contextual.`);
  if (unstableMediaCount > 1 && !hasStableMediaSizing) warnings.push('Mídias sem proporção/tamanho estável podem causar recorte, salto de layout e desalinhamento.');
  if (coverCount > 0 && positionedCropCount === 0) warnings.push('Imagens com cover sem object-position explícito; revisar enquadramento do assunto principal.');

  const penalty = severeIssues.length * 24 + warnings.length * 7 + Math.min(20, brokenOrPlaceholderCount * 10);
  const score = Math.max(20, Math.min(100, 100 - penalty));

  return {
    imageCount: images.length,
    videoCount,
    brokenOrPlaceholderCount,
    missingAltCount,
    destructiveCropRiskCount,
    unstableMediaCount,
    hasAdaptiveGrid,
    hasStableMediaSizing,
    severeIssues,
    warnings,
    score,
  };
}
