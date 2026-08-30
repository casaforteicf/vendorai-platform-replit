/**
 * Análise de SEO/legibilidade/qualidade pra páginas geradas (landing page,
 * e-commerce, institucional) -- D-005. Mesmo espírito do checklist já usado
 * no Content Autopilot (Otimizador), adaptado pra HTML de página em vez de
 * markdown de artigo de blog: sem densidade de keyword (não faz sentido pra
 * uma LP, que não é escrita pra um termo de busca específico), com checagem
 * de alt-text de imagem (boa prática de SEO/acessibilidade específica de
 * página, sem equivalente em artigo).
 *
 * Determinístico, sem chamada de IA -- checklist auditável, custo zero.
 */
import type { SiteSeoChecklist } from "@workspace/db";

export interface SiteSeoScoreResult {
  score: number;
  checklist: SiteSeoChecklist;
}

function extractTagContent(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return match?.[1]?.trim() ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function avgWordsPerSentence(text: string): number {
  const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  return totalWords / sentences.length;
}

export function computeSiteSeoScore(html: string): SiteSeoScoreResult {
  const titulo = extractTagContent(html, /<title[^>]*>([^<]*)<\/title>/i);
  const metaDescription = extractTagContent(
    html,
    /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i
  );
  const bodyText = stripHtml(html);
  const headerCount = (html.match(/<h[1-3][\s>]/gi) ?? []).length;
  const imgTags = html.match(/<img\s[^>]*>/gi) ?? [];
  const imgsWithAlt = imgTags.filter((tag) => /\balt\s*=\s*["'][^"']+["']/i.test(tag));

  const checklist: SiteSeoChecklist = {
    tituloOk: titulo.length >= 20 && titulo.length <= 65,
    metaDescriptionOk: metaDescription.length >= 100 && metaDescription.length <= 165,
    headersOk: headerCount >= 2,
    // Landing page é mais curta que artigo de blog -- 150 palavras de
    // conteúdo visível é um piso razoável, não os 600 usados pra artigo.
    tamanhoMinimoOk: countWords(bodyText) >= 150,
    legibilidadeOk: avgWordsPerSentence(bodyText) <= 30,
    imagensAltOk: imgTags.length === 0 || imgsWithAlt.length / imgTags.length >= 0.8,
  };

  const total = Object.values(checklist).length;
  const passed = Object.values(checklist).filter(Boolean).length;
  const score = Math.round((passed / total) * 100);

  return { score, checklist };
}
