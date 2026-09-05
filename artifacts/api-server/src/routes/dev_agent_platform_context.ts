import {
  loadEngineeringMemory,
  loadExecutionMemory,
  type EngineeringMemoryEntry,
  type ExecutionMemoryEntry,
} from "./dev_agent_memory";

type CodeCandidate = {
  path: string;
  name: string;
  url?: string;
  score: number;
  matchedBy: string[];
};

type RecentChange = {
  path: string;
  sha: string;
  message: string;
  author: string;
  date: string;
  url?: string;
};

type RelatedPullRequest = {
  number: number;
  title: string;
  head: string;
  updatedAt: string;
  url?: string;
};

export type PlatformContext = {
  route: string;
  routeTerms: string[];
  requestTerms: string[];
  codeCandidates: CodeCandidate[];
  recentChanges: RecentChange[];
  openRelatedPrs: RelatedPullRequest[];
  relevantMemory: EngineeringMemoryEntry[];
  relevantExecutionMemory: ExecutionMemoryEntry[];
  confidence: number;
  checkedAt: string;
};

const STOPWORDS = new Set([
  "agora", "ainda", "aqui", "coisa", "como", "corrige", "corrigir", "deixar", "esse", "esta", "fazer",
  "isso", "mais", "melhor", "melhora", "melhorar", "muito", "nao", "para", "pode", "precisa", "quero",
  "sistema", "tela", "tem", "uma", "voce", "voces",
]);

const CACHE_TTL_MS = 45_000;
const cache = new Map<string, { expiresAt: number; value: PlatformContext }>();

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, repository, owner, repo };
}

async function gh(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Platform-Context/1.1",
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeTerms(route: string) {
  return normalizeText(route.split("?")[0])
    .split(/[\s/_-]+/)
    .filter((term) => term.length >= 3 && !["admin", "api", "app", "support"].includes(term))
    .slice(0, 5);
}

function requestTerms(request: string) {
  const frequencies = new Map<string, number>();
  for (const word of normalizeText(request).split(/[\s/_-]+/)) {
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    frequencies.set(word, (frequencies.get(word) ?? 0) + 1);
  }
  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)
    .map(([term]) => term);
}

async function searchCode(term: string) {
  const { repository } = githubConfig();
  const query = encodeURIComponent(`${term} repo:${repository}`);
  const data = await gh(`/search/code?q=${query}&per_page=8`);
  return (data.items ?? []).map((item: any) => ({
    path: String(item.path ?? ""),
    name: String(item.name ?? ""),
    url: item.html_url ? String(item.html_url) : undefined,
  }));
}

function candidateScore(path: string, matchedBy: string[], routeSet: Set<string>, requestSet: Set<string>) {
  const normalized = normalizeText(path);
  let score = 0;
  for (const term of matchedBy) {
    if (routeSet.has(term)) score += 5;
    if (requestSet.has(term)) score += 3;
    if (normalized.includes(`/${term}`) || normalized.includes(`${term}.`)) score += 2;
  }
  if (path.startsWith("artifacts/frontend/src/pages/")) score += 3;
  if (path.startsWith("artifacts/frontend/src/components/")) score += 2;
  if (path.startsWith("artifacts/api-server/src/routes/")) score += 2;
  if (/\.(test|spec)\./i.test(path)) score -= 1;
  return score;
}

async function collectCodeCandidates(routeInput: string[], requestInput: string[]) {
  const terms = [...new Set([...routeInput, ...requestInput])].slice(0, 8);
  const routeSet = new Set(routeInput);
  const requestSet = new Set(requestInput);
  const found = new Map<string, { path: string; name: string; url?: string; matchedBy: Set<string> }>();

  const searches = await Promise.all(terms.map(async (term) => {
    try { return { term, items: await searchCode(term) }; } catch { return { term, items: [] as any[] }; }
  }));

  for (const search of searches) {
    for (const item of search.items) {
      if (!/\.(ts|tsx|js|jsx|mjs|css|sql|json)$/i.test(item.path)) continue;
      const existing = found.get(item.path) ?? { ...item, matchedBy: new Set<string>() };
      existing.matchedBy.add(search.term);
      found.set(item.path, existing);
    }
  }

  return [...found.values()]
    .map((item) => {
      const matchedBy = [...item.matchedBy];
      return { ...item, matchedBy, score: candidateScore(item.path, matchedBy, routeSet, requestSet) };
    })
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 12);
}

