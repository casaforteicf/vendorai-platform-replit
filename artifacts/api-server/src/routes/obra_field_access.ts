import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "crypto";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { signToken } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { sendObraFieldInviteEmail } from "../lib/obra_access_email.js";

export const obraFieldPublicRouter: IRouter = Router();
export const obraFieldRouter: IRouter = Router();

const INVITE_DAYS = 7;

const loginSchema = z.object({
  obraId: z.string().min(1),
  login: z.string().trim().min(3).max(320),
  password: z.string().min(6).max(200),
});

const activateSchema = z.object({
  token: z.string().min(20).max(500),
  password: z.string().min(8).max(200),
});

const changePasswordSchema = z.object({
  password: z.string().min(8).max(200),
});

const productionSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  etapaId: z.string().min(1).max(100).nullable().optional(),
  quantidade: z.coerce.number().nonnegative().default(0),
  unidade: z.string().trim().max(50).nullable().optional(),
  horas: z.coerce.number().min(0).max(24).default(0),
  retrabalhoQuantidade: z.coerce.number().nonnegative().default(0),
  qualidadeNota: z.coerce.number().min(0).max(10).nullable().optional(),
  bloqueio: z.string().trim().max(2000).nullable().optional(),
  observacao: z.string().trim().max(4000).nullable().optional(),
});

const diarySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conteudo: z.string().trim().min(1).max(20000),
  climaTempo: z.string().trim().max(500).nullable().optional(),
  observacoes: z.string().trim().max(10000).nullable().optional(),
  etapaId: z.string().min(1).max(100).nullable().optional(),
  quantidade: z.coerce.number().nonnegative().nullable().optional(),
  unidade: z.string().trim().max(50).nullable().optional(),
});

const diaryStatusSchema = z.object({
  status: z.enum(["aprovado", "revisao"]),
});

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeLoginIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  const digits = trimmed.replace(/\D/g, "");
  return digits || trimmed.toLowerCase();
}

function fieldTokenEmail(loginIdentifier: string, executorId: string) {
  return loginIdentifier.includes("@") ? loginIdentifier : `${executorId}@obra.vendorai.local`;
}

function hasPermission(permissions: unknown, ...expected: string[]) {
  if (!Array.isArray(permissions)) return false;
  const current = new Set(permissions.map(String));
  return expected.some((permission) => current.has(permission));
}

function sanitizeProductionRow(row: any, canReadCost: boolean) {
  if (canReadCost) return row;
  const { custo_mao_obra: _cost, ...safe } = row ?? {};
  return safe;
}

async function canManageObra(req: any, tenantId: string, obraId: string) {
  const user = req.user;
  if (!user || user.accessScope === "obra") return false;
  if (
    user.platformRole === "super_admin"
    || user.platformRole === "tenant_admin"
    || user.userFunction === "administrador"
  ) return true;

  const result = await pool.query(
    `SELECT 1
       FROM obra_executores
      WHERE tenant_id = $1
        AND obra_id = $2
        AND user_id = $3
        AND status = 'ativo'
        AND permissoes @> '["equipe.manage"]'::jsonb
      LIMIT 1`,
    [tenantId, obraId, user.sub],
  );
  return Boolean(result.rows[0]);
}

async function loadFieldSession(req: any, res: any) {
  const user = req.user;
  if (!user || user.accessScope !== "obra" || !user.obraId || !user.obraExecutorId) {
    res.status(403).json({ error: "OBRA_FIELD_SESSION_REQUIRED", message: "Use um acesso válido da obra." });
    return null;
  }

  const result = await pool.query(
    `SELECT
        e.*,
        a.id AS access_id,
        a.login_identifier,
        a.status AS access_status,
        a.force_password_reset,
        a.last_login_at,
        o.nome AS obra_nome,
        o.endereco AS obra_endereco,
        o.status AS obra_status,
        o.data_inicio,
        o.data_fim_prevista
       FROM obra_executores e
       INNER JOIN obra_executor_access a
         ON a.executor_id = e.id
        AND a.obra_id = e.obra_id
        AND a.tenant_id = e.tenant_id
       INNER JOIN obras o
         ON o.id = e.obra_id
        AND o.tenant_id = e.tenant_id
      WHERE e.id = $1
        AND e.obra_id = $2
        AND e.tenant_id = $3
      LIMIT 1`,
    [user.obraExecutorId, user.obraId, user.tenantId],
  );

  const session = result.rows[0];
  if (
    !session
    || session.status !== "ativo"
    || session.access_status !== "active"
    || session.acesso_sistema !== true
  ) {
    res.status(403).json({ error: "OBRA_FIELD_ACCESS_BLOCKED", message: "Seu acesso a esta obra está bloqueado ou finalizado." });
    return null;
  }

  return session;
}

