import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../../lib/db/migrations/223_obra_field_access.sql", import.meta.url),
  "utf8",
);
const jwtSource = readFileSync(new URL("../lib/jwt.ts", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../middlewares/auth.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../routes/obra_field_access.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
const fieldUi = readFileSync(
  new URL("../../../frontend/src/pages/ObraCampo.tsx", import.meta.url),
  "utf8",
);
const teamUi = readFileSync(
  new URL("../../../frontend/src/pages/EquipeProducao.tsx", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../../../frontend/src/AppLegacy.tsx", import.meta.url),
  "utf8",
);
const detailSource = readFileSync(
  new URL("../../../frontend/src/pages/ObraDetalhe.tsx", import.meta.url),
  "utf8",
);

describe("ARQDOR worksite scoped access", () => {
  it("persists obra-scoped credentials and field diary identity", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS obra_executor_access");
    expect(migration).toContain("invite_token_hash");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("executor_id text NULL REFERENCES obra_executores");
    expect(migration).toContain("aprovado_por_executor_id");
  });

  it("issues tokens with explicit obra scope and blocks general tenant APIs", () => {
    expect(jwtSource).toContain('accessScope?: "tenant" | "obra"');
    expect(jwtSource).toContain("obraExecutorId?: string");
    expect(authSource).toContain("enforceAccessScope");
    expect(authSource).toContain("OBRA_SCOPE_DENIED");
    expect(authSource).toContain('req.path.startsWith("/arch/worksite/")');
    expect(indexSource).toContain("router.use(enforceAccessScope)");
  });

  it("supports invitation activation, login, diary, production and approval", () => {
    expect(routeSource).toContain('"/auth/obra/activate"');
    expect(routeSource).toContain('"/auth/obra/login"');
    expect(routeSource).toContain('"/auth/obra/session"');
    expect(routeSource).toContain('"/arch/construction/:obraId/workforce/executores/:executorId/invite"');
    expect(routeSource).toContain('"/arch/worksite/me"');
    expect(routeSource).toContain('"/arch/worksite/producao"');
    expect(routeSource).toContain('"/arch/worksite/diario"');
    expect(routeSource).toContain('"/arch/worksite/diario/:diarioId/status"');
    expect(routeSource).toContain("OBRA_STAGE_SCOPE_DENIED");
    expect(routeSource).toContain("sanitizeProductionRow");
    expect(routeSource).toContain("INSERT INTO obra_etapa_medicoes");
  });

  it("provides the dedicated field UI without using the main tenant token", () => {
    expect(appSource).toContain('path="/obra/campo/:obraId"');
    expect(fieldUi).toContain("vendorai_obra_field_token:");
    expect(fieldUi).toContain("Entrar na obra");
    expect(fieldUi).toContain("Registrar produção");
    expect(fieldUi).toContain("Nova entrada no diário");
    expect(fieldUi).toContain("Alterar senha");
    expect(fieldUi).toContain("Aprovar");
  });

  it("lets managers invite executors and review field diary entries", () => {
    expect(teamUi).toContain("Acesso de campo");
    expect(teamUi).toContain("/invite");
    expect(teamUi).toContain("Convite pendente");
    expect(detailSource).toContain('entry.status === "revisao"');
    expect(detailSource).toContain('revisao:');
  });
});
