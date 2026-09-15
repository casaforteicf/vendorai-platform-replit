import puppeteer from "puppeteer-core";

export interface SiteVisualViewport {
  key: "mobile-360" | "mobile-390" | "tablet" | "desktop";
  width: number;
  height: number;
}

export interface RenderedViewportMetrics {
  horizontalOverflowPx: number;
  clippedElementCount: number;
  clippedTextCount: number;
  clippedActionCount: number;
  occludedActionCount: number;
  hiddenActionCount: number;
  emptySectionCount: number;
  oversizedEmptySectionCount: number;
  hugeGapCount: number;
  visibleContentCount: number;
}

export interface RenderedViewportQa extends RenderedViewportMetrics {
  viewport: SiteVisualViewport;
  screenshotBytes: number;
  score: number;
  severeIssues: string[];
  warnings: string[];
}

export interface SiteRenderedVisualQaResult {
  rendered: boolean;
  approved: boolean;
  score: number;
  viewports: RenderedViewportQa[];
  severeIssues: string[];
  warnings: string[];
  error?: string;
}

export const SITE_VISUAL_VIEWPORTS: SiteVisualViewport[] = [
  { key: "mobile-360", width: 360, height: 800 },
  { key: "mobile-390", width: 390, height: 844 },
  { key: "tablet", width: 768, height: 1024 },
  { key: "desktop", width: 1440, height: 1000 },
];

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function scoreRenderedViewportMetrics(
  viewport: SiteVisualViewport,
  metrics: RenderedViewportMetrics,
  screenshotBytes = 1,
): RenderedViewportQa {
  const severeIssues: string[] = [];
  const warnings: string[] = [];

  if (metrics.horizontalOverflowPx > 8) {
    severeIssues.push(`${viewport.key}: conteúdo ultrapassa a largura da tela em ${metrics.horizontalOverflowPx}px.`);
  } else if (metrics.horizontalOverflowPx > 2) {
    warnings.push(`${viewport.key}: pequeno overflow horizontal detectado (${metrics.horizontalOverflowPx}px).`);
  }

  if (metrics.clippedActionCount > 0) {
    severeIssues.push(`${viewport.key}: ${metrics.clippedActionCount} botão(ões)/CTA(s) aparecem cortados fora da área visível.`);
  }
  if (metrics.occludedActionCount > 0) {
    severeIssues.push(`${viewport.key}: ${metrics.occludedActionCount} botão(ões)/CTA(s) estão cobertos por outro elemento.`);
  }
  if (metrics.hiddenActionCount > 0) {
    warnings.push(`${viewport.key}: ${metrics.hiddenActionCount} ação(ões) renderizadas ficaram invisíveis ou pequenas demais para uso.`);
  }
  if (metrics.clippedTextCount > 0) {
    warnings.push(`${viewport.key}: ${metrics.clippedTextCount} bloco(s) de texto apresentam corte real após renderização.`);
  }
  if (metrics.clippedElementCount >= 3) {
    severeIssues.push(`${viewport.key}: ${metrics.clippedElementCount} elementos relevantes ultrapassam os limites horizontais.`);
  } else if (metrics.clippedElementCount > 0) {
    warnings.push(`${viewport.key}: ${metrics.clippedElementCount} elemento(s) ultrapassam parcialmente os limites horizontais.`);
  }
  if (metrics.oversizedEmptySectionCount > 0) {
    severeIssues.push(`${viewport.key}: ${metrics.oversizedEmptySectionCount} seção(ões) vazias ocupam mais de uma tela inteira.`);
  } else if (metrics.emptySectionCount > 0) {
    warnings.push(`${viewport.key}: ${metrics.emptySectionCount} seção(ões) com espaço vazio excessivo.`);
  }
  if (metrics.hugeGapCount > 0) {
    warnings.push(`${viewport.key}: ${metrics.hugeGapCount} intervalo(s) vertical(is) excessivo(s) entre seções.`);
  }
  if (metrics.visibleContentCount === 0 || screenshotBytes < 1_500) {
    severeIssues.push(`${viewport.key}: a página parece vazia ou não renderizou conteúdo utilizável.`);
  }

  let score = 100;
  score -= metrics.horizontalOverflowPx > 8 ? 24 : metrics.horizontalOverflowPx > 2 ? 8 : 0;
  score -= Math.min(28, metrics.clippedElementCount * 7);
  score -= Math.min(24, metrics.clippedTextCount * 6);
  score -= Math.min(36, metrics.clippedActionCount * 18);
  score -= Math.min(36, metrics.occludedActionCount * 18);
  score -= Math.min(20, metrics.hiddenActionCount * 8);
  score -= Math.min(18, metrics.emptySectionCount * 5);
  score -= Math.min(24, metrics.oversizedEmptySectionCount * 12);
  score -= Math.min(15, metrics.hugeGapCount * 5);
  if (metrics.visibleContentCount === 0 || screenshotBytes < 1_500) score -= 45;

  return {
    viewport,
    ...metrics,
    screenshotBytes,
    score: clampScore(score),
    severeIssues,
    warnings,
  };
}

function resolveChromiumPath(): string {
  return process.env["PUPPETEER_EXECUTABLE_PATH"]
    ?? process.env["CHROMIUM_PATH"]
    ?? "/usr/bin/chromium";
}