function sessionToken(session: any) {
  const permissions = Array.isArray(session.permissoes) ? session.permissoes.map(String) : [];
  return signToken({
    sub: String(session.id),
    email: fieldTokenEmail(String(session.login_identifier), String(session.id)),
    platformRole: "member",
    tenantId: String(session.tenant_id),
    role: "member",
    userFunction: String(session.perfil_acesso || session.funcao || "campo"),
    actorType: "human",
    accessScope: "obra",
    obraId: String(session.obra_id),
    obraExecutorId: String(session.id),
    obraPermissions: permissions,
    obraProfile: String(session.perfil_acesso || "campo"),
  });
}

async function validateEtapa(tenantId: string, obraId: string, etapaId: string | null | undefined) {
  if (!etapaId) return null;
  const result = await pool.query(
    `SELECT e.*
       FROM obra_etapas e
       INNER JOIN obras o ON o.id = e.obra_id
      WHERE e.id = $1 AND e.obra_id = $2 AND o.tenant_id = $3
      LIMIT 1`,
    [etapaId, obraId, tenantId],
  );
  return result.rows[0] ?? null;
}

async function executorCanUseEtapa(session: any, etapaId: string | null | undefined, broadPermission: string) {
  if (!etapaId) return true;
  if (hasPermission(session.permissoes, broadPermission, "aprovacoes.manage", "metas.manage")) return true;
  const result = await pool.query(
    `SELECT 1
       FROM obra_metas
      WHERE tenant_id = $1
        AND obra_id = $2
        AND executor_id = $3
        AND etapa_id = $4
        AND status IN ('ativa','atingida')
      LIMIT 1`,
    [session.tenant_id, session.obra_id, session.id, etapaId],
  );
  return Boolean(result.rows[0]);
}

function productionCost(executor: any, quantity: number, hours: number) {
  const unitValue = Number(executor.valor_contratado ?? 0);
  const type = String(executor.tipo_contratacao ?? "hora");
  if (unitValue <= 0) return 0;
  if (type === "hora") return unitValue * hours;
  if (type === "dia") return unitValue * Math.min(1, hours / 8);
  if (type === "m2" || type === "unidade") return unitValue * quantity;
  return 0;
}

async function recalcEtapaFromStageGoals(input: {
  tenantId: string;
  obraId: string;
  etapaId: string;
  executorName?: string | null;
}) {
  const goalsResult = await pool.query(
    `SELECT *
       FROM obra_metas
      WHERE tenant_id = $1
        AND obra_id = $2
        AND etapa_id = $3
        AND periodo = 'etapa'
        AND status IN ('ativa','atingida')
        AND valor_meta > 0`,
    [input.tenantId, input.obraId, input.etapaId],
  );
  if (!goalsResult.rows.length) return null;

  let weightedTotal = 0;
  let totalWeight = 0;
  for (const goal of goalsResult.rows) {
    const values: unknown[] = [input.tenantId, input.obraId, input.etapaId];
    let executorFilter = "";
    if (goal.executor_id) {
      values.push(goal.executor_id);
      executorFilter = ` AND executor_id = $${values.length}`;
    }
    if (goal.data_inicio) {
      values.push(String(goal.data_inicio).slice(0, 10));
      executorFilter += ` AND data >= $${values.length}::date`;
    }
    if (goal.data_fim) {
      values.push(String(goal.data_fim).slice(0, 10));
      executorFilter += ` AND data <= $${values.length}::date`;
    }
    const production = await pool.query(
      `SELECT COALESCE(SUM(quantidade), 0)::numeric AS total
         FROM obra_apontamentos_producao
        WHERE tenant_id = $1
          AND obra_id = $2
          AND etapa_id = $3
          ${executorFilter}`,
      values,
    );
    const target = Number(goal.valor_meta ?? 0);
    const achieved = Number(production.rows[0]?.total ?? 0);
    const percent = target > 0 ? Math.max(0, Math.min(100, (achieved / target) * 100)) : 0;
    const weight = Math.max(0.001, Number(goal.peso ?? 1));
    weightedTotal += percent * weight;
    totalWeight += weight;
  }

  const calculated = totalWeight > 0 ? weightedTotal / totalWeight : 0;
  const stageResult = await pool.query(
    `SELECT percentual_executado, status
       FROM obra_etapas
      WHERE id = $1 AND obra_id = $2
      LIMIT 1`,
    [input.etapaId, input.obraId],
  );
  const current = Number(stageResult.rows[0]?.percentual_executado ?? 0);
  const next = Math.max(current, calculated);
  if (next <= current + 0.001) return current;

  const nextStatus = next >= 100 ? "concluida" : next > 0 ? "em_andamento" : stageResult.rows[0]?.status ?? "pendente";
  await pool.query(
    `UPDATE obra_etapas
        SET percentual_executado = $1,
            status = $2,
            data_inicio_real = CASE WHEN $1 > 0 THEN COALESCE(data_inicio_real, CURRENT_DATE) ELSE data_inicio_real END,
            data_fim_real = CASE WHEN $1 >= 100 THEN COALESCE(data_fim_real, CURRENT_DATE) ELSE data_fim_real END,
            updated_at = now()
      WHERE id = $3 AND obra_id = $4`,
    [next.toFixed(2), nextStatus, input.etapaId, input.obraId],
  );

  await pool.query(
    `INSERT INTO obra_etapa_medicoes (
       id, etapa_id, data, percentual_anterior, percentual_novo, responsavel_id, observacao, created_at
     ) VALUES ($1,$2,CURRENT_DATE,$3,$4,null,$5,now())`,
    [
      randomUUID(),
      input.etapaId,
      current.toFixed(2),
      next.toFixed(2),
      `Atualização automática por apontamento de produção${input.executorName ? ` — ${input.executorName}` : ""}.`,
    ],
  );
  return next;
}

