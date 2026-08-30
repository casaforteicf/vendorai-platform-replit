import { Router, type IRouter } from "express";
import { vendorPool } from "../lib/vendorDb";
import { callOpenAI } from "../lib/ai-gateway";

const router: IRouter = Router();
export const pracaPerguntasPublicRouter: IRouter = Router();

function canAccess(req: Express.Request, tenantId: string) {
  const user = (req as any).user;
  return user?.platformRole === "super_admin" || user?.tenantId === tenantId;
}

function parseAiResult(content: string) {
  const cleaned = content.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  const answer = typeof parsed?.answer === "string" ? parsed.answer.trim() : "";
  const confidence = Number(parsed?.confidence);
  return {
    answer,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    escalate: parsed?.escalate !== false,
    reason: typeof parsed?.reason === "string" ? parsed.reason.slice(0, 1000) : "Informação insuficiente.",
  };
}

async function findOrCreateLeadAndConversation(client: any, params: {
  tenantId: string;
  clienteId: string | null;
  clienteNome: string;
  clienteEmail: string | null;
  clienteTelefone: string | null;
  productId: string;
}) {
  const phone = params.clienteTelefone?.replace(/\D/g, "") || null;
  const existing = await client.query(
    `SELECT id,nome,telefone,email FROM leads
      WHERE tenant_id=$1 AND excluido_em IS NULL AND (
        ($2::text IS NOT NULL AND metadata->>'pracaClienteId'=$2)
        OR ($3::text IS NOT NULL AND regexp_replace(coalesce(telefone,''),'\\D','','g')=$3)
        OR ($4::text IS NOT NULL AND lower(email)=lower($4))
      )
      ORDER BY created_at LIMIT 1`,
    [params.tenantId, params.clienteId, phone, params.clienteEmail],
  );

  let lead = existing.rows[0];
  if (!lead) {
    const inserted = await client.query(
      `INSERT INTO leads
        (tenant_id,nome,telefone,email,status,source,metadata)
       VALUES ($1,$2,$3,$4,'novo','praca_ai',$5::jsonb)
       RETURNING id,nome,telefone,email`,
      [
        params.tenantId, params.clienteNome, phone, params.clienteEmail,
        JSON.stringify({
          pracaClienteId: params.clienteId,
          origem: "pergunta_produto",
          primeiroProdutoId: params.productId,
        }),
      ],
    );
    lead = inserted.rows[0];
  } else {
    await client.query(
      `UPDATE leads SET
        nome=CASE WHEN nome IS NULL OR trim(nome)='' THEN $1 ELSE nome END,
        telefone=coalesce(telefone,$2),email=coalesce(email,$3),updated_at=now(),
        metadata=coalesce(metadata,'{}'::jsonb) || $4::jsonb
       WHERE id=$5`,
      [
        params.clienteNome, phone, params.clienteEmail,
        JSON.stringify({ pracaClienteId: params.clienteId, ultimoProdutoId: params.productId }),
        lead.id,
      ],
    );
  }

  const existingConversation = await client.query(
    `SELECT id FROM conversations
      WHERE tenant_id=$1 AND lead_id=$2 AND channel='chat'
        AND metadata->>'source'='praca_product_questions'
      ORDER BY created_at DESC LIMIT 1`,
    [params.tenantId, lead.id],
  );
  let conversationId = existingConversation.rows[0]?.id;
  if (!conversationId) {
    const conversation = await client.query(
      `INSERT INTO conversations
        (tenant_id,lead_id,channel,status,agent_name,metadata,ultima_mensagem_em,last_inbound_at)
       VALUES ($1,$2,'chat','open','Assistente de Produtos',$3::jsonb,now(),now())
       RETURNING id`,
      [params.tenantId, lead.id, JSON.stringify({ source: "praca_product_questions" })],
    );
    conversationId = conversation.rows[0].id;
  }
  return { lead, conversationId };
}

