import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

/**
 * A&B — cargos operacionais por hotel (AB-01).
 *
 * Isolamento por tenant em duas camadas:
 *  1. guard `allowed()`: o tenant da URL precisa ser o mesmo do JWT;
 *  2. RLS: toda query roda em transação com set_config('app.tenant_id'), e a
 *     policy ab_cargos_tenant_isolation filtra por tenant no próprio banco.
 *
 * Leitura liberada para qualquer usuário do hotel; escrita (POST/PATCH) exige
 * admin — mesmo critério já usado em hotel_hospitality.ts.
 *
 * Rotas montadas no bloco de Hotelaria (A&B é uma aba dentro do módulo).
 */

function allowed(req: Express.Request, tenantId: string, write = false) {
  const u = req.user;
  return !!(
    u?.sub &&
    u.tenantId === tenantId &&
    u.actorType !== "ai" &&
    u.actorType !== "system" &&
    (!write ||
      u.platformRole === "tenant_admin" ||
      u.role === "admin" ||
      u.userFunction === "administrador")
  );
}

async function transact<T>(
  tenantId: string,
  action: (client: any) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const out = await action(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const CARGO_COLUMNS =
  "id, tenant_id, nome, setor, descricao, ativo, created_at, updated_at";

const nomeField = z.string().trim().min(1).max(120);
const setorField = z.string().trim().min(1).max(80);
const descricaoField = z.string().trim().max(500).nullable();

const cargoInput = z
  .object({
    nome: nomeField,
    setor: setorField,
    descricao: descricaoField.optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

const cargoPatch = z
  .object({
    nome: nomeField.optional(),
    setor: setorField.optional(),
    descricao: descricaoField.optional(),
    ativo: z.boolean().optional(),
  })
  .strict();

// Query livre (não-strict): o frontend pode mandar cache-busters sem quebrar.
const listQuery = z.object({
  ativo: z.enum(["true", "false"]).optional(),
  setor: setorField.optional(),
});

const cargoId = z.uuid();

/** Colunas que o PATCH pode tocar — whitelist explícita contra injeção. */
const PATCHABLE: Record<string, string> = {
  nome: "nome",
  setor: "setor",
  descricao: "descricao",
  ativo: "ativo",
};

function isUniqueViolation(error: any) {
  return error?.code === "23505";
}

function invalidFields(error: z.ZodError) {
  return error.issues.map((issue) => issue.path.join(".") || "(corpo)");
}

// ── GET /tenants/:tenantId/ab/cargos ─────────────────────────────────────────
router.get("/tenants/:tenantId/ab/cargos", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t)) return res.status(403).json({ error: "Forbidden" });

  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Invalid filters", fields: invalidFields(parsed.error) });
  }

  try {
    const rows = await transact(t, async (c) => {
      const where = ["tenant_id = $1"];
      const values: any[] = [t];

      if (parsed.data.ativo !== undefined) {
        values.push(parsed.data.ativo === "true");
        where.push(`ativo = $${values.length}`);
      }
      if (parsed.data.setor !== undefined) {
        values.push(parsed.data.setor);
        where.push(`setor = $${values.length}`);
      }

      return (
        await c.query(
          `SELECT ${CARGO_COLUMNS} FROM ab_cargos
            WHERE ${where.join(" AND ")}
            ORDER BY nome`,
          values,
        )
      ).rows;
    });
    return res.json(rows);
  } catch (e) {
    console.error("[ab-cargos] list", e);
    return res.status(500).json({ error: "Could not list cargos" });
  }
});

// ── POST /tenants/:tenantId/ab/cargos ────────────────────────────────────────
router.post("/tenants/:tenantId/ab/cargos", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsed = cargoInput.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Invalid cargo", fields: invalidFields(parsed.error) });
  }

  try {
    const row = await transact(
      t,
      async (c) =>
        (
          await c.query(
            `INSERT INTO ab_cargos (id, tenant_id, nome, setor, descricao, ativo)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING ${CARGO_COLUMNS}`,
            [
              crypto.randomUUID(),
              t,
              parsed.data.nome,
              parsed.data.setor,
              parsed.data.descricao ?? null,
              parsed.data.ativo ?? true,
            ],
          )
        ).rows[0],
    );
    return res.status(201).json(row);
  } catch (e: any) {
    if (isUniqueViolation(e)) {
      return res
        .status(409)
        .json({ error: "Cargo with this name already exists for this hotel" });
    }
    console.error("[ab-cargos] create", e);
    return res.status(500).json({ error: "Could not create cargo" });
  }
});

// ── PATCH /tenants/:tenantId/ab/cargos/:id ───────────────────────────────────
router.patch("/tenants/:tenantId/ab/cargos/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });

  const parsedId = cargoId.safeParse(req.params.id);
  if (!parsedId.success) {
    return res.status(422).json({ error: "Invalid cargo id" });
  }

  const parsed = cargoPatch.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(422)
      .json({ error: "Invalid cargo update", fields: invalidFields(parsed.error) });
  }

  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return res.status(422).json({ error: "Nothing to update" });
  }

  const sets: string[] = [];
  const values: any[] = [t, parsedId.data];
  for (const [key, value] of entries) {
    const column = PATCHABLE[key];
    if (!column) continue;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }
  // descricao aceita null explícito (limpa a descrição); os demais campos não.
  sets.push("updated_at = now()");

  try {
    const row = await transact(
      t,
      async (c) =>
        (
          await c.query(
            `UPDATE ab_cargos SET ${sets.join(", ")}
              WHERE tenant_id = $1 AND id = $2
              RETURNING ${CARGO_COLUMNS}`,
            values,
          )
        ).rows[0],
    );
    if (!row) return res.status(404).json({ error: "Cargo not found" });
    return res.json(row);
  } catch (e: any) {
    if (isUniqueViolation(e)) {
      return res
        .status(409)
        .json({ error: "Cargo with this name already exists for this hotel" });
    }
    console.error("[ab-cargos] update", e);
    return res.status(500).json({ error: "Could not update cargo" });
  }
});

export default router;
