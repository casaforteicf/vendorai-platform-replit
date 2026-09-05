import { Router } from "express";
import { loadEngineeringMemory } from "./dev_agent_memory";

const router = Router();

type OperationalContext = {
  observedRevision: string | null;
  mainRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
  openDevPrs: Array<{ number: number; title: string; head: string; updatedAt: string }>;
  memoryCount: number;
  checkedAt: string;
};

function githubConfig() {
  const token = process.env["GITHUB_DEV_TOKEN"] ?? process.env["GITHUB_PERSONAL_ACCESS_TOKEN"] ?? process.env["GITHUB_TOKEN"];
  const repository = process.env["GITHUB_DEV_REPOSITORY"] ?? "casaforteicf/vendorai-platform-replit";
  if (!token) throw new Error("GITHUB_DEV_TOKEN_MISSING");
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("GITHUB_DEV_REPOSITORY_INVALID");
  return { token, owner, repo };
}

async function gh(path: string) {
  const { token } = githubConfig();
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VendorAI-Dev-Operational-Context/1.0",
    },
  });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  return response.json() as Promise<any>;
}

function normalizeRevision(value: unknown) {
  const revision = String(value ?? "").trim().toLowerCase();
  return /^[0-9a-f]{7,64}$/.test(revision) ? revision : null;
}

function revisionsMatch(a: string | null, b: string | null) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

export async function getOperationalContext(): Promise<OperationalContext> {
  const observedRevision = normalizeRevision(process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA);
  let mainRevision: string | null = null;
  let openDevPrs: OperationalContext["openDevPrs"] = [];
  let memoryCount = 0;

  try {
    const { owner, repo } = githubConfig();
    const [main, pulls] = await Promise.all([
      gh(`/repos/${owner}/${repo}/commits/main`),
      gh(`/repos/${owner}/${repo}/pulls?state=open&per_page=50&sort=updated&direction=desc`),
    ]);
    mainRevision = normalizeRevision(main?.sha);
    openDevPrs = (pulls ?? [])
      .filter((pr: any) => String(pr?.head?.ref ?? "").startsWith("dev-ia/"))
      .slice(0, 8)
      .map((pr: any) => ({
        number: Number(pr.number),
        title: String(pr.title ?? "").slice(0, 180),
        head: String(pr.head?.ref ?? "").slice(0, 160),
        updatedAt: String(pr.updated_at ?? ""),
      }));
  } catch {
    // contexto operacional é best-effort; a cognição não deve cair se GitHub estiver indisponível
  }

  try {
    memoryCount = (await loadEngineeringMemory(25)).length;
  } catch {
    memoryCount = 0;
  }

  let productionState: OperationalContext["productionState"] = "unknown";
  if (observedRevision && mainRevision) {
    productionState = revisionsMatch(observedRevision, mainRevision) ? "aligned" : "stale";
  }

  return {
    observedRevision,
    mainRevision,
    productionState,
    openDevPrs,
    memoryCount,
    checkedAt: new Date().toISOString(),
  };
}

router.get("/support/dev/operational-context", async (req, res) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ error: "Somente Super Admin pode consultar o contexto operacional." });
  }
  try {
    const context = await getOperationalContext();
    return res.json({ success: true, context });
  } catch (error) {
    req.log?.error({ err: error }, "dev-ia operational context failed");
    return res.status(500).json({ error: "Falha ao carregar contexto operacional" });
  }
});

export default router;