// Entrada pública do Praça.ai. Identidade mínima é obrigatória para que todo
// cliente seja rastreável no CRM e a pergunta nunca fique órfã.
pracaPerguntasPublicRouter.post(
  ["/products/:productId/perguntas", "/produtos-catalogo/:productId/perguntas"],
  async (req, res) => {
    const productId = String(req.params.productId);
    const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : "";
    const clienteId = typeof req.body?.clienteId === "string" ? req.body.clienteId.trim() || null : null;
    const clienteNome = typeof req.body?.clienteNome === "string" ? req.body.clienteNome.trim() : "";
    const clienteEmail = typeof req.body?.clienteEmail === "string" ? req.body.clienteEmail.trim() || null : null;
    const clienteTelefone = typeof req.body?.clienteTelefone === "string" ? req.body.clienteTelefone.trim() || null : null;

    if (pergunta.length < 3 || pergunta.length > 1000) {
      return res.status(422).json({ error: "A pergunta deve ter entre 3 e 1000 caracteres." });
    }
    if (!clienteNome || (!clienteId && !clienteEmail && !clienteTelefone)) {
      return res.status(422).json({
        error: "Identificação do cliente incompleta.",
        required: ["clienteNome", "clienteId ou clienteEmail ou clienteTelefone"],
      });
    }

    const productResult = await vendorPool.query(
      `SELECT id,tenant_id,nome,sku,descricao,imagem_url,preco_base,unidade,
              fornecedor,prazo_entrega_dias,estoque_quantidade,especificacoes
         FROM produtos_catalogo
        WHERE id=$1 AND ativo=true
          AND (vende_no_praca_ai_produto IS NULL OR vende_no_praca_ai_produto=true)
        LIMIT 1`,
      [productId],
    );
    if (!productResult.rowCount) {
      return res.status(404).json({ error: "Produto não encontrado ou não publicado." });
    }
    const product = productResult.rows[0];
    const tenantId = product.tenant_id as string;

    const client = await vendorPool.connect();
    let question: any;
    let crm: any;
    try {
      await client.query("BEGIN");
      crm = await findOrCreateLeadAndConversation(client, {
        tenantId, clienteId, clienteNome, clienteEmail, clienteTelefone, productId,
      });
      const inserted = await client.query(
        `INSERT INTO praca_produto_perguntas
          (tenant_id,product_id,cliente_id,cliente_nome,cliente_email,cliente_telefone,
           lead_id,conversation_id,pergunta,ai_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'nao_tentada')
         RETURNING id,product_id AS "productId",pergunta,status,created_at AS "createdAt"`,
        [tenantId,productId,clienteId,clienteNome,clienteEmail,clienteTelefone,
         crm.lead.id,crm.conversationId,pergunta],
      );
      question = inserted.rows[0];
      await client.query(
        `INSERT INTO messages
          (tenant_id,conversation_id,lead_id,direcao,canal,conteudo,enviado_por,status)
         VALUES ($1,$2,$3,'entrada','chat',$4,'lead','entregue')`,
        [tenantId,crm.conversationId,crm.lead.id,pergunta],
      );
      await client.query(
        `UPDATE conversations SET ultima_mensagem_em=now(),last_inbound_at=now(),updated_at=now()
          WHERE id=$1`,
        [crm.conversationId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    try {
      const ai = await callOpenAI(
        tenantId,
        "agent_response" as any,
        [
          {
            role: "system",
            content:
              "Você responde perguntas sobre produtos usando SOMENTE os dados fornecidos. " +
              "Nunca invente preço, estoque, prazo, aplicação, medida, garantia ou característica. " +
              "Se os dados não sustentarem uma resposta completa, escale. Retorne JSON estrito: " +
              '{"answer":"texto","confidence":0.0,"escalate":true,"reason":"motivo objetivo"}.',
          },
          {
            role: "user",
            content: JSON.stringify({
              pergunta,
              produto: {
                nome: product.nome,
                sku: product.sku,
                descricao: product.descricao,
                preco: product.preco_base,
                unidade: product.unidade,
                fornecedor: product.fornecedor,
                prazoEntregaDias: product.prazo_entrega_dias,
                estoqueQuantidade: product.estoque_quantidade,
                especificacoes: product.especificacoes,
              },
            }),
          },
        ],
        {
          model: "gpt-4o-mini",
          temperature: 0.1,
          maxTokens: 450,
          responseFormat: { type: "json_object" },
          log: (req as any).log,
        },
      );
      const decision = parseAiResult(ai.content);
      const autoAnswer = !decision.escalate && decision.confidence >= 0.78 && decision.answer.length > 0;

      if (autoAnswer) {
        await vendorPool.query(
          `UPDATE praca_produto_perguntas SET
            resposta=$1,status='respondida',ai_status='respondida',ai_confianca=$2,
            ai_motivo=$3,ai_resposta=$1,ai_processada_em=now(),answered_at=now(),updated_at=now()
           WHERE id=$4 AND tenant_id=$5`,
          [decision.answer,decision.confidence,decision.reason,question.id,tenantId],
        );
        await vendorPool.query(
          `INSERT INTO messages
            (tenant_id,conversation_id,lead_id,direcao,canal,conteudo,enviado_por,agent_name,status)
           VALUES ($1,$2,$3,'saida','chat',$4,'agente_ia','Assistente de Produtos','enviado')`,
          [tenantId,crm.conversationId,crm.lead.id,decision.answer],
        );
        await vendorPool.query(
          `UPDATE conversations SET ultima_mensagem_em=now(),updated_at=now() WHERE id=$1`,
          [crm.conversationId],
        );
        return res.status(201).json({
          ...question,
          status: "respondida",
          resposta: decision.answer,
          atendimento: "ia",
          leadId: crm.lead.id,
          conversationId: crm.conversationId,
        });
      }

      await vendorPool.query(
        `UPDATE praca_produto_perguntas SET
          ai_status='escalada',ai_confianca=$1,ai_motivo=$2,ai_resposta=$3,
          ai_processada_em=now(),updated_at=now()
         WHERE id=$4 AND tenant_id=$5`,
        [decision.confidence,decision.reason,decision.answer || null,question.id,tenantId],
      );
      await vendorPool.query(
        `UPDATE conversations SET nao_lidas=nao_lidas+1,current_agent='humano',updated_at=now()
          WHERE id=$1`,
        [crm.conversationId],
      );
      return res.status(201).json({
        ...question,
        atendimento: "humano",
        motivo: decision.reason,
        leadId: crm.lead.id,
        conversationId: crm.conversationId,
      });
    } catch (error: any) {
      const reason = error?.message ? String(error.message).slice(0, 1000) : "Falha técnica ao consultar a IA.";
      await vendorPool.query(
        `UPDATE praca_produto_perguntas SET
          ai_status='erro',ai_motivo=$1,ai_processada_em=now(),updated_at=now()
         WHERE id=$2 AND tenant_id=$3`,
        [reason,question.id,tenantId],
      );
      await vendorPool.query(
        `UPDATE conversations SET nao_lidas=nao_lidas+1,current_agent='humano',updated_at=now()
          WHERE id=$1`,
        [crm.conversationId],
      );
      return res.status(201).json({
        ...question,
        atendimento: "humano",
        motivo: "A IA ficou indisponível e a pergunta foi encaminhada para atendimento.",
        leadId: crm.lead.id,
        conversationId: crm.conversationId,
      });
    }
  },
);

router.get("/tenants/:tenantId/praca-perguntas-pendentes", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const result = await vendorPool.query(
    `SELECT q.id,q.product_id AS "productId",p.nome AS "productName",
            p.sku AS "productSku",p.descricao AS "productDescription",
            p.imagem_url AS "productImageUrl",p.preco_base AS "productPrice",
            p.unidade AS "productUnit",p.fornecedor AS "productSupplier",
            p.prazo_entrega_dias AS "productDeliveryDays",
            q.cliente_id AS "clienteId",q.cliente_nome AS "clienteNome",
            q.cliente_email AS "clienteEmail",q.cliente_telefone AS "clienteTelefone",
            q.lead_id AS "leadId",q.conversation_id AS "conversationId",
            q.pergunta,q.status,q.ai_status AS "aiStatus",
            q.ai_confianca AS "aiConfidence",q.ai_motivo AS "aiReason",
            q.ai_resposta AS "aiDraft",q.created_at AS "createdAt"
       FROM praca_produto_perguntas q
       JOIN produtos_catalogo p ON p.id=q.product_id AND p.tenant_id=q.tenant_id
      WHERE q.tenant_id=$1 AND q.status='pendente'
      ORDER BY q.created_at ASC`,
    [tenantId],
  );
  return res.json(result.rows);
});

router.get("/tenants/:tenantId/praca-perguntas-pendentes/count", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await vendorPool.query(
    `SELECT count(*)::int AS count FROM praca_produto_perguntas
      WHERE tenant_id=$1 AND status='pendente'`,
    [tenantId],
  );
  return res.json(result.rows[0]);
});

router.post("/tenants/:tenantId/praca-perguntas-pendentes/:perguntaId/responder", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const perguntaId = String(req.params.perguntaId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const resposta = typeof req.body?.resposta === "string" ? req.body.resposta.trim() : "";
  if (!resposta || resposta.length > 5000) {
    return res.status(422).json({ error: "Resposta obrigatória, com até 5000 caracteres." });
  }

  const client = await vendorPool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE praca_produto_perguntas SET
        resposta=$1,status='respondida',respondida_por=$2,answered_at=now(),updated_at=now()
       WHERE id=$3 AND tenant_id=$4 AND status='pendente'
       RETURNING id,product_id AS "productId",lead_id AS "leadId",
                 conversation_id AS "conversationId",pergunta,resposta,status,
                 created_at AS "createdAt",answered_at AS "answeredAt"`,
      [resposta,(req as any).user?.id ?? (req as any).user?.sub ?? null,perguntaId,tenantId],
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Pergunta pendente não encontrada para este tenant." });
    }
    const row = updated.rows[0];
    if (row.conversationId && row.leadId) {
      await client.query(
        `INSERT INTO messages
          (tenant_id,conversation_id,lead_id,direcao,canal,conteudo,enviado_por,status)
         VALUES ($1,$2,$3,'saida','chat',$4,'humano','enviado')`,
        [tenantId,row.conversationId,row.leadId,resposta],
      );
      await client.query(
        `UPDATE conversations SET current_agent=NULL,ultima_mensagem_em=now(),updated_at=now()
          WHERE id=$1 AND tenant_id=$2`,
        [row.conversationId,tenantId],
      );
    }
    await client.query("COMMIT");
    return res.json(row);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export default router;