obraFieldPublicRouter.post("/auth/obra/activate", async (req, res, next) => {
  try {
    const parsed = activateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      return;
    }

    const tokenHash = hashToken(parsed.data.token);
    const result = await pool.query(
      `SELECT
          a.*,
          e.nome,
          e.funcao,
          e.perfil_acesso,
          e.permissoes,
          e.acesso_sistema,
          e.status AS executor_status,
          o.nome AS obra_nome
         FROM obra_executor_access a
         INNER JOIN obra_executores e ON e.id = a.executor_id
         INNER JOIN obras o ON o.id = a.obra_id AND o.tenant_id = a.tenant_id
        WHERE a.invite_token_hash = $1
          AND a.status = 'invited'
          AND a.invite_expires_at > now()
        LIMIT 1`,
      [tokenHash],
    );
    const access = result.rows[0];
    if (!access || access.executor_status !== "ativo" || access.acesso_sistema !== true) {
      res.status(401).json({ error: "INVITE_INVALID", message: "Convite inválido, expirado ou acesso bloqueado." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await pool.query(
      `UPDATE obra_executor_access
          SET password_hash = $1,
              invite_token_hash = null,
              invite_expires_at = null,
              activated_at = COALESCE(activated_at, now()),
              status = 'active',
              force_password_reset = false,
              updated_at = now()
        WHERE id = $2`,
      [passwordHash, access.id],
    );

    const session = {
      ...access,
      id: access.executor_id,
      tenant_id: access.tenant_id,
      obra_id: access.obra_id,
      login_identifier: access.login_identifier,
      status: access.executor_status,
      access_status: "active",
      acesso_sistema: true,
    };
    const jwt = sessionToken(session);

    res.json({
      token: jwt,
      obra: { id: access.obra_id, nome: access.obra_nome },
      executor: {
        id: access.executor_id,
        nome: access.nome,
        funcao: access.funcao,
        perfilAcesso: access.perfil_acesso,
        permissoes: access.permissoes ?? [],
      },
    });
  } catch (err) {
    logger.error({ err }, "obra field activation error");
    next(err);
  }
});

obraFieldPublicRouter.post("/auth/obra/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      return;
    }
    const login = normalizeLoginIdentifier(parsed.data.login);

    const result = await pool.query(
      `SELECT
          a.*,
          e.nome,
          e.funcao,
          e.perfil_acesso,
          e.permissoes,
          e.acesso_sistema,
          e.status AS executor_status,
          o.nome AS obra_nome
         FROM obra_executor_access a
         INNER JOIN obra_executores e ON e.id = a.executor_id
         INNER JOIN obras o ON o.id = a.obra_id AND o.tenant_id = a.tenant_id
        WHERE a.obra_id = $1
          AND lower(a.login_identifier) = lower($2)
        LIMIT 1`,
      [parsed.data.obraId, login],
    );
    const access = result.rows[0];
    if (
      !access
      || access.status !== "active"
      || access.executor_status !== "ativo"
      || access.acesso_sistema !== true
      || !access.password_hash
      || !await bcrypt.compare(parsed.data.password, access.password_hash)
    ) {
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Login ou senha inválidos para esta obra." });
      return;
    }

    await pool.query(
      `UPDATE obra_executor_access SET last_login_at = now(), updated_at = now() WHERE id = $1`,
      [access.id],
    );

    const session = {
      ...access,
      id: access.executor_id,
      tenant_id: access.tenant_id,
      obra_id: access.obra_id,
      status: access.executor_status,
      access_status: access.status,
    };
    res.json({
      token: sessionToken(session),
      obra: { id: access.obra_id, nome: access.obra_nome },
      executor: {
        id: access.executor_id,
        nome: access.nome,
        funcao: access.funcao,
        perfilAcesso: access.perfil_acesso,
        permissoes: access.permissoes ?? [],
      },
      forcePasswordReset: Boolean(access.force_password_reset),
    });
  } catch (err) {
    logger.error({ err }, "obra field login error");
    next(err);
  }
});

obraFieldRouter.post("/arch/construction/:obraId/workforce/executores/:executorId/invite", async (req: any, res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    const obraId = String(req.params["obraId"] ?? "");
    const executorId = String(req.params["executorId"] ?? "");
    if (!tenantId) {
      res.status(403).json({ error: "Tenant ativo obrigatório." });
      return;
    }
    if (!await canManageObra(req, tenantId, obraId)) {
      res.status(403).json({ error: "OBRA_TEAM_MANAGE_REQUIRED", message: "Seu perfil não pode gerenciar acessos desta obra." });
      return;
    }

    const executorResult = await pool.query(
      `SELECT e.*, o.nome AS obra_nome
         FROM obra_executores e
         INNER JOIN obras o ON o.id = e.obra_id AND o.tenant_id = e.tenant_id
        WHERE e.id = $1 AND e.obra_id = $2 AND e.tenant_id = $3
        LIMIT 1`,
      [executorId, obraId, tenantId],
    );
    const executor = executorResult.rows[0];
    if (!executor) {
      res.status(404).json({ error: "Executor não encontrado." });
      return;
    }
    if (executor.status !== "ativo") {
      res.status(409).json({ error: "Executor precisa estar ativo para receber acesso." });
      return;
    }

    const requestedLogin = typeof req.body?.loginIdentifier === "string" ? req.body.loginIdentifier : "";
    const sourceLogin = requestedLogin || executor.email || executor.telefone || "";
    const loginIdentifier = normalizeLoginIdentifier(sourceLogin);
    if (!loginIdentifier) {
      res.status(422).json({ error: "Informe e-mail ou telefone para gerar o acesso." });
      return;
    }

    const rawInvite = randomBytes(32).toString("base64url");
    const inviteHash = hashToken(rawInvite);
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

    const existing = await pool.query(
      `SELECT * FROM obra_executor_access WHERE executor_id = $1 LIMIT 1`,
      [executorId],
    );

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const loginUrl = `${baseUrl}/obra/campo/${encodeURIComponent(obraId)}`;
    if (existing.rows[0]?.status === "active" && existing.rows[0]?.password_hash && req.body?.reset !== true) {
      const activeAccess = existing.rows[0];
      res.json({
        access: {
          id: activeAccess.id,
          loginIdentifier: activeAccess.login_identifier,
          status: activeAccess.status,
          expiresAt: null,
        },
        inviteUrl: loginUrl,
        emailSent: false,
        alreadyActive: true,
        whatsappText: [
          `Olá ${executor.nome}! Seu acesso à obra ${executor.obra_nome} já está ativo.`,
          `Acesse: ${loginUrl}`,
          `Login: ${activeAccess.login_identifier}`,
          "Use a senha que você criou na ativação.",
        ].join("\n"),
      });
      return;
    }

    let access;
    if (existing.rows[0]) {
      const updated = await pool.query(
        `UPDATE obra_executor_access
            SET login_identifier = $1,
                invite_token_hash = $2,
                invite_expires_at = $3,
                status = 'invited',
                password_hash = null,
                activated_at = null,
                updated_at = now()
          WHERE id = $4
          RETURNING *`,
        [loginIdentifier, inviteHash, expiresAt, existing.rows[0].id],
      );
      access = updated.rows[0];
    } else {
      const inserted = await pool.query(
        `INSERT INTO obra_executor_access (
          id, tenant_id, obra_id, executor_id, login_identifier,
          invite_token_hash, invite_expires_at, status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'invited',now(),now())
        RETURNING *`,
        [randomUUID(), tenantId, obraId, executorId, loginIdentifier, inviteHash, expiresAt],
      );
      access = inserted.rows[0];
    }

    if (!executor.acesso_sistema) {
      await pool.query(
        `UPDATE obra_executores SET acesso_sistema = true, updated_at = now() WHERE id = $1`,
        [executorId],
      );
    }

    const inviteUrl = `${baseUrl}/obra/campo/${encodeURIComponent(obraId)}?convite=${encodeURIComponent(rawInvite)}`;
    let emailSent = false;
    if (executor.email && loginIdentifier.includes("@")) {
      emailSent = await sendObraFieldInviteEmail({
        to: executor.email,
        executorName: executor.nome,
        obraName: executor.obra_nome,
        inviteUrl,
        expiresDays: INVITE_DAYS,
      });
    }

    res.json({
      access: {
        id: access.id,
        loginIdentifier,
        status: access.status,
        expiresAt,
      },
      inviteUrl,
      emailSent,
      whatsappText: [
        `Olá ${executor.nome}! Seu acesso à obra ${executor.obra_nome} está pronto.`,
        "Ative seu acesso pelo link abaixo e crie sua senha:",
        inviteUrl,
        "Você verá somente as informações liberadas para sua função nesta obra.",
      ].join("\n"),
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ error: "Este e-mail/telefone já está vinculado a outro executor desta obra." });
      return;
    }
    logger.error({ err }, "obra field invite error");
    next(err);
  }
});

obraFieldRouter.get("/auth/obra/session", async (req: any, res) => {
  const session = await loadFieldSession(req, res);
  if (!session) return;
  res.json({
    obra: {
      id: session.obra_id,
      nome: session.obra_nome,
      endereco: session.obra_endereco,
      status: session.obra_status,
      dataInicio: session.data_inicio,
      dataFimPrevista: session.data_fim_prevista,
    },
    executor: {
      id: session.id,
      nome: session.nome,
      funcao: session.funcao,
      especialidade: session.especialidade,
      empresa: session.empresa,
      perfilAcesso: session.perfil_acesso,
      permissoes: session.permissoes ?? [],
      jornada: session.jornada,
      tipoContratacao: session.tipo_contratacao,
    },
  });
});

