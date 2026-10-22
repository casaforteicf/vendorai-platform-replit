export type ProposalAssetSession = { authorization?: string; cookie?: string };

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_TOTAL_BYTES = 48 * 1024 * 1024;

/** Always fetch through the local authenticated storage boundary, never a caller-supplied host. */
export function proposalStorageAssetUrl(raw: string): string | null {
  const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");
  let value = raw.replace(/&amp;/g, "&");
  if (/^data:/i.test(value)) return null;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (!["localhost", "127.0.0.1", "app.appvendorai.com", "api.appvendorai.com"].includes(url.hostname)) return null;
    value = url.pathname;
  }
  if (basePath && value.startsWith(basePath + "/")) value = value.slice(basePath.length);
  if (value.startsWith("/objects/")) value = "/api/storage" + value;
  value = value.replace("/api/storage/public-objects/objects/", "/api/storage/objects/");
  if (!value.startsWith("/api/storage/objects/") && !value.startsWith("/api/storage/public-objects/")) return null;
  return `http://127.0.0.1:${process.env.PORT ?? "8080"}${basePath}${value}`;
}

/** Embeds authorized private images so Chromium and downloaded files need no browser session. */
export async function embedProposalStorageImages(html: string, session: ProposalAssetSession = {}): Promise<string> {
  const sources = Array.from(html.matchAll(/(?:\bsrc\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"'()\s]+)["']?\s*\))/gi))
    .map((match) => match[1] ?? match[2]).filter(Boolean);
  const byUrl = new Map<string, string[]>();
  for (const source of sources) {
    const url = proposalStorageAssetUrl(source);
    if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), source]);
  }
  if (byUrl.size > 100) throw new Error("A proposta excedeu o limite de imagens para exportação.");
  let totalBytes = 0;
  const replacements = new Map<string, string>();
  const queue = [...byUrl.entries()];
  async function worker() {
    while (queue.length) {
      const entry = queue.shift();
      if (!entry) return;
      const [url, originals] = entry;
      const headers: Record<string, string> = {};
      if (session.authorization) headers.Authorization = session.authorization;
      if (session.cookie) headers.Cookie = session.cookie;
      const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Não foi possível carregar a capa ou logo da proposta. Confira o acesso ao arquivo antes de exportar.");
      const type = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
      if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml", "image/avif"].includes(type)) {
        throw new Error("Um arquivo de imagem da proposta retornou formato inválido.");
      }
      if (Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("Imagem muito grande para exportar.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Arquivo de imagem indisponível.");
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          totalBytes += value.byteLength;
          if (bytes > MAX_IMAGE_BYTES || totalBytes > MAX_TOTAL_BYTES) throw new Error("Imagens excedem o limite de exportação.");
          chunks.push(value);
        }
      } catch (error) {
        await reader.cancel().catch(() => {});
        throw error;
      } finally { reader.releaseLock(); }
      if (!bytes) throw new Error("Arquivo de imagem vazio.");
      const embedded = `data:${type};base64,${Buffer.concat(chunks).toString("base64")}`;
      for (const original of originals) replacements.set(original, embedded);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  return html.replace(/(?:\bsrc\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"'()\s]+)["']?\s*\))/gi, (match, src, css) => {
    const original = src ?? css;
    const embedded = replacements.get(original);
    return embedded ? match.replace(original, embedded) : match;
  });
}
