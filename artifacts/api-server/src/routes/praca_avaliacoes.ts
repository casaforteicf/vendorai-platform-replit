import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";

export const pracaAvaliacoesPublicRouter: IRouter = Router();
const router: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function validPhotoUrl(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= 2048
    && (value.startsWith("https://") || value.startsWith("/api/storage/"));
}

// Evento idempotente chamado quando uma entrega real é confirmada.
// Cria uma solicitação por produto, agendada para dois dias depois.
router.post("/tenants/:tenantId/orders/:orderId/delivery-confirmed", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const orderId = String(req.params.orderId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const productIds = Array.isArray(req.body?.productIds)
    ? [...new Set(req.body.productIds.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
    : [];
  if (productIds.length === 0) {
    return res.status(422).json({ error: "Informe ao menos um produto entregue." });
  }

  const products = await vendorPool.query(
    `SELECT id FROM produtos_catalogo
      WHERE tenant_id = $1 AND id = ANY($2::text[])`,
    [tenantId, productIds],
  );
  if (products.rowCount !== productIds.length) {
    return res.status(422).json({ error: "Um ou mais produtos não pertencem ao tenant." });
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const created = [];
    for (const productId of productIds) {
      const result = await client.query(
        `INSERT INTO praca_avaliacao_solicitacoes
          (tenant_id, order_id, product_id, cliente_id, cliente_nome,
           cliente_email, cliente_whatsapp, canais, solicitar_em)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,now() + interval '2 days')
         ON CONFLICT (tenant_id, order_id, product_id)
         DO UPDATE SET updated_at = now()
         RETURNING id, product_id AS "productId", token, status,
                   solicitar_em AS "solicitarEm"`,
        [
          tenantId,
          orderId,
          productId,
          typeof req.body?.clienteId === "string" ? req.body.clienteId : null,
          typeof req.body?.clienteNome === "string" ? req.body.clienteNome.trim() : null,
          typeof req.body?.clienteEmail === "string" ? req.body.clienteEmail.trim() : null,
          typeof req.body?.clienteWhatsapp === "string" ? req.body.clienteWhatsapp.trim() : null,
          JSON.stringify(Array.isArray(req.body?.canais) ? req.body.canais : ["in_app"]),
        ],
      );
      created.push(result.rows[0]);
    }
    await client.query("COMMIT");
    return res.status(201).json({ orderId, requests: created });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

pracaAvaliacoesPublicRouter.get("/reviews/requests/:token", async (req, res) => {
  const result = await vendorPool.query(
    `SELECT s.id, s.status, s.order_id AS "orderId",
            p.id AS "productId", p.nome AS "productName",
            p.imagem_url AS "productImageUrl"
       FROM praca_avaliacao_solicitacoes s
       JOIN produtos_catalogo p ON p.id = s.product_id AND p.tenant_id = s.tenant_id
      WHERE s.token = $1 AND s.status IN ('agendada','enviada','lembrada')
      LIMIT 1`,
    [String(req.params.token)],
  );
  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Solicitação inexistente, expirada ou já respondida." });
  }
  return res.json(result.rows[0]);
});

pracaAvaliacoesPublicRouter.post("/reviews/requests/:token", async (req, res) => {
  const nota = Number(req.body?.nota);
  const comentario = typeof req.body?.comentario === "string" ? req.body.comentario.trim() : null;
  const fotosRaw = Array.isArray(req.body?.fotos) ? req.body.fotos : [];
  if (!Number.isInteger(nota) || nota < 1 || nota > 10) {
    return res.status(422).json({ error: "A nota precisa ser um número inteiro entre 1 e 10." });
  }
  if (comentario && comentario.length > 5000) {
    return res.status(422).json({ error: "Comentário deve ter no máximo 5000 caracteres." });
  }
  if (fotosRaw.length > 10 || !fotosRaw.every(validPhotoUrl)) {
    return res.status(422).json({ error: "Envie no máximo 10 fotos válidas." });
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const request = await client.query(
      `SELECT * FROM praca_avaliacao_solicitacoes
        WHERE token = $1 AND status IN ('agendada','enviada','lembrada')
        FOR UPDATE`,
      [String(req.params.token)],
    );
    if (request.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Solicitação inexistente, expirada ou já respondida." });
    }
    const row = request.rows[0];
    const inserted = await client.query(
      `INSERT INTO praca_produto_avaliacoes
        (tenant_id, product_id, order_id, solicitacao_id, cliente_id,
         cliente_nome, nota, comentario, fotos, compra_verificada)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,true)
       RETURNING id, product_id AS "productId", nota, comentario, fotos,
                 compra_verificada AS "compraVerificada", status,
                 created_at AS "createdAt"`,
      [row.tenant_id,row.product_id,row.order_id,row.id,row.cliente_id,row.cliente_nome,
       nota,comentario,JSON.stringify(fotosRaw)],
    );
    await client.query(
      `UPDATE praca_avaliacao_solicitacoes
          SET status='concluida', concluida_em=now(), updated_at=now()
        WHERE id=$1`,
      [row.id],
    );
    await client.query("COMMIT");
    return res.status(201).json(inserted.rows[0]);
  } catch (error: any) {
    await client.query("ROLLBACK");
    if (error?.code === "23505") return res.status(409).json({ error: "Este produto já foi avaliado neste pedido." });
    throw error;
  } finally {
    client.release();
  }
});

pracaAvaliacoesPublicRouter.get("/products/:productId/reviews", async (req, res) => {
  const productId = String(req.params.productId);
  const summary = await vendorPool.query(
    `SELECT count(*)::int AS total,
            coalesce(round(avg(nota)::numeric, 2), 0) AS media,
            coalesce(jsonb_object_agg(nota, quantidade) FILTER (WHERE nota IS NOT NULL), '{}'::jsonb) AS distribuicao
       FROM (
         SELECT nota, count(*)::int AS quantidade
           FROM praca_produto_avaliacoes
          WHERE product_id=$1 AND status='publicada'
          GROUP BY nota
       ) x`,
    [productId],
  );
  const reviews = await vendorPool.query(
    `SELECT id, nota, comentario, fotos,
            compra_verificada AS "compraVerificada",
            cliente_nome AS "clienteNome", resposta_loja AS "respostaLoja",
            created_at AS "createdAt"
       FROM praca_produto_avaliacoes
      WHERE product_id=$1 AND status='publicada'
      ORDER BY created_at DESC LIMIT 100`,
    [productId],
  );
  return res.json({ ...summary.rows[0], reviews: reviews.rows });
});

router.get("/tenants/:tenantId/products/:productId/interactions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const productId = String(req.params.productId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [questions, reviews] = await Promise.all([
    vendorPool.query(
      `SELECT id, pergunta, resposta, status, created_at AS "createdAt", answered_at AS "answeredAt"
         FROM praca_produto_perguntas WHERE tenant_id=$1 AND product_id=$2
        ORDER BY created_at DESC`,
      [tenantId, productId],
    ),
    vendorPool.query(
      `SELECT id, nota, comentario, fotos, compra_verificada AS "compraVerificada",
              cliente_nome AS "clienteNome", status, resposta_loja AS "respostaLoja",
              created_at AS "createdAt"
         FROM praca_produto_avaliacoes WHERE tenant_id=$1 AND product_id=$2
        ORDER BY created_at DESC`,
      [tenantId, productId],
    ),
  ]);
  return res.json({ questions: questions.rows, reviews: reviews.rows });
});

router.post("/tenants/:tenantId/reviews/:reviewId/respond", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const resposta = typeof req.body?.resposta === "string" ? req.body.resposta.trim() : "";
  if (!resposta || resposta.length > 3000) {
    return res.status(422).json({ error: "Resposta obrigatória, com no máximo 3000 caracteres." });
  }
  const result = await vendorPool.query(
    `UPDATE praca_produto_avaliacoes
        SET resposta_loja=$1, respondida_em=now(), updated_at=now()
      WHERE id=$2 AND tenant_id=$3
      RETURNING id, resposta_loja AS "respostaLoja", respondida_em AS "respondidaEm"`,
    [resposta, String(req.params.reviewId), tenantId],
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Avaliação não encontrada." });
  return res.json(result.rows[0]);
});

export default router;