obraFieldRouter.post("/auth/obra/change-password", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    const parsed = changePasswordSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "A senha deve ter pelo menos 8 caracteres." });
      return;
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await pool.query(
      `UPDATE obra_executor_access
          SET password_hash = $1, force_password_reset = false, updated_at = now()
        WHERE id = $2`,
      [passwordHash, session.access_id],
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

obraFieldRouter.get("/arch/worksite/me", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    const permissions = session.permissoes ?? [];
    const readAllGoals = hasPermission(permissions, "metas.read", "metas.manage");
    const readAllSchedule = hasPermission(permissions, "cronograma.read", "cronograma.write", "cronograma.update_execution");

    const goals = await pool.query(
      `SELECT m.*, e.nome AS etapa_nome, x.nome AS executor_nome
         FROM obra_metas m
         LEFT JOIN obra_etapas e ON e.id = m.etapa_id
         LEFT JOIN obra_executores x ON x.id = m.executor_id
        WHERE m.tenant_id = $1
          AND m.obra_id = $2
          AND ($3::boolean OR m.executor_id = $4)
          AND m.status IN ('ativa','atingida')
        ORDER BY CASE m.status WHEN 'ativa' THEN 0 ELSE 1 END, m.created_at DESC`,
      [session.tenant_id, session.obra_id, readAllGoals, session.id],
    );

    let stages;
    if (readAllSchedule) {
      stages = await pool.query(
        `SELECT id, nome, descricao, status, percentual_executado, data_inicio_prevista, data_fim_prevista, responsavel
           FROM obra_etapas
          WHERE obra_id = $1
          ORDER BY ordem ASC, created_at ASC`,
        [session.obra_id],
      );
    } else {
      stages = await pool.query(
        `SELECT DISTINCT e.id, e.nome, e.descricao, e.status, e.percentual_executado,
                e.data_inicio_prevista, e.data_fim_prevista, e.responsavel, e.ordem
           FROM obra_etapas e
           INNER JOIN obra_metas m ON m.etapa_id = e.id
          WHERE e.obra_id = $1
            AND m.executor_id = $2
            AND m.status IN ('ativa','atingida')
          ORDER BY e.ordem ASC`,
        [session.obra_id, session.id],
      );
    }

    const productionScopeAll = hasPermission(permissions, "equipe.read", "metas.manage", "aprovacoes.manage");
    const canReadCost = hasPermission(permissions, "custos.read");
    const production = await pool.query(
      `SELECT a.*, x.nome AS executor_nome, e.nome AS etapa_nome
         FROM obra_apontamentos_producao a
         LEFT JOIN obra_executores x ON x.id = a.executor_id
         LEFT JOIN obra_etapas e ON e.id = a.etapa_id
        WHERE a.tenant_id = $1
          AND a.obra_id = $2
          AND ($3::boolean OR a.executor_id = $4)
        ORDER BY a.data DESC, a.created_at DESC
        LIMIT 80`,
      [session.tenant_id, session.obra_id, productionScopeAll, session.id],
    );

    const stats = production.rows.reduce(
      (acc: { quantity: number; hours: number; cost: number; blocks: number; qualityTotal: number; qualityCount: number }, row: any) => {
        acc.quantity += Number(row.quantidade ?? 0);
        acc.hours += Number(row.horas ?? 0);
        acc.cost += Number(row.custo_mao_obra ?? 0);
        if (String(row.bloqueio ?? "").trim()) acc.blocks += 1;
        const q = Number(row.qualidade_nota);
        if (Number.isFinite(q)) { acc.qualityTotal += q; acc.qualityCount += 1; }
        return acc;
      },
      { quantity: 0, hours: 0, cost: 0, blocks: 0, qualityTotal: 0, qualityCount: 0 },
    );

    res.json({
      obra: {
        id: session.obra_id,
        nome: session.obra_nome,
        endereco: session.obra_endereco,
        status: session.obra_status,
      },
      executor: {
        id: session.id,
        nome: session.nome,
        funcao: session.funcao,
        especialidade: session.especialidade,
        empresa: session.empresa,
        perfilAcesso: session.perfil_acesso,
        permissoes: permissions,
      },
      metas: goals.rows,
      etapas: stages.rows,
      apontamentos: production.rows.map((row: any) => sanitizeProductionRow(row, canReadCost)),
      kpis: {
        producaoAcumulada: stats.quantity,
        horasApontadas: stats.hours,
        custoMaoObra: canReadCost ? stats.cost : null,
        bloqueios: stats.blocks,
        qualidadeMedia: stats.qualityCount ? stats.qualityTotal / stats.qualityCount : null,
      },
    });
  } catch (err) {
    logger.error({ err }, "worksite me error");
    next(err);
  }
});

