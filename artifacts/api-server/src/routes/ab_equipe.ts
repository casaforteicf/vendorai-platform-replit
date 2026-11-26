import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function allowed(req: Express.Request, tenantId: string, write = false) {
  const u = req.user;
  return !!(
    u?.sub &&
    u.tenantId === tenantId &&
    u.actorType !== "ai" &&
    u.actorType !== "system" &&
    (!write || u.platformRole === "tenant_admin" || u.role === "admin" || u.userFunction === "administrador")
  );
}

async function transact<T>(tenantId: string, action: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const out = await action(client);
    await client.query("COMMIT");
    return out;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const hora = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido");
const dias = z.array(z.number().int().min(0).max(6)).max(7);
const entrada = z.object({
  nome: z.string().trim().min(1).max(120),
  cargoId: z.string().uuid().nullable().optional(),
  diasSemana: dias.default([]),
  horaInicio: hora,
  intervaloInicio: hora.nullable().optional(),
  intervaloFim: hora.nullable().optional(),
  horaFim: hora,
  ativo: z.boolean().optional(),
}).strict();

const COLUNAS = `e.id, e.tenant_id, e.nome, e.cargo_id, c.nome AS cargo_nome,
  e.dias_semana, e.hora_inicio, e.intervalo_inicio, e.intervalo_fim, e.hora_fim,
  e.ativo, e.created_at, e.updated_at`;

router.get("/tenants/:tenantId/ab/equipe", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t)) return res.status(403).json({ error: "Forbidden" });
  try {
    const rows = await transact(t, async (c) => (await c.query(
      `SELECT ${COLUNAS} FROM ab_equipe e
       LEFT JOIN ab_cargos c ON c.id = e.cargo_id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 ORDER BY e.nome`, [t],
    )).rows);
    return res.json({ equipe: rows });
  } catch (error) {
    console.error("[ab-equipe] list", error);
    return res.status(500).json({ error: "Não foi possível listar a equipe" });
  }
});

router.post("/tenants/:tenantId/ab/equipe", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });
  const parsed = entrada.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Pessoa inválida", fields: parsed.error.issues.map((i) => i.path.join(".")) });
  try {
    const row = await transact(t, async (c) => (await c.query(
      `INSERT INTO ab_equipe (id, tenant_id, nome, cargo_id, dias_semana, hora_inicio, intervalo_inicio, intervalo_fim, hora_fim, ativo)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10) RETURNING *`,
      [crypto.randomUUID(), t, parsed.data.nome, parsed.data.cargoId ?? null, JSON.stringify(parsed.data.diasSemana),
        parsed.data.horaInicio, parsed.data.intervaloInicio ?? null, parsed.data.intervaloFim ?? null,
        parsed.data.horaFim, parsed.data.ativo ?? true],
    )).rows[0]);
    return res.status(201).json(row);
  } catch (error) {
    console.error("[ab-equipe] create", error);
    return res.status(500).json({ error: "Não foi possível criar a pessoa" });
  }
});

router.patch("/tenants/:tenantId/ab/equipe/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Id inválido" });
  const parsed = entrada.partial().safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: "Pessoa inválida", fields: parsed.error.issues.map((i) => i.path.join(".")) });
  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return res.status(422).json({ error: "Nada para atualizar" });
  const map: Record<string, string> = {
    nome: "nome", cargoId: "cargo_id", diasSemana: "dias_semana", horaInicio: "hora_inicio",
    intervaloInicio: "intervalo_inicio", intervaloFim: "intervalo_fim", horaFim: "hora_fim", ativo: "ativo",
  };
  const sets: string[] = [];
  const values: any[] = [t, req.params.id];
  for (const [key, value] of entries) {
    const col = map[key];
    if (!col) continue;
    values.push(key === "diasSemana" ? JSON.stringify(value) : value);
    sets.push(`${col} = $${values.length}${key === "diasSemana" ? "::jsonb" : ""}`);
  }
  sets.push("updated_at = now()");
  try {
    const row = await transact(t, async (c) => (await c.query(
      `UPDATE ab_equipe SET ${sets.join(", ")} WHERE tenant_id=$1 AND id=$2 RETURNING *`, values,
    )).rows[0]);
    return row ? res.json(row) : res.status(404).json({ error: "Pessoa não encontrada" });
  } catch (error) {
    console.error("[ab-equipe] update", error);
    return res.status(500).json({ error: "Não foi possível atualizar a pessoa" });
  }
});

router.delete("/tenants/:tenantId/ab/equipe/:id", async (req, res) => {
  const t = String(req.params.tenantId);
  if (!allowed(req, t, true)) return res.status(403).json({ error: "Forbidden" });
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(422).json({ error: "Id inválido" });
  try {
    const removed = await transact(t, async (c) => (await c.query(
      "DELETE FROM ab_equipe WHERE tenant_id=$1 AND id=$2 RETURNING id", [t, req.params.id],
    )).rows.length > 0);
    return removed ? res.status(204).send() : res.status(404).json({ error: "Pessoa não encontrada" });
  } catch (error) {
    console.error("[ab-equipe] delete", error);
    return res.status(500).json({ error: "Não foi possível excluir a pessoa" });
  }
});

export default router;