export async function inspectRenderedSiteVisualQuality(html: string): Promise<SiteRenderedVisualQaResult> {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: resolveChromiumPath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(10_000);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);

    const results: RenderedViewportQa[] = [];
    for (const viewport of SITE_VISUAL_VIEWPORTS) {
      await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10_000 });
      await page.addStyleTag({
        content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
      });
      await page.evaluate(async () => {
        try { await document.fonts?.ready; } catch {}
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      });

      const metrics = await page.evaluate((input) => {
        const width = input.width;
        const height = input.height;
        const root = document.documentElement;
        const body = document.body;
        const horizontalOverflowPx = Math.max(0, root.scrollWidth - root.clientWidth, body?.scrollWidth - root.clientWidth || 0);

        const isVisible = (el: Element) => {
          const style = window.getComputedStyle(el);
          const rect = (el as HTMLElement).getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && Number.parseFloat(style.opacity || "1") > 0.02
            && rect.width > 1
            && rect.height > 1;
        };

        const candidates = Array.from(document.body?.querySelectorAll("main,section,article,header,footer,nav,div,img,video,iframe,a,button,input,textarea,select") ?? [])
          .filter(isVisible);
        const clippedElementCount = candidates.filter((el) => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const style = window.getComputedStyle(el);
          if (style.position === "fixed" && rect.width <= width) return rect.left < -2 || rect.right > width + 2;
          return rect.width > 24 && (rect.left < -2 || rect.right > width + 2);
        }).length;

        const textNodes = Array.from(document.body?.querySelectorAll("h1,h2,h3,h4,p,li,label,span,a,button") ?? [])
          .filter(isVisible)
          .filter((el) => (el.textContent ?? "").trim().length >= 3);
        const clippedTextCount = textNodes.filter((el) => {
          const node = el as HTMLElement;
          const style = window.getComputedStyle(node);
          const clips = ["hidden", "clip"].includes(style.overflow)
            || ["hidden", "clip"].includes(style.overflowX)
            || ["hidden", "clip"].includes(style.overflowY);
          return clips && (node.scrollWidth > node.clientWidth + 2 || node.scrollHeight > node.clientHeight + 2);
        }).length;

        const actions = Array.from(document.body?.querySelectorAll("a[href],button,[role='button'],input[type='submit'],input[type='button']") ?? [])
          .filter((el) => {
            const label = ((el.textContent ?? "") + " " + (el.getAttribute("aria-label") ?? "")).trim();
            return label.length > 0;
          });

        let clippedActionCount = 0;
        let occludedActionCount = 0;
        let hiddenActionCount = 0;
        for (const el of actions) {
          const node = el as HTMLElement;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const rendered = style.display !== "none" && style.visibility !== "hidden";
          if (!rendered) continue;
          if (Number.parseFloat(style.opacity || "1") <= 0.02 || rect.width < 24 || rect.height < 20) hiddenActionCount += 1;
          if (rect.width > 1 && rect.height > 1 && (rect.left < -2 || rect.right > width + 2)) clippedActionCount += 1;

          const centerX = Math.min(width - 1, Math.max(0, rect.left + rect.width / 2));
          const centerY = rect.top + rect.height / 2;
          if (centerY >= 0 && centerY < height && rect.width >= 24 && rect.height >= 20) {
            const top = document.elementFromPoint(centerX, centerY);
            if (top && top !== el && !el.contains(top) && !top.contains(el)) occludedActionCount += 1;
          }
        }

        const sections = Array.from(document.body?.querySelectorAll("main > section, main > article, body > section, body > main, section") ?? [])
          .filter(isVisible)
          .map((el) => ({
            el,
            rect: (el as HTMLElement).getBoundingClientRect(),
            text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
            hasMedia: Boolean(el.querySelector("img,video,iframe,svg,canvas")),
          }))
          .filter((item, index, list) => list.findIndex((other) => other.el === item.el) === index)
          .sort((a, b) => a.rect.top - b.rect.top);

        const emptySectionCount = sections.filter((item) => item.rect.height > 280 && item.text.length < 12 && !item.hasMedia).length;
        const oversizedEmptySectionCount = sections.filter((item) => item.rect.height > height * 1.05 && item.text.length < 12 && !item.hasMedia).length;
        let hugeGapCount = 0;
        for (let i = 1; i < sections.length; i += 1) {
          const previous = sections[i - 1]!;
          const current = sections[i]!;
          const gap = current.rect.top - previous.rect.bottom;
          if (gap > height * 0.75) hugeGapCount += 1;
        }

        const visibleContentCount = Array.from(document.body?.querySelectorAll("h1,h2,h3,p,img,video,iframe,a,button") ?? [])
          .filter(isVisible).length;

        return {
          horizontalOverflowPx,
          clippedElementCount,
          clippedTextCount,
          clippedActionCount,
          occludedActionCount,
          hiddenActionCount,
          emptySectionCount,
          oversizedEmptySectionCount,
          hugeGapCount,
          visibleContentCount,
        };
      }, viewport);

      const screenshot = await page.screenshot({ type: "jpeg", quality: 55, fullPage: false });
      results.push(scoreRenderedViewportMetrics(viewport, metrics, screenshot.length));
    }

    const severeIssues = results.flatMap((result) => result.severeIssues);
    const warnings = results.flatMap((result) => result.warnings);
    const score = clampScore(results.reduce((sum, result) => sum + result.score, 0) / Math.max(1, results.length));
    const mobileScores = results.filter((result) => result.viewport.key.startsWith("mobile-")).map((result) => result.score);
    const approved = severeIssues.length === 0
      && score >= 90
      && mobileScores.every((value) => value >= 90);

    return { rendered: true, approved, score, viewports: results, severeIssues, warnings };
  } catch (error) {
    return {
      rendered: false,
      approved: false,
      score: 0,
      viewports: [],
      severeIssues: ["QA visual renderizado indisponível; publicação deve permanecer bloqueada até nova validação."],
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