obraFieldRouter.get("/arch/worksite/diario", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    const permissions = session.permissoes ?? [];

    let filter = "AND d.executor_id = $2";
    const values: unknown[] = [session.obra_id, session.id];
    if (hasPermission(permissions, "diario.read", "diario.write")) {
      filter = "";
      values.splice(1, 1);
    } else if (hasPermission(permissions, "diario.read_approved")) {
      filter = "AND d.status = 'aprovado'";
      values.splice(1, 1);
    } else if (!hasPermission(permissions, "diario.write_own")) {
      res.status(403).json({ error: "OBRA_PERMISSION_DENIED", permission: "diario.read" });
      return;
    }

    const result = await pool.query(
      `SELECT d.*
         FROM obra_diario d
        WHERE d.obra_id = $1
          ${filter}
        ORDER BY d.data DESC, d.created_at DESC
        LIMIT 120`,
      values,
    );
    res.json({ diario: result.rows });
  } catch (err) {
    next(err);
  }
});

obraFieldRouter.post("/arch/worksite/diario", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    if (!hasPermission(session.permissoes, "diario.write_own", "diario.write")) {
      res.status(403).json({ error: "OBRA_PERMISSION_DENIED", permission: "diario.write_own" });
      return;
    }
    const parsed = diarySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      return;
    }
    const etapa = await validateEtapa(session.tenant_id, session.obra_id, parsed.data.etapaId);
    if (parsed.data.etapaId && !etapa) {
      res.status(400).json({ error: "Etapa não pertence a esta obra." });
      return;
    }
    if (parsed.data.etapaId && !await executorCanUseEtapa(session, parsed.data.etapaId, "diario.write")) {
      res.status(403).json({ error: "OBRA_STAGE_SCOPE_DENIED", message: "Esta etapa não está atribuída ao seu perfil." });
      return;
    }

    const services = etapa
      ? [{
          nome: etapa.nome,
          quantidade: parsed.data.quantidade ?? undefined,
          unidade: parsed.data.unidade ?? undefined,
          etapaId: etapa.id,
        }]
      : [];

    const result = await pool.query(
      `INSERT INTO obra_diario (
        id, obra_id, executor_id, data, conteudo, responsavel_nome, status,
        clima_tempo, observacoes, servicos_executados, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,'revisao',$7,$8,$9::jsonb,now(),now())
      RETURNING *`,
      [
        randomUUID(),
        session.obra_id,
        session.id,
        parsed.data.data ?? new Date().toISOString().slice(0, 10),
        parsed.data.conteudo,
        session.nome,
        parsed.data.climaTempo ?? null,
        parsed.data.observacoes ?? null,
        JSON.stringify(services),
      ],
    );
    res.status(201).json({ diario: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "worksite diary create error");
    next(err);
  }
});

