import { Router } from "express";
import { z } from "zod/v4";
import validationRouter from "./dev_agent_validation";

const router = Router();
router.use(validationRouter);

const impactSchema = z.object({
  requestId: z.string().min(1).max(120),
  request: z.string().min(1).max(12000),
  route: z.string().min(1).max(500),
  evidenceContext: z.string().max(24000).optional().default(""),
});

type ImpactNode = {
  path: string;
  domain: string;
  imports: string[];
  referencedBy: string[];
  riskSignals: string[];
};

export type ChangeImpact = {
  seedPaths: string[];
  nodes: ImpactNode[];
  affectedDomains: string[];
  blastRadius: number;
  risk: "low" | "medium" | "high" | "critical";
  reasons: string[];
  confidence: number;
};

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
      "User-Agent": "VendorAI-Dev-Impact/1.0",
    },
  });
  const text = await response.text();
  let data: any = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(data?.message ?? `GitHub HTTP ${response.status}`);
  return data;
}

function extractPaths(text: string) {
  const matches = text.match(/(?:artifacts|lib|scripts|backend|frontend)\/[A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|mjs|json|sql)/g) ?? [];
  return Array.from(new Set(matches.map((item) => item.replace(/[),.;:'"`]+$/g, "")))).slice(0, 8);
}

function domainFor(path: string) {
  if (path.includes("/frontend/") || /\.tsx?$/.test(path) && path.includes("components")) return "frontend";
  if (path.includes("api-server")) return "backend_api";
  if (path.includes("/db/") || /schema|migration|rls/i.test(path)) return "data_multitenant";
  if (/webhook|oauth|integration|railway|vercel/i.test(path)) return "integrations_devops";
  if (/auth|security|permission|secret|billing|payment/i.test(path)) return "security_reliability";
  return "shared";
}

function importsFrom(content: string) {
  const values = new Set<string>();
  const regexes = [
    /from\s+["']([^"']+)["']/g,
    /import\s*["']([^"']+)["']/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const regex of regexes) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) values.add(match[1]);
  }
  return Array.from(values).slice(0, 30);
}

function riskSignalsFor(path: string, content: string) {
  const signals: string[] = [];
  const combined = `${path}\n${content.slice(0, 12000)}`;
  if (/tenantId|tenant_id|RLS|row level security/i.test(combined)) signals.push("multi_tenant");
  if (/auth|Authorization|requireRole|permission|platformRole/i.test(combined)) signals.push("auth_permissions");
  if (/billing|payment|subscription|financeiro/i.test(combined)) signals.push("financial");
  if (/webhook|oauth|callback|integration/i.test(combined)) signals.push("external_integration");
  if (/migration|schema|drizzle|pgTable/i.test(combined)) signals.push("data_schema");
  if (/delete\(|\.delete\(|DROP\s+TABLE|truncate/i.test(combined)) signals.push("destructive_operation");
  return signals;
}

async function readFile(path: string) {
  const { owner, repo } = githubConfig();
  const data = await gh(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=main`);
  if (data.type !== "file" || typeof data.content !== "string") return null;
  const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
  return content.slice(0, 50000);
}

async function searchReferences(path: string) {
  const { repository } = githubConfig();
  const basename = path.split("/").pop()?.replace(/\.(tsx?|jsx?|mjs|json|sql)$/i, "") ?? "";
  if (basename.length < 4) return [];
  try {
    const q = encodeURIComponent(`${basename} repo:${repository}`);
    const data = await gh(`/search/code?q=${q}&per_page=12`);
    return (data.items ?? []).map((item: any) => String(item.path)).filter((item: string) => item !== path).slice(0, 10);
  } catch {
    return [];
  }
}

async function discoverSeeds(request: string, route: string, evidenceContext: string) {
  const explicit = extractPaths(`${evidenceContext}\n${request}`);
  if (explicit.length) return explicit;

  const { repository } = githubConfig();
  const routeTerms = route.split(/[/?#&=_-]+/).filter((term) => term.length >= 4);
  const requestTerms = request.toLowerCase().match(/[a-zà-ÿ0-9_-]{5,}/gi) ?? [];
  const terms = Array.from(new Set([...routeTerms, ...requestTerms])).slice(0, 4);
  const seeds: string[] = [];
  for (const term of terms) {
    try {
      const q = encodeURIComponent(`${term} repo:${repository}`);
      const data = await gh(`/search/code?q=${q}&per_page=5`);
      for (const item of data.items ?? []) {
        if (typeof item.path === "string" && !seeds.includes(item.path)) seeds.push(item.path);
        if (seeds.length >= 6) return seeds;
      }
    } catch {
      // descoberta é best-effort
    }
  }
  return seeds;
}

export async function analyzeChangeImpact(input: z.infer<typeof impactSchema>): Promise<ChangeImpact> {
  const seedPaths = await discoverSeeds(input.request, input.route, input.evidenceContext);
  const nodes: ImpactNode[] = [];

  for (const path of seedPaths.slice(0, 6)) {
    try {
      const content = await readFile(path);
      if (!content) continue;
      const referencedBy = await searchReferences(path);
      nodes.push({
        path,
        domain: domainFor(path),
        imports: importsFrom(content),
        referencedBy,
        riskSignals: riskSignalsFor(path, content),
      });
    } catch {
      nodes.push({ path, domain: domainFor(path), imports: [], referencedBy: [], riskSignals: ["evidence_unavailable"] });
    }
  }

  const affectedDomains = Array.from(new Set(nodes.map((node) => node.domain)));
  const referenceCount = nodes.reduce((total, node) => total + node.referencedBy.length, 0);
  const signalCount = nodes.reduce((total, node) => total + node.riskSignals.length, 0);
  const criticalSignal = nodes.some((node) => node.riskSignals.some((signal) => ["financial", "destructive_operation", "data_schema", "auth_permissions"].includes(signal)));
  const blastRadius = Math.min(100, nodes.length * 8 + referenceCount * 3 + affectedDomains.length * 6 + signalCount * 4);

  let risk: ChangeImpact["risk"] = "low";
  if (criticalSignal && blastRadius >= 45) risk = "critical";
  else if (criticalSignal || blastRadius >= 55) risk = "high";
  else if (blastRadius >= 25) risk = "medium";

  const reasons: string[] = [];
  if (!nodes.length) reasons.push("Nenhum arquivo relacionado foi localizado com confiança suficiente.");
  if (affectedDomains.length > 1) reasons.push(`Mudança atravessa ${affectedDomains.length} domínios: ${affectedDomains.join(", ")}.`);
  if (referenceCount > 8) reasons.push(`${referenceCount} referências relacionadas aumentam o raio provável de regressão.`);
  if (criticalSignal) reasons.push("Foram detectados sinais ligados a dados, autenticação, finanças ou operações destrutivas.");

  return {
    seedPaths,
    nodes,
    affectedDomains,
    blastRadius,
    risk,
    reasons,
    confidence: nodes.length ? Math.min(0.95, 0.55 + nodes.length * 0.06) : 0.25,
  };
}

router.post("/support/dev/impact", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") return res.status(403).json({ error: "Somente Super Admin pode usar o mapa de impacto." });
  const parsed = impactSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Payload inválido", details: parsed.error.flatten() });
  try {
    const impact = await analyzeChangeImpact(parsed.data);
    return res.json({ success: true, impact });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia impact analysis failed");
    return res.status(500).json({ error: "Falha ao analisar impacto" });
  }
});

export default router;