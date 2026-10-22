import { Router, type IRouter } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod/v4";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { resolveAIKey } from "../lib/ai-gateway.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { gerarRelatorioDiarioPdf, type DiarioEntry } from "../lib/pdf-diario.js";

const router: IRouter = Router();

const uploadMidias = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/") ||
      file.mimetype === "application/pdf" ||
      file.mimetype === "text/plain";
    if (allowed) return cb(null, true);
    cb(new Error("Formato não permitido. Envie imagem, vídeo, PDF ou texto."));
  },
});

const mediaSchema = z.object({
  url: z.string().min(1),
  caption: z.string().max(500).optional(),
  uploadedAt: z.string().min(1),
  mimeType: z.string().max(150).optional(),
  name: z.string().max(500).optional(),
});

const servicoSchema = z.object({
  nome: z.string().min(1).max(300),
  quantidade: z.number().nonnegative().optional(),
  unidade: z.string().max(50).optional(),
  etapaId: z.string().max(100).optional(),
  observacao: z.string().max(2000).optional(),
});

const materialSchema = z.object({
  nome: z.string().min(1).max(300),
  quantidade: z.number().nonnegative().optional(),
  unidade: z.string().max(50).optional(),
  fornecedor: z.string().max(300).optional(),
  conferido: z.boolean().optional(),
  observacao: z.string().max(2000).optional(),
});

const ocorrenciaSchema = z.object({
  tipo: z.string().min(1).max(100),
  descricao: z.string().min(1).max(4000),
  gravidade: z.enum(["baixa", "media", "alta", "critica"]).optional(),
  resolvida: z.boolean().optional(),
  responsavel: z.string().max(300).optional(),
});

const equipeSchema = z.object({
  equipe: z.string().max(300).optional(),
  funcao: z.string().max(300).optional(),
  quantidade: z.number().int().nonnegative(),
  horas: z.number().nonnegative().optional(),
  responsavel: z.string().max(300).optional(),
});

const equipamentoSchema = z.object({
  nome: z.string().min(1).max(300),
  quantidade: z.number().int().nonnegative().optional(),
  horasUso: z.number().nonnegative().optional(),
  status: z.enum(["operando", "parado", "manutencao"]).optional(),
  observacao: z.string().max(2000).optional(),
});

const updateSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conteudo: z.string().min(1).max(20000).optional(),
  climaTempo: z.string().max(500).nullable().optional(),
  maoDeObra: z.number().int().nonnegative().nullable().optional(),
  observacoes: z.string().max(20000).nullable().optional(),
  condicaoCanteiro: z.string().max(2000).nullable().optional(),
  status: z.enum(["rascunho", "revisao", "aprovado"]).optional(),
  servicosExecutados: z.array(servicoSchema).max(200).optional(),
  materiaisRecebidos: z.array(materialSchema).max(200).optional(),
  ocorrencias: z.array(ocorrenciaSchema).max(200).optional(),
  equipeDetalhes: z.array(equipeSchema).max(100).optional(),
  equipamentos: z.array(equipamentoSchema).max(100).optional(),
  fotos: z.array(mediaSchema).max(100).optional(),
  videos: z.array(mediaSchema).max(50).optional(),
  anexos: z.array(mediaSchema).max(100).optional(),
});

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}

function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório para operar o Diário do ARQDOR." });
    return null;
  }
  return tid;
}

async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(`SELECT * FROM obras WHERE id = $1 AND tenant_id = $2 LIMIT 1`, [obraId, tid]);
  return result.rows[0] ?? null;
}

async function ownedDiario(tid: string, obraId: string, diarioId: string) {
  const result = await pool.query(
    `SELECT d.*
       FROM obra_diario d
       INNER JOIN obras o ON o.id = d.obra_id
      WHERE d.id = $1 AND d.obra_id = $2 AND o.tenant_id = $3
      LIMIT 1`,
    [diarioId, obraId, tid],
  );
  return result.rows[0] ?? null;
}

function mediaList(value: unknown) {
  return Array.isArray(value) ? value : [];
}