obraFieldRouter.patch("/arch/worksite/diario/:diarioId/status", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    if (!hasPermission(session.permissoes, "aprovacoes.manage")) {
      res.status(403).json({ error: "OBRA_PERMISSION_DENIED", permission: "aprovacoes.manage" });
      return;
    }

    const parsed = diaryStatusSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "Status inválido", details: parsed.error.flatten() });
      return;
    }
    const diarioId = String(req.params["diarioId"] ?? "");
    const current = await pool.query(
      `SELECT id, status FROM obra_diario WHERE id = $1 AND obra_id = $2 LIMIT 1`,
      [diarioId, session.obra_id],
    );
    if (!current.rows[0]) {
      res.status(404).json({ error: "Entrada do diário não encontrada." });
      return;
    }

    const approved = parsed.data.status === "aprovado";
    const result = await pool.query(
      `UPDATE obra_diario
          SET status = $1,
              aprovado_por_executor_id = $2,
              aprovado_por_id = null,
              aprovado_em = CASE WHEN $3::boolean THEN now() ELSE null END,
              updated_at = now()
        WHERE id = $4 AND obra_id = $5
        RETURNING *`,
      [
        parsed.data.status,
        approved ? session.id : null,
        approved,
        diarioId,
        session.obra_id,
      ],
    );
    res.json({ diario: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "worksite diary status error");
    next(err);
  }
});

obraFieldRouter.post("/arch/worksite/producao", async (req: any, res, next) => {
  try {
    const session = await loadFieldSession(req, res);
    if (!session) return;
    if (!hasPermission(session.permissoes, "producao.write_own", "producao.write")) {
      res.status(403).json({ error: "OBRA_PERMISSION_DENIED", permission: "producao.write_own" });
      return;
    }

    const parsed = productionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() });
      return;
    }
    const etapa = await validateEtapa(session.tenant_id, session.obra_id, parsed.data.etapaId);
    if (parsed.data.etapaId && !etapa) {
      res.status(400).json({ error: "Etapa não pertence a esta obra." });
      return;
    }
    if (parsed.data.etapaId && !await executorCanUseEtapa(session, parsed.data.etapaId, "producao.write")) {
      res.status(403).json({ error: "OBRA_STAGE_SCOPE_DENIED", message: "Esta etapa não está atribuída ao seu perfil." });
      return;
    }

    const cost = productionCost(session, parsed.data.quantidade, parsed.data.horas);
    const result = await pool.query(
      `INSERT INTO obra_apontamentos_producao (
        id, tenant_id, obra_id, executor_id, etapa_id, data, quantidade, unidade, horas,
        custo_mao_obra, retrabalho_quantidade, qualidade_nota, bloqueio, observacao,
        created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())
      RETURNING *`,
      [
        randomUUID(),
        session.tenant_id,
        session.obra_id,
        session.id,
        etapa?.id ?? null,
        parsed.data.data ?? new Date().toISOString().slice(0, 10),
        parsed.data.quantidade,
        parsed.data.unidade ?? null,
        parsed.data.horas,
        cost,
        parsed.data.retrabalhoQuantidade,
        parsed.data.qualidadeNota ?? null,
        parsed.data.bloqueio ?? null,
        parsed.data.observacao ?? null,
      ],
    );

    await pool.query(
      `UPDATE obras
          SET custo_realizado =
              COALESCE((
                SELECT SUM(valor)
                  FROM obra_lancamentos
                 WHERE obra_id = $1
                   AND tenant_id = $2
                   AND status <> 'cancelado'
              ), 0)
              +
              COALESCE((
                SELECT SUM(custo_mao_obra)
                  FROM obra_apontamentos_producao
                 WHERE obra_id = $1
                   AND tenant_id = $2
              ), 0),
              updated_at = now()
        WHERE id = $1 AND tenant_id = $2`,
      [session.obra_id, session.tenant_id],
    );

    let etapaPercentual: number | null = null;
    if (etapa?.id) {
      etapaPercentual = await recalcEtapaFromStageGoals({
        tenantId: session.tenant_id,
        obraId: session.obra_id,
        etapaId: etapa.id,
        executorName: session.nome,
      });
    }

    const canReadCost = hasPermission(session.permissoes, "custos.read");
    res.status(201).json({
      apontamento: sanitizeProductionRow(result.rows[0], canReadCost),
      ...(canReadCost ? { custoCalculado: cost } : {}),
      etapaPercentual,
    });
  } catch (err) {
    logger.error({ err }, "worksite production create error");
    next(err);
  }
});

export default obraFieldRouter;
