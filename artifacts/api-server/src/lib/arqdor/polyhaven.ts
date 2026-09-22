const POLYHAVEN_API = "https://api.polyhaven.com";
const USER_AGENT = "Arqdor/1.0 (3D asset browser)";

type PolyHavenSearchRow = {
  slug: string;
  score?: number;
};

type PolyHavenAsset = {
  name?: string;
  description?: string;
  thumbnail_url?: string;
  category?: string;
  tags?: string[];
  authors?: Record<string, string>;
  download_count?: number;
  [key: string]: unknown;
};

const PT_EN_TERMS: Array<[RegExp, string]> = [
  [/\bsof[áa]\b/gi, "sofa"], [/\bpoltrona\b/gi, "armchair"], [/\bcama\b/gi, "bed"],
  [/\bmesa de jantar\b/gi, "dining table"], [/\bmesa\b/gi, "table"], [/\bcadeira\b/gi, "chair"],
  [/\bbanqueta\b/gi, "stool"], [/\bbanco\b/gi, "bench"], [/\barm[áa]rio\b/gi, "cabinet"],
  [/\broupeiro\b/gi, "wardrobe"], [/\bestante\b/gi, "shelf"], [/\bgeladeira\b/gi, "refrigerator"],
  [/\brefrigerador\b/gi, "refrigerator"], [/\bforno\b/gi, "oven"], [/\bmicro-ondas\b/gi, "microwave"],
  [/\bmicroondas\b/gi, "microwave"], [/\bcooktop\b/gi, "cooktop"], [/\bcoifa\b/gi, "range hood"],
  [/\blumin[áa]ria\b/gi, "lamp"], [/\bpendente\b/gi, "pendant lamp"], [/\babajur\b/gi, "table lamp"],
  [/\bplanta\b/gi, "plant"], [/\b[áa]rvore\b/gi, "tree"], [/\bpalmeira\b/gi, "palm"],
  [/\bvaso\b/gi, "vase"], [/\bdecora[cç][aã]o\b/gi, "decor"], [/\btapete\b/gi, "rug"],
  [/\bespregui[cç]adeira\b/gi, "sun lounger"], [/\bm[óo]veis externos\b/gi, "outdoor furniture"],
  [/\bcozinha\b/gi, "kitchen"], [/\bbanheiro\b/gi, "bathroom"], [/\bescrit[óo]rio\b/gi, "office"],
  [/\bgabinete\b/gi, "cabinet"], [/\bbalc[aã]o\b/gi, "cabinet"], [/\bilha\b/gi, "island"],
  [/\bcuba\b/gi, "sink"], [/\blavat[óo]rio\b/gi, "sink"], [/\bvaso sanit[aá]rio\b/gi, "toilet"],
  [/\bbacia sanit[aá]ria\b/gi, "toilet"], [/\bbanheira\b/gi, "bathtub"], [/\bchuveiro\b/gi, "shower"],
  [/\bmesa escrit[óo]rio\b/gi, "office desk"], [/\bcadeira escrit[óo]rio\b/gi, "office chair"],
  [/\bestante escrit[óo]rio\b/gi, "bookshelf"], [/\btorre quente\b/gi, "tall kitchen cabinet"],
];

function safeQuery(value: string) {
  let query = value.trim().toLocaleLowerCase("pt-BR").slice(0, 100);
  for (const [pattern, replacement] of PT_EN_TERMS) query = query.replace(pattern, replacement);
  return query.replace(/\s+/g, " ").trim();
}

let assetsCache: { expiresAt: number; value: Record<string, PolyHavenAsset> } | null = null;

async function getModelAssets() {
  const now = Date.now();
  if (assetsCache && assetsCache.expiresAt > now) return assetsCache.value;
  const value = await phFetch("/assets?t=models") as Record<string, PolyHavenAsset>;
  assetsCache = { value, expiresAt: now + 10 * 60 * 1000 };
  return value;
}

async function phFetch(path: string) {
  const response = await fetch(`${POLYHAVEN_API}${path}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Poly Haven API ${response.status}`);
  }
  return response.json();
}

export async function searchPolyHavenModels(query: string, limit = 18) {
  const q = safeQuery(query || "furniture");
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 18));
  let search: { results?: PolyHavenSearchRow[] };
  try {
    search = await phFetch(`/search?q=${encodeURIComponent(q)}&t=models&limit=${safeLimit}`) as {
      results?: PolyHavenSearchRow[];
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) return [];
    throw error;
  }
  const rows = Array.isArray(search.results) ? search.results.slice(0, safeLimit) : [];
  if (!rows.length) return [];

  const assets = await getModelAssets();
  return rows.flatMap((row) => {
    const asset = assets?.[row.slug];
    if (!asset) return [];
    return [{
      slug: row.slug,
      name: asset.name ?? row.slug.replace(/_/g, " "),
      description: asset.description ?? "",
      thumbnailUrl: asset.thumbnail_url ?? null,
      category: asset.category ?? "3D Model",
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      authors: asset.authors ?? {},
      downloadCount: Number(asset.download_count ?? 0),
      score: Number(row.score ?? 0),
      source: "Poly Haven",
      license: "CC0",
      attributionRequired: false,
    }];
  });
}

function collectGlbCandidates(value: unknown, out: Array<{ url: string; keyPath: string }>, keyPath = "") {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && /\.glb(?:\?|#|$)/i.test(value)) {
      out.push({ url: value, keyPath });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectGlbCandidates(item, out, `${keyPath}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) =>
    collectGlbCandidates(child, out, keyPath ? `${keyPath}.${key}` : key)
  );
}

function rankGlb(candidate: { url: string; keyPath: string }) {
  const text = `${candidate.keyPath} ${candidate.url}`.toLowerCase();
  let score = 0;
  if (/1k/.test(text)) score += 25;
  if (/2k/.test(text)) score += 20;
  if (/blend/.test(text)) score -= 15;
  if (/raw/.test(text)) score -= 5;
  if (/lod/.test(text)) score += 4;
  if (/glb/.test(text)) score += 10;
  return score;
}

export async function resolvePolyHavenModel(slug: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error("Asset inválido");
  const [info, files] = await Promise.all([
    phFetch(`/info/${encodeURIComponent(slug)}`) as Promise<PolyHavenAsset>,
    phFetch(`/files/${encodeURIComponent(slug)}`),
  ]);

  const candidates: Array<{ url: string; keyPath: string }> = [];
  collectGlbCandidates(files, candidates);
  candidates.sort((a, b) => rankGlb(b) - rankGlb(a));
  const best = candidates[0]?.url ?? null;

  return {
    slug,
    name: info.name ?? slug.replace(/_/g, " "),
    description: info.description ?? "",
    thumbnailUrl: info.thumbnail_url ?? null,
    category: info.category ?? "3D Model",
    tags: Array.isArray(info.tags) ? info.tags : [],
    authors: info.authors ?? {},
    model3dUrl: best,
    source: "Poly Haven",
    license: "CC0",
    attributionRequired: false,
    poweredBy: "Poly Haven",
  };
}
