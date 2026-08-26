-- Completa o fluxo de perguntas do Praça.ai: identidade, CRM e auditoria da IA.
ALTER TABLE praca_produto_perguntas
  ADD COLUMN IF NOT EXISTS cliente_email text,
  ADD COLUMN IF NOT EXISTS cliente_telefone text,
  ADD COLUMN IF NOT EXISTS lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id text REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'nao_tentada'
    CHECK (ai_status IN ('nao_tentada','respondida','escalada','erro')),
  ADD COLUMN IF NOT EXISTS ai_confianca numeric(5,4),
  ADD COLUMN IF NOT EXISTS ai_motivo text,
  ADD COLUMN IF NOT EXISTS ai_resposta text,
  ADD COLUMN IF NOT EXISTS ai_processada_em timestamptz;

CREATE INDEX IF NOT EXISTS praca_perguntas_tenant_status_idx
  ON praca_produto_perguntas (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS praca_perguntas_lead_idx
  ON praca_produto_perguntas (lead_id, created_at DESC)
  WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS praca_perguntas_conversation_idx
  ON praca_produto_perguntas (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

-- Reconcilia perguntas antigas somente quando já existe identidade real.
INSERT INTO leads (tenant_id,nome,status,source,metadata)
SELECT DISTINCT ON (q.tenant_id,q.cliente_id)
       q.tenant_id,q.cliente_nome,'novo','praca_ai',
       jsonb_build_object('pracaClienteId',q.cliente_id,'origem','pergunta_produto_legada')
  FROM praca_produto_perguntas q
 WHERE q.lead_id IS NULL
   AND nullif(trim(q.cliente_id),'') IS NOT NULL
   AND nullif(trim(q.cliente_nome),'') IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM leads l
      WHERE l.tenant_id=q.tenant_id
        AND l.metadata->>'pracaClienteId'=q.cliente_id
   )
 ORDER BY q.tenant_id,q.cliente_id,q.created_at;

UPDATE praca_produto_perguntas q
   SET lead_id=l.id
  FROM leads l
 WHERE q.lead_id IS NULL
   AND q.tenant_id=l.tenant_id
   AND nullif(trim(q.cliente_id),'') IS NOT NULL
   AND l.metadata->>'pracaClienteId'=q.cliente_id;

INSERT INTO conversations
  (tenant_id,lead_id,channel,status,agent_name,metadata,ultima_mensagem_em,last_inbound_at)
SELECT DISTINCT q.tenant_id,q.lead_id,'chat','open','Assistente de Produtos',
       '{"source":"praca_product_questions"}'::jsonb,
       max(q.created_at),max(q.created_at)
  FROM praca_produto_perguntas q
 WHERE q.lead_id IS NOT NULL
   AND q.conversation_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM conversations c
      WHERE c.tenant_id=q.tenant_id AND c.lead_id=q.lead_id
        AND c.channel='chat' AND c.metadata->>'source'='praca_product_questions'
   )
 GROUP BY q.tenant_id,q.lead_id;

UPDATE praca_produto_perguntas q
   SET conversation_id=c.id
  FROM conversations c
 WHERE q.conversation_id IS NULL
   AND q.lead_id=c.lead_id
   AND q.tenant_id=c.tenant_id
   AND c.channel='chat'
   AND c.metadata->>'source'='praca_product_questions';

INSERT INTO messages
  (tenant_id,conversation_id,lead_id,direcao,canal,conteudo,enviado_por,status,created_at)
SELECT q.tenant_id,q.conversation_id,q.lead_id,'entrada','chat',q.pergunta,'lead','entregue',q.created_at
  FROM praca_produto_perguntas q
 WHERE q.lead_id IS NOT NULL AND q.conversation_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM messages m
      WHERE m.tenant_id=q.tenant_id AND m.conversation_id=q.conversation_id
        AND m.lead_id=q.lead_id AND m.direcao='entrada'
        AND m.conteudo=q.pergunta AND m.created_at=q.created_at
   );
