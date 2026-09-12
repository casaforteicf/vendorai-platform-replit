export type AiTrafficSourceInput = {
  source?: string | null;
  referrer?: string | null;
  sourceLabel?: string | null;
};

export function detectAiAssistant(input: AiTrafficSourceInput): string | null {
  const haystack = [input.source, input.referrer, input.sourceLabel]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/chatgpt|openai\.com/.test(haystack)) return "ChatGPT";
  if (/perplexity/.test(haystack)) return "Perplexity";
  if (/copilot\.microsoft|microsoft copilot/.test(haystack)) return "Microsoft Copilot";
  if (/gemini\.google|google gemini/.test(haystack)) return "Gemini";
  if (/claude\.ai|anthropic/.test(haystack)) return "Claude";
  return null;
}

export function normalizePageKey(value: string | null | undefined): string {
  if (!value) return "/";
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}` || "/";
    return path.length > 1 ? path.replace(/\/$/, "") : path;
  } catch {
    const trimmed = value.trim();
    if (!trimmed) return "/";
    return trimmed.length > 1 ? trimmed.replace(/\/$/, "") : trimmed;
  }
}

export function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