router.patch("/arch/construction/:obraId/diario/:diarioId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const diarioId = String(req.params["diarioId"] ?? "");
    const current = await ownedDiario(tid, obraId, diarioId);
    if (!current) { res.status(404).json({ error: "Entrada do diário não encontrada" }); return; }

    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) { res.status(422).json({ error: "Dados inválidos", details: parsed.error.flatten() }); return; }

    const map: Record<string, string> = {
      data: "data",
      conteudo: "conteudo",
      climaTempo: "clima_tempo",
      maoDeObra: "mao_de_obra",
      observacoes: "observacoes",
      condicaoCanteiro: "condicao_canteiro",
      status: "status",
      servicosExecutados: "servicos_executados",
      materiaisRecebidos: "materiais_recebidos",
      ocorrencias: "ocorrencias",
      equipeDetalhes: "equipe_detalhes",
      equipamentos: "equipamentos",
      fotos: "fotos",
      videos: "videos",
      anexos: "anexos",
    };

    const jsonFields = new Set(["servicosExecutados", "materiaisRecebidos", "ocorrencias", "equipeDetalhes", "equipamentos", "fotos", "videos", "anexos"]);
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(parsed.data)) {
      const col = map[key];
      if (!col) continue;
      values.push(jsonFields.has(key) ? JSON.stringify(value) : value);
      sets.push(`${col} = $${values.length}${jsonFields.has(key) ? "::jsonb" : ""}`);
    }

    if (parsed.data.status === "aprovado") {
      values.push(req.user?.sub ?? null);
      sets.push(`aprovado_por_id = $${values.length}`);
      sets.push(`aprovado_em = now()`);
    } else if (parsed.data.status && current.status === "aprovado") {
      sets.push(`aprovado_por_id = null`);
      sets.push(`aprovado_em = null`);
    }

    if (!sets.length) { res.json({ diario: current }); return; }
    values.push(diarioId);
    values.push(obraId);
    const updated = await pool.query(
      `UPDATE obra_diario SET ${sets.join(", ")}, updated_at = now()
        WHERE id = $${values.length - 1} AND obra_id = $${values.length}
        RETURNING *`,
      values,
    );
    res.json({ diario: updated.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch diary PATCH error");
    next(err);
  }
});

router.delete("/arch/construction/:obraId/diario/:diarioId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const diarioId = String(req.params["diarioId"] ?? "");
    if (!await ownedDiario(tid, obraId, diarioId)) { res.status(404).json({ error: "Entrada do diário não encontrada" }); return; }
    await pool.query(`DELETE FROM obra_diario WHERE id = $1 AND obra_id = $2`, [diarioId, obraId]);
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "arch diary DELETE error");
    next(err);
  }
});

router.post(
  "/arch/construction/:obraId/diario/:diarioId/midias",
  uploadMidias.array("midias", 10),
  async (req, res, next) => {
    try {
      const tid = requireTenant(req, res);
      if (!tid) return;
      const obraId = String(req.params["obraId"] ?? "");
      const diarioId = String(req.params["diarioId"] ?? "");
      const current = await ownedDiario(tid, obraId, diarioId);
      if (!current) { res.status(404).json({ error: "Entrada do diário não encontrada" }); return; }

      const files = req.files as Express.Multer.File[] | undefined;
      if (!files?.length) { res.status(422).json({ error: "Nenhum arquivo enviado no campo midias" }); return; }

      const storage = new ObjectStorageService();
      const caption = typeof req.body?.caption === "string" ? req.body.caption.slice(0, 500) : undefined;
      const uploadedAt = new Date().toISOString();
      const fotos = [...mediaList(current.fotos)];
      const videos = [...mediaList(current.videos)];
      const anexos = [...mediaList(current.anexos)];
      const novos: any[] = [];

      for (const file of files) {
        const url = await storage.savePrivateBuffer(file.buffer, file.mimetype, file.originalname);
        const item = { url, uploadedAt, mimeType: file.mimetype, name: file.originalname, ...(caption ? { caption } : {}) };
        novos.push(item);
        if (file.mimetype.startsWith("image/")) fotos.push(item);
        else if (file.mimetype.startsWith("video/")) videos.push(item);
        else anexos.push(item);
      }

      const result = await pool.query(
        `UPDATE obra_diario
            SET fotos = $1::jsonb, videos = $2::jsonb, anexos = $3::jsonb, updated_at = now()
          WHERE id = $4 AND obra_id = $5
          RETURNING *`,
        [JSON.stringify(fotos), JSON.stringify(videos), JSON.stringify(anexos), diarioId, obraId],
      );
      res.status(201).json({ uploaded: novos.length, midias: novos, diario: result.rows[0] });
    } catch (err) {
      logger.error({ err }, "arch diary media upload error");
      next(err);
    }
  },
);

