import { describe, expect, it, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("@workspace/db", () => ({
  db: {},
  pool: { query: (...args: unknown[]) => query(...args) },
  tenantsTable: {}, invoicesTable: {}, usersTable: {}, dealsTable: {}, pipelineStagesTable: {}, workCardsTable: {}, scoutOportunidadesTable: {},
}));
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret";

const { enforcePreProjectScope } = await import("../middlewares/auth");

function run(req: Record<string, unknown>) {
  let status = 200;
  let passed = false;
  const res = { status(code: number) { status = code; return this; }, json() { return this; } };
  const user = { sub: "owner-1", tenantId: "t1", accessScope: "preprojeto", conceptId: "c1", platformRole: "member", role: "member", email: "x" };
  return enforcePreProjectScope({ query: {}, body: {}, ...req, user } as never, res as never, () => { passed = true; })
    .then(() => ({ status, passed }));
}

describe("acesso do cliente pelo link público do pré-projeto", () => {
  beforeEach(() => query.mockReset());

  it("abre e salva o próprio pré-projeto", async () => {
    expect((await run({ method: "GET", path: "/arch/concept-projects/c1" })).passed).toBe(true);
    expect((await run({ method: "PATCH", path: "/arch/concept-projects/c1" })).passed).toBe(true);
    expect((await run({ method: "POST", path: "/arch/concept-projects/c1/promote" })).passed).toBe(true);
  });

  it("não abre outro pré-projeto, a lista nem outros módulos", async () => {
    for (const [method, path] of [["GET", "/arch/concept-projects/c2"], ["GET", "/arch/concept-projects"], ["GET", "/arch/concept-projects/latest"], ["GET", "/leads"], ["POST", "/deals"], ["GET", "/arch/ai-renders"]]) {
      const result = await run({ method, path });
      expect(result.passed).toBe(false);
      expect(result.status).toBe(403);
    }
  });

  it("render só do próprio pré-projeto e dentro do limite diário", async () => {
    expect((await run({ method: "POST", path: "/arch/ai-render", body: { concept_project_id: "c2" } })).status).toBe(403);
    query.mockResolvedValueOnce({ rows: [{ used: "1", quota: 5 }] });
    expect((await run({ method: "POST", path: "/arch/ai-render", body: { concept_project_id: "c1" } })).passed).toBe(true);
    query.mockResolvedValueOnce({ rows: [{ used: "5", quota: 5 }] });
    expect((await run({ method: "POST", path: "/arch/ai-render", body: { concept_project_id: "c1" } })).status).toBe(429);
  });

  it("consulta de render de outro projeto é negada", async () => {
    query.mockResolvedValueOnce({ rows: [{ concept_project_id: "outro" }] });
    expect((await run({ method: "GET", path: "/arch/ai-render/r9" })).status).toBe(403);
    query.mockResolvedValueOnce({ rows: [{ concept_project_id: "c1" }] });
    expect((await run({ method: "GET", path: "/arch/ai-render/r1" })).passed).toBe(true);
  });
});
