import app from "./app";
import { logger } from "./lib/logger";
import { startScheduler } from "./jobs/scheduler.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Idempotent startup migrations ───────────────────────────────────────────
async function runStartupMigrations() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_specifications (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        projeto_id TEXT NOT NULL,
        render_id TEXT,
        render_image_url TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        items_count INTEGER DEFAULT 0,
        specified_count INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_spec_items (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        specification_id TEXT NOT NULL REFERENCES arch_specifications(id) ON DELETE CASCADE,
        categoria TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade INTEGER DEFAULT 1,
        confianca NUMERIC(3,2) DEFAULT 0.80,
        status TEXT NOT NULL DEFAULT 'pendente',
        catalogo_item_id TEXT,
        override_nome TEXT,
        override_fornecedor TEXT,
        override_preco NUMERIC(10,2),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_specs_projeto    ON arch_specifications(projeto_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_specs_tenant     ON arch_specifications(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_items_spec  ON arch_spec_items(specification_id)`);
    logger.info("startup migrations: arch_specifications OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_specifications skipped (may already exist)");
  }

  // Sprint 6 — Ecosystem Engine: arch_partners + arch_solicitacoes
  try {
    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_partners_tenant ON arch_partners(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_solicitacoes_tenant ON arch_solicitacoes(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_solicitacoes_partner ON arch_solicitacoes(partner_id)`);
    logger.info("startup migrations: arch_partners OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_partners skipped (may already exist)");
  }

  // Sprint 7 — Knowledge Engine: arch_knowledge_entries + arch_knowledge_tags
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_knowledge_entries (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL,
        titulo TEXT,
        tipo TEXT,
        area_m2 NUMERIC(8,2),
        orcamento_total NUMERIC(12,2),
        status TEXT,
        tags JSONB,
        materiais_usados JSONB,
        fabricantes JSONB,
        componentes JSONB,
        prompts_usados JSONB,
        render_count INTEGER DEFAULT 0,
        renders_aprovados INTEGER DEFAULT 0,
        cenas_count INTEGER DEFAULT 0,
        revisoes INTEGER DEFAULT 0,
        snapshot_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT arch_knowledge_entries_project_unique UNIQUE (project_id)
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_knowledge_tags (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'geral',
        count INTEGER NOT NULL DEFAULT 1,
        score REAL NOT NULL DEFAULT 0.5,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_knowledge_entries_tenant ON arch_knowledge_entries(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_knowledge_entries_tipo   ON arch_knowledge_entries(tipo)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_knowledge_tags_tenant    ON arch_knowledge_tags(tenant_id)`);
    logger.info("startup migrations: arch_knowledge OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_knowledge skipped (may already exist)");
  }

  // Sprint 9 — Office OS: pipeline_stage column + arch_office_templates
  try {
    await db.execute(sql`ALTER TABLE arch_projetos ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'lead'`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_office_templates (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        descricao TEXT,
        tipo_obra TEXT,
        estilo_base TEXT,
        prazo_estimado INTEGER,
        orcamento_base NUMERIC(12,2),
        ambientes JSONB,
        materiais JSONB,
        prompts JSONB,
        vezes_criado INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_office_templates_tenant ON arch_office_templates(tenant_id)`);
    logger.info("startup migrations: arch_office_os OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_office_os skipped (may already exist)");
  }

  // ── Contract template columns on tenants ────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_template_html TEXT`);
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_template_name TEXT`);
    logger.info("startup migrations: contract_template columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: contract_template columns skipped");
  }

  // ── Contract settings JSONB on tenants ──────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contract_settings JSONB NOT NULL DEFAULT '{}'`);
    logger.info("startup migrations: contract_settings column OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: contract_settings skipped");
  }

  // ── Round-robin: last_assigned_at on users ───────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMP`);
    logger.info("startup migrations: users.last_assigned_at OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: users.last_assigned_at skipped");
  }

  // ── Content Studio Uploads ───────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS content_studio_uploads (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        session_id TEXT NOT NULL,
        file_url TEXT NOT NULL,
        purpose TEXT NOT NULL DEFAULT 'style_reference',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_content_studio_uploads_tenant  ON content_studio_uploads(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_content_studio_uploads_session ON content_studio_uploads(session_id)`);
    logger.info("startup migrations: content_studio_uploads OK");

  } catch (err) {
    logger.warn({ err }, "startup migrations: content_studio_uploads skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS forma_pagamento_mensalidade TEXT`);
    await db.execute(sql`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cond_pagamento_mensalidade TEXT`);
    logger.info("startup migrations: propostas payment mensalidade columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: propostas payment mensalidade columns skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS proposal_style_memory JSONB`);
    logger.info("startup migrations: proposal_style_memory OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: proposal_style_memory skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS instagram_url TEXT`);
    logger.info("startup migrations: business_profiles instagram_url OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: business_profiles instagram_url skipped");
  }
}

// ─── Boot sequence ────────────────────────────────────────────────────────────
runStartupMigrations().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    // Start background scheduler after server is ready
    startScheduler(logger);
  });
}).catch((err) => {
  logger.error({ err }, "Failed to run startup migrations");
  process.exit(1);
});