router.post("/arch/construction/:obraId/diario/:diarioId/resumo-ia", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const diarioId = String(req.params["diarioId"] ?? "");
    const entry = await ownedDiario(tid, obraId, diarioId);
    if (!entry) { res.status(404).json({ error: "Entrada do diário não encontrada" }); return; }

    let apiKey: string;
    try {
      apiKey = (await resolveAIKey(tid, "anthropic")).apiKey;
    } catch {
      res.status(422).json({ error: "Chave Anthropic não configurada para este tenant." });
      return;
    }

    const prompt = [
      "Você é assistente de engenharia civil. Gere um resumo executivo curto, objetivo e técnico do diário de obra abaixo.",
      `Data: ${entry.data}`,
      entry.clima_tempo ? `Clima: ${entry.clima_tempo}` : null,
      entry.condicao_canteiro ? `Condição do canteiro: ${entry.condicao_canteiro}` : null,
      entry.mao_de_obra != null ? `Mão de obra: ${entry.mao_de_obra}` : null,
      `Relato: ${entry.conteudo}`,
      `Serviços: ${JSON.stringify(mediaList(entry.servicos_executados))}`,
      `Materiais recebidos: ${JSON.stringify(mediaList(entry.materiais_recebidos))}`,
      `Ocorrências: ${JSON.stringify(mediaList(entry.ocorrencias))}`,
      entry.observacoes ? `Observações: ${entry.observacoes}` : null,
      `Fotos: ${mediaList(entry.fotos).length}; vídeos: ${mediaList(entry.videos).length}; anexos: ${mediaList(entry.anexos).length}.`,
      "Destaque atividades, avanço, condições, ocorrências, riscos e próximos pontos de atenção. Máximo 6 linhas.",
    ].filter(Boolean).join("\n");

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const resumo = message.content.find((item) => item.type === "text")?.text?.trim() ?? "";
    const result = await pool.query(
      `UPDATE obra_diario SET resumo_ia = $1, updated_at = now() WHERE id = $2 AND obra_id = $3 RETURNING *`,
      [resumo, diarioId, obraId],
    );
    res.json({ diario: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "arch diary AI summary error");
    next(err);
  }
});

router.post("/arch/construction/:obraId/diario/relatorio-pdf", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res);
    if (!tid) return;
    const obraId = String(req.params["obraId"] ?? "");
    const obra = await ownedObra(tid, obraId);
    if (!obra) { res.status(404).json({ error: "Obra não encontrada" }); return; }

    const inicio = String(req.body?.dataInicio ?? "").trim() || "1900-01-01";
    const fim = String(req.body?.dataFim ?? "").trim() || "2999-12-31";
    const [tenantResult, entriesResult] = await Promise.all([
      pool.query(`SELECT name FROM tenants WHERE id = $1 LIMIT 1`, [tid]),
      pool.query(
        `SELECT * FROM obra_diario WHERE obra_id = $1 AND data >= $2::date AND data <= $3::date ORDER BY data ASC, created_at ASC`,
        [obraId, inicio, fim],
      ),
    ]);

    const entries: DiarioEntry[] = entriesResult.rows.map((entry: any) => ({
      id: String(entry.id),
      data: String(entry.data),
      conteudo: String(entry.conteudo ?? ""),
      responsavelNome: entry.responsavel_nome ?? null,
      climaTempo: entry.clima_tempo ?? null,
      maoDeObra: entry.mao_de_obra ?? null,
      observacoes: entry.observacoes ?? null,
      status: String(entry.status ?? "rascunho"),
      fotos: Array.isArray(entry.fotos) ? entry.fotos : [],
      resumoIA: entry.resumo_ia ?? null,
    }));
    const dataInicio = entries[0]?.data ?? inicio;
    const dataFim = entries.at(-1)?.data ?? fim;
    const pdf = await gerarRelatorioDiarioPdf({
      tenantName: tenantResult.rows[0]?.name ?? "Empresa",
      obraNome: String(obra.nome ?? "Obra"),
      obraEndereco: obra.endereco ?? null,
      dataInicio,
      dataFim,
      entradas: entries,
    });

    const filename = `diario-${String(obra.nome ?? "obra").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${dataInicio}-${dataFim}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (err) {
    logger.error({ err }, "arch diary PDF error");
    next(err);
  }
});

export default router;
