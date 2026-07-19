-- Sprint 6 — Ecosystem Engine: arch_partners + arch_solicitacoes
CREATE TABLE IF NOT EXISTS arch_partners (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'fornecedor',
  contato TEXT,
  email TEXT,
  telefone TEXT,
  website TEXT,
  cidade TEXT,
  estado TEXT,
  prazo_dias INTEGER,
  prazo_descricao TEXT,
  especialidades JSONB,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arch_solicitacoes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  partner_id TEXT REFERENCES arch_partners(id) ON DELETE SET NULL,
  parceiro_nome TEXT,
  projeto_id TEXT,
  projeto_titulo TEXT,
  catalogo_item_id TEXT,
  item_nome TEXT,
  mensagem TEXT,
  canal_envio TEXT,
  enviado_em TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arch_partners_tenant      ON arch_partners(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_solicitacoes_tenant  ON arch_solicitacoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_arch_solicitacoes_partner ON arch_solicitacoes(partner_id);
