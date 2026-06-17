import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const tables = [
  {name: "varejo_temporada_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_temporada') THEN CREATE TYPE varejo_temporada AS ENUM ('verao','inverno','outono','primavera','especial'); END IF; END $$`},
  {name: "varejo_colecao_status_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_colecao_status') THEN CREATE TYPE varejo_colecao_status AS ENUM ('planejamento','ativa','encerrada'); END IF; END $$`},
  {name: "varejo_categoria_produto_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_categoria_produto') THEN CREATE TYPE varejo_categoria_produto AS ENUM ('camiseta','calca','vestido','short','jaqueta','blazer','saia','acessorio','calcado','bolsa','outro'); END IF; END $$`},
  {name: "varejo_genero_produto_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_genero_produto') THEN CREATE TYPE varejo_genero_produto AS ENUM ('masculino','feminino','unissex','infantil'); END IF; END $$`},
  {name: "varejo_pedido_compra_status_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_pedido_compra_status') THEN CREATE TYPE varejo_pedido_compra_status AS ENUM ('rascunho','enviado','confirmado','entregue','cancelado'); END IF; END $$`},
  {name: "varejo_nivel_fidelidade_enum", sql: `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'varejo_nivel_fidelidade') THEN CREATE TYPE varejo_nivel_fidelidade AS ENUM ('bronze','prata','ouro','diamante'); END IF; END $$`},
  {name: "varejo_colecoes", sql: `CREATE TABLE IF NOT EXISTS varejo_colecoes (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, temporada varejo_temporada NOT NULL, ano INTEGER NOT NULL,
    status varejo_colecao_status NOT NULL DEFAULT 'planejamento',
    descricao TEXT, ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_fornecedores", sql: `CREATE TABLE IF NOT EXISTS varejo_fornecedores (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, marca TEXT, contato TEXT, email TEXT, telefone TEXT, cnpj TEXT,
    condicoes_pagamento TEXT, prazo_entrega_dias INTEGER, observacoes TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_produtos", sql: `CREATE TABLE IF NOT EXISTS varejo_produtos (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fornecedor_id TEXT REFERENCES varejo_fornecedores(id) ON DELETE SET NULL,
    colecao_id TEXT REFERENCES varejo_colecoes(id) ON DELETE SET NULL,
    nome TEXT NOT NULL, codigo TEXT, descricao TEXT,
    categoria varejo_categoria_produto, genero varejo_genero_produto,
    preco_compra NUMERIC(12,2), preco_venda NUMERIC(12,2) NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_grades", sql: `CREATE TABLE IF NOT EXISTS varejo_grades (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    produto_id TEXT NOT NULL REFERENCES varejo_produtos(id) ON DELETE CASCADE,
    tamanho TEXT NOT NULL, cor TEXT NOT NULL,
    estoque INTEGER NOT NULL DEFAULT 0, estoque_minimo INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_pedidos_compra", sql: `CREATE TABLE IF NOT EXISTS varejo_pedidos_compra (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fornecedor_id TEXT REFERENCES varejo_fornecedores(id) ON DELETE SET NULL,
    colecao_id TEXT REFERENCES varejo_colecoes(id) ON DELETE SET NULL,
    status varejo_pedido_compra_status NOT NULL DEFAULT 'rascunho',
    data_emissao TEXT NOT NULL, data_prevista TEXT,
    valor_total NUMERIC(12,2), observacoes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_pedidos_compra_itens", sql: `CREATE TABLE IF NOT EXISTS varejo_pedidos_compra_itens (
    id TEXT PRIMARY KEY,
    pedido_id TEXT NOT NULL REFERENCES varejo_pedidos_compra(id) ON DELETE CASCADE,
    produto_id TEXT REFERENCES varejo_produtos(id) ON DELETE SET NULL,
    tamanho TEXT NOT NULL, cor TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_fidelidade", sql: `CREATE TABLE IF NOT EXISTS varejo_fidelidade (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    pontos INTEGER NOT NULL DEFAULT 0,
    total_gasto NUMERIC(12,2) NOT NULL DEFAULT 0,
    nivel varejo_nivel_fidelidade NOT NULL DEFAULT 'bronze',
    ultima_compra TEXT, observacoes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_combos", sql: `CREATE TABLE IF NOT EXISTS varejo_combos (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    nome TEXT NOT NULL, descricao TEXT, preco NUMERIC(12,2),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW())`},
  {name: "varejo_combo_itens", sql: `CREATE TABLE IF NOT EXISTS varejo_combo_itens (
    id TEXT PRIMARY KEY,
    combo_id TEXT NOT NULL REFERENCES varejo_combos(id) ON DELETE CASCADE,
    produto_id TEXT REFERENCES varejo_produtos(id) ON DELETE SET NULL,
    tamanho TEXT, cor TEXT, quantidade INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT NOW())`},
];

async function main() {
  console.log("Running varejo migration...");
  for (const t of tables) {
    try {
      await db.execute(sql.raw(t.sql));
      console.log(`  ✅ ${t.name}`);
    } catch (e: any) {
      console.error(`  ❌ ${t.name}: ${e.message}`);
    }
  }
  console.log("Done.");
  process.exit(0);
}
main();
