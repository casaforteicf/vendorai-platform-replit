import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const tables = [
  `CREATE TABLE IF NOT EXISTS supermercado_configuracoes (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    erp_api_url TEXT, erp_api_key TEXT,
    erp_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    zapi_instance_id TEXT, zapi_token TEXT,
    bot_ativo BOOLEAN NOT NULL DEFAULT FALSE,
    mensagem_boas_vindas TEXT,
    campanhas_ativas BOOLEAN NOT NULL DEFAULT TRUE,
    contatos_por_rodada INTEGER NOT NULL DEFAULT 50,
    dias_semana TEXT[], horario_envio TEXT NOT NULL DEFAULT '09:00',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supermercado_produtos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    erp_id TEXT, nome TEXT NOT NULL, descricao TEXT, categoria TEXT,
    unidade TEXT NOT NULL DEFAULT 'un',
    preco_venda TEXT NOT NULL DEFAULT '0', preco_promocional TEXT,
    estoque INTEGER NOT NULL DEFAULT 0,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    destaque_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
    imagem_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supermercado_pedidos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'aguardando_confirmacao',
    origem TEXT NOT NULL DEFAULT 'whatsapp',
    valor_total TEXT NOT NULL DEFAULT '0',
    observacoes TEXT, endereco_entrega TEXT,
    forma_pagamento TEXT, troco_para TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supermercado_pedido_itens (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES supermercado_pedidos(id) ON DELETE CASCADE,
    produto_id TEXT REFERENCES supermercado_produtos(id) ON DELETE SET NULL,
    nome_produto TEXT NOT NULL,
    quantidade NUMERIC NOT NULL DEFAULT 1,
    unidade TEXT NOT NULL DEFAULT 'un',
    preco_unitario TEXT NOT NULL DEFAULT '0',
    subtotal TEXT NOT NULL DEFAULT '0',
    observacoes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS supermercado_campanhas (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'promocao',
    conteudo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'rascunho',
    agendado_para TIMESTAMP, enviado_em TIMESTAMP,
    total_enviados INTEGER NOT NULL DEFAULT 0,
    total_falhas INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS supermercado_campanha_envios (
    id TEXT PRIMARY KEY,
    campanha_id TEXT NOT NULL REFERENCES supermercado_campanhas(id) ON DELETE CASCADE,
    lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
    telefone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    erro_msg TEXT, enviado_em TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
];

async function main() {
  console.log("Running supermercado migration...");
  for (const ddl of tables) {
    const name = ddl.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "?";
    try {
      await db.execute(sql.raw(ddl));
      console.log(`  ✅ ${name}`);
    } catch (e: any) {
      console.error(`  ❌ ${name}: ${e.message}`);
    }
  }
  console.log("Done.");
  process.exit(0);
}

main();