async function collectRecentChanges(paths: string[]) {
  const { owner, repo } = githubConfig();
  const selected = paths.slice(0, 5);
  const changes = await Promise.all(selected.map(async (path): Promise<RecentChange | null> => {
    try {
      const data = await gh(`/repos/${owner}/${repo}/commits?path=${encodeURIComponent(path)}&per_page=1`);
      const commit = data?.[0];
      if (!commit?.sha) return null;
      return {
        path,
        sha: String(commit.sha).slice(0, 40),
        message: String(commit.commit?.message ?? "").split("\n")[0].slice(0, 220),
        author: String(commit.commit?.author?.name ?? commit.author?.login ?? "unknown").slice(0, 100),
        date: String(commit.commit?.author?.date ?? ""),
        url: commit.html_url ? String(commit.html_url) : undefined,
      };
    } catch {
      return null;
    }
  }));
  return changes.filter((item): item is RecentChange => Boolean(item));
}

async function collectOpenRelatedPrs(terms: string[]) {
  const { repository } = githubConfig();
  const queryTerms = terms.slice(0, 3);
  if (!queryTerms.length) return [];
  try {
    const q = encodeURIComponent(`repo:${repository} is:pr is:open ${queryTerms.join(" ")}`);
    const data = await gh(`/search/issues?q=${q}&per_page=6`);
    return (data.items ?? []).slice(0, 6).map((item: any): RelatedPullRequest => ({
      number: Number(item.number),
      title: String(item.title ?? "").slice(0, 220),
      head: "",
      updatedAt: String(item.updated_at ?? ""),
      url: item.html_url ? String(item.html_url) : undefined,
    }));
  } catch {
    return [];
  }
}

function memoryScore(entry: EngineeringMemoryEntry, routeInput: string[], requestInput: string[]) {
  const haystack = normalizeText(`${entry.route} ${entry.consensus} ${entry.conflicts.join(" ")}`);
  let score = 0;
  for (const term of routeInput) if (haystack.includes(term)) score += 4;
  for (const term of requestInput) if (haystack.includes(term)) score += 2;
  if (normalizeText(entry.route) === normalizeText(routeInput.join("/"))) score += 2;
  return score;
}

function executionMemoryScore(entry: ExecutionMemoryEntry, routeInput: string[], requestInput: string[]) {
  const haystack = normalizeText(`${entry.route} ${entry.summary} ${entry.changedFiles.join(" ")} ${entry.failures.join(" ")}`);
  let score = 0;
  for (const term of routeInput) if (haystack.includes(term)) score += 5;
  for (const term of requestInput) if (haystack.includes(term)) score += 2;
  if (entry.mergeSha) score += 1;
  if (entry.failures.length) score += 1;
  return score;
}

async function collectRelevantMemory(routeInput: string[], requestInput: string[]) {
  try {
    const memory = await loadEngineeringMemory(25);
    return memory
      .map((entry) => ({ entry, score: memoryScore(entry, routeInput, requestInput) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.recordedAt.localeCompare(a.entry.recordedAt))
      .slice(0, 6)
      .map((item) => item.entry);
  } catch {
    return [];
  }
}

async function collectRelevantExecutionMemory(routeInput: string[], requestInput: string[]) {
  try {
    const memory = await loadExecutionMemory(25);
    return memory
      .map((entry) => ({ entry, score: executionMemoryScore(entry, routeInput, requestInput) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.recordedAt.localeCompare(a.entry.recordedAt))
      .slice(0, 6)
      .map((item) => item.entry);
  } catch {
    return [];
  }
}

export async function getPlatformContext(input: { route: string; request: string }): Promise<PlatformContext> {
  const routeInput = routeTerms(input.route);
  const requestInput = requestTerms(input.request);
  const cacheKey = `${input.route.split("?")[0]}|${requestInput.join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const codeCandidates = await collectCodeCandidates(routeInput, requestInput);
  const [recentChanges, openRelatedPrs, relevantMemory, relevantExecutionMemory] = await Promise.all([
    collectRecentChanges(codeCandidates.map((item) => item.path)),
    collectOpenRelatedPrs([...routeInput, ...requestInput]),
    collectRelevantMemory(routeInput, requestInput),
    collectRelevantExecutionMemory(routeInput, requestInput),
  ]);

  const evidenceSignals = Math.min(
    1,
    (codeCandidates.length / 6) * 0.5 +
      (recentChanges.length / 3) * 0.18 +
      (relevantMemory.length / 3) * 0.12 +
      (relevantExecutionMemory.length / 3) * 0.1 +
      (openRelatedPrs.length > 0 ? 0.1 : 0),
  );
  const value: PlatformContext = {
    route: input.route,
    routeTerms: routeInput,
    requestTerms: requestInput,
    codeCandidates,
    recentChanges,
    openRelatedPrs,
    relevantMemory,
    relevantExecutionMemory,
    confidence: Number(evidenceSignals.toFixed(2)),
    checkedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
