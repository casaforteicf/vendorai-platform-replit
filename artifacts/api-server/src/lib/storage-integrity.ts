/**
 * Helpers puros da auditoria de integridade storage ↔ banco.
 *
 * O banco guarda URLs em vários formatos históricos:
 *   - /objects/quotes/<uuid>.png
 *   - /api/storage/objects/uploads/<uuid>
 *   - https://app.../api/storage/objects/quotes/<uuid>.pdf
 *   - arrays JSON com várias URLs
 * Todos precisam ser normalizados para `/objects/<entity>` antes de checar
 * existência no backend (R2/Supabase).
 */

const OBJECT_MARKER = "/objects/";

/** Colunas de marca que podem ser anuladas com segurança quando o objeto
 *  sumiu: a UI cai no fallback (iniciais/nome) em vez de exibir imagem
 *  quebrada. Conteúdo histórico (renders, anexos, mensagens) NÃO entra aqui. */
export const BRAND_REFERENCE_COLUMNS = [
  { table: "tenants", column: "logo_url" },
  { table: "business_profiles", column: "logo_url" },
  { table: "business_profiles", column: "favicon_url" },
  { table: "tenant_themes", column: "logo_url" },
  { table: "tenant_themes", column: "logo_light_bg_url" },
  { table: "tenant_themes", column: "logo_dark_bg_url" },
  { table: "tenant_themes", column: "logo_icon_url" },
] as const;

/**
 * Normaliza uma referência para o formato canônico `/objects/<entity>`.
 * Retorna null quando não há um object path reconhecível.
 */
export function normalizeObjectPath(raw: string | null | undefined): string | null {
  const input = String(raw ?? "").trim();
  if (!input) return null;

  let pathname = input;
  if (/^https?:\/\//i.test(input)) {
    try {
      pathname = new URL(input).pathname;
    } catch {
      return null;
    }
  }

  const markerIndex = pathname.indexOf(OBJECT_MARKER);
  if (markerIndex === -1) return null;

  let rest = pathname.slice(markerIndex + 1).split(/[?#]/)[0] ?? "";
  // Remove pontuação de fechamento que aparece quando o valor veio de JSON
  // serializado como texto (ex: `.png"]}`).
  rest = rest.replace(/["'\\\])}>,;]+$/g, "").replace(/\/+$/g, "");
  const segments = rest.split("/");
  if (segments.length < 2 || !segments[1]) return null;

  try {
    rest = rest
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    /* mantém o valor original se o percent-encoding for inválido */
  }

  return `/${rest}`;
}

/** Extrai todos os object paths únicos de um valor (texto, JSON, CSV...). */
export function extractObjectPaths(value: string | null | undefined): string[] {
  if (!value || typeof value !== "string") return [];
  const found = new Set<string>();
  const re = /\/objects\/[^\s"'\\\]\[{}<>]+/g;
  for (const match of value.matchAll(re)) {
    const normalized = normalizeObjectPath(match[0]);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

export interface MissingObject {
  path: string;
  sources: string[];
}

/** Agrupa os objetos ausentes por tabela.coluna, contando cada origem uma vez. */
export function groupMissingBySource(missing: MissingObject[]): Array<{ source: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of missing) {
    for (const source of new Set(item.sources)) {
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
}
