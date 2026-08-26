import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";

const router: IRouter = Router();
export const pracaPerguntasPublicRouter: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

// Entrada pública usada pelo Praça.ai. O tenant é sempre obtido do produto;
// nunca é aceito do corpo da requisição.
pracaPerguntasPublicRouter.post("/products/:productId/perguntas", async (req, res) => {
  const productId = String(req.params.productId);
  const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : "";
  const clienteId = typeof req.body?.clienteId === "string" ? req.body.clienteId : null;
  const clienteNome = typeof req.body?.clienteNome === "string" ? req.body.clienteNome.trim() : null;

  if (pergunta.length < 3 || pergunta.length > 1000) {
    return res.status(422).json({ error: "A pergunta deve ter entre 3 e 1000 caracteres." });
  }

  const product = await vendorPool.query(
    `SELECT id, tenant_id
       FROM produtos_catalogo
      WHERE id = $1
        AND ativo = true
        AND (vende_no_praca_ai_produto IS NULL OR vende_no_praca_ai_produto = true)
      LIMIT 1`,
    [productId],
  );
  if (product.rowCount === 0) {
    return res.status(404).json({ error: "Produto não encontrado ou não publicado." });
  }

  const tenantId = product.rows[0].tenant_id as string;
  const inserted = await vendorPool.query(
    `INSERT INTO praca_produto_perguntas
       (tenant_id, product_id, cliente_id, cliente_nome, pergunta)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, product_id AS "productId", pergunta, status,
               created_at AS "createdAt"`,
    [tenantId, productId, clienteId, clienteNome, pergunta],
  );

  return res.status(201).json(inserted.rows[0]);
});

router.get("/tenants/:tenantId/praca-perguntas-pendentes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const result = await vendorPool.query(
    `SELECT q.id,
            q.product_id AS "productId",
            p.nome AS "productName",
            p.imagem_url AS "productImageUrl",
            q.cliente_id AS "clienteId",
            q.cliente_nome AS "clienteNome",
            q.pergunta,
            q.status,
            q.created_at AS "createdAt"
       FROM praca_produto_perguntas q
       JOIN produtos_catalogo p
         ON p.id = q.product_id
        AND p.tenant_id = q.tenant_id
      WHERE q.tenant_id = $1
        AND q.status = 'pendente'
      ORDER BY q.created_at ASC`,
    [tenantId],
  );

  return res.json(result.rows);
});

router.post("/tenants/:tenantId/praca-perguntas-pendentes/:perguntaId/responder", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const perguntaId = String(req.params.perguntaId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const resposta = typeof req.body?.resposta === "string" ? req.body.resposta.trim() : "";
  if (!resposta) return res.status(422).json({ error: "resposta é obrigatória" });

  const updated = await vendorPool.query(
    `UPDATE praca_produto_perguntas
        SET resposta = $1,
            status = 'respondida',
            respondida_por = $2,
            answered_at = now(),
            updated_at = now()
      WHERE id = $3
        AND tenant_id = $4
        AND status = 'pendente'
      RETURNING id, product_id AS "productId", pergunta, resposta, status,
                created_at AS "createdAt", answered_at AS "answeredAt"`,
    [resposta, (req as any).user?.id ?? null, perguntaId, tenantId],
  );

  if (updated.rowCount === 0) {
    return res.status(404).json({ error: "Pergunta pendente não encontrada para este tenant." });
  }

  return res.json(updated.rows[0]);
});

export default router;
