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
  try {
    await db.execute(sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS proposal_template_url TEXT`);
    await db.execute(sql`ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS proposal_template_name TEXT`);
    logger.info("startup migrations: business_profiles proposal_template OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: business_profiles proposal_template skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE obra_diario ADD COLUMN IF NOT EXISTS resumo_ia TEXT`);
    logger.info("startup migrations: obra_diario resumo_ia OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: obra_diario resumo_ia skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS confirmar_estoque_antes_financeiro BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS usuario_conferencia_estoque_id TEXT`);
    logger.info("startup migrations: tenants confirmacao de estoque columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: tenants confirmacao de estoque columns skipped");
  }
  try {
    await db.execute(sql`ALTER TYPE deal_etapa ADD VALUE IF NOT EXISTS 'conferencia_estoque'`);
    logger.info("startup migrations: deal_etapa conferencia_estoque enum value OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: deal_etapa conferencia_estoque enum value skipped");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS categorias_produto (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        desconto_maximo_percentual NUMERIC(5,2),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS categoria_id TEXT REFERENCES categorias_produto(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS desconto_maximo_percentual NUMERIC(5,2)`);
    await db.execute(sql`ALTER TABLE produtos_catalogo DROP COLUMN IF EXISTS categoria`);
    logger.info("startup migrations: categorias_produto + produtos_catalogo desconto columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: categorias_produto + produtos_catalogo desconto columns skipped");
  }
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_cobranca_tipo') THEN
          CREATE TYPE deal_cobranca_tipo AS ENUM ('automatico', 'manual');
        END IF;
      END
      $$;
    `);
    await db.execute(sql`ALTER TABLE deals ADD COLUMN IF NOT EXISTS cobranca_tipo deal_cobranca_tipo`);
    logger.info("startup migrations: deals cobranca_tipo column OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: deals cobranca_tipo column skipped");
  }
  try {
    await db.execute(sql`ALTER TABLE agent_configs ADD COLUMN IF NOT EXISTS pos_venda_inactivity_days INTEGER NOT NULL DEFAULT 30`);
    logger.info("startup migrations: agent_configs pos_venda_inactivity_days column OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: agent_configs pos_venda_inactivity_days column skipped");
  }

  // Sprint 030 — SpecObject persistence
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_spec_objects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        ambiente_id UUID NULL,
        cena_id UUID NULL,
        render_id UUID NULL,
        source_object_id TEXT NULL,
        name TEXT NOT NULL,
        description TEXT NULL,
        category TEXT NULL,
        region TEXT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'un',
        catalog_product_id UUID NULL,
        catalog_material_id UUID NULL,
        manufacturer_id UUID NULL,
        supplier_id UUID NULL,
        product_name TEXT NULL,
        material_name TEXT NULL,
        manufacturer_name TEXT NULL,
        supplier_name TEXT NULL,
        material_value NUMERIC NOT NULL DEFAULT 0,
        labor_value NUMERIC NOT NULL DEFAULT 0,
        total_value NUMERIC NOT NULL DEFAULT 0,
        notes TEXT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_tenant  ON arch_spec_objects (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_project ON arch_spec_objects (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_render  ON arch_spec_objects (render_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_spec_objects_status  ON arch_spec_objects (status)`);
    logger.info("startup migrations: arch_spec_objects OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_spec_objects skipped (may already exist)");
  }

  // Sprint 031 — Real Budget Engine
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_budgets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        ambiente_id UUID NULL,
        render_id UUID NULL,
        title TEXT NOT NULL,
        client_name TEXT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        subtotal_material NUMERIC NOT NULL DEFAULT 0,
        subtotal_labor NUMERIC NOT NULL DEFAULT 0,
        subtotal NUMERIC NOT NULL DEFAULT 0,
        discount_type TEXT NOT NULL DEFAULT 'fixed',
        discount_value NUMERIC NOT NULL DEFAULT 0,
        discount_total NUMERIC NOT NULL DEFAULT 0,
        grand_total NUMERIC NOT NULL DEFAULT 0,
        notes TEXT NULL,
        client_notes TEXT NULL,
        internal_notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_budget_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        budget_id UUID NOT NULL REFERENCES arch_budgets(id) ON DELETE CASCADE,
        spec_object_id UUID NULL,
        project_id UUID NOT NULL,
        ambiente_id UUID NULL,
        render_id UUID NULL,
        item TEXT NOT NULL,
        description TEXT NULL,
        type TEXT NOT NULL DEFAULT 'product',
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'un',
        material_value NUMERIC NOT NULL DEFAULT 0,
        labor_value NUMERIC NOT NULL DEFAULT 0,
        unit_total NUMERIC NOT NULL DEFAULT 0,
        total_material NUMERIC NOT NULL DEFAULT 0,
        total_labor NUMERIC NOT NULL DEFAULT 0,
        total NUMERIC NOT NULL DEFAULT 0,
        supplier_name TEXT NULL,
        manufacturer_name TEXT NULL,
        product_name TEXT NULL,
        material_name TEXT NULL,
        visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budgets_tenant  ON arch_budgets (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budgets_project ON arch_budgets (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budgets_status  ON arch_budgets (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budget_items_tenant      ON arch_budget_items (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budget_items_budget      ON arch_budget_items (budget_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budget_items_project     ON arch_budget_items (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_budget_items_spec_object ON arch_budget_items (spec_object_id)`);
    logger.info("startup migrations: arch_budgets + arch_budget_items OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_budgets skipped (may already exist)");
  }

  // Sprint 032 — Client Portal Approval & Proposal Delivery
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_proposals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        budget_id UUID NOT NULL,
        portal_token TEXT NULL UNIQUE,
        title TEXT NOT NULL,
        client_name TEXT NULL,
        client_email TEXT NULL,
        client_phone TEXT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        version INTEGER NOT NULL DEFAULT 1,
        subtotal_material NUMERIC NOT NULL DEFAULT 0,
        subtotal_labor NUMERIC NOT NULL DEFAULT 0,
        subtotal NUMERIC NOT NULL DEFAULT 0,
        discount_total NUMERIC NOT NULL DEFAULT 0,
        grand_total NUMERIC NOT NULL DEFAULT 0,
        expires_at TIMESTAMPTZ NULL,
        sent_at TIMESTAMPTZ NULL,
        viewed_at TIMESTAMPTZ NULL,
        approved_at TIMESTAMPTZ NULL,
        rejected_at TIMESTAMPTZ NULL,
        client_notes TEXT NULL,
        internal_notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_proposal_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
        budget_item_id UUID NULL,
        spec_object_id UUID NULL,
        item TEXT NOT NULL,
        description TEXT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'un',
        material_value NUMERIC NOT NULL DEFAULT 0,
        labor_value NUMERIC NOT NULL DEFAULT 0,
        total NUMERIC NOT NULL DEFAULT 0,
        visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
        approval_status TEXT NOT NULL DEFAULT 'pending',
        client_comment TEXT NULL,
        approved_at TIMESTAMPTZ NULL,
        rejected_at TIMESTAMPTZ NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_proposal_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_name TEXT NULL,
        message TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_proposal_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        proposal_id UUID NOT NULL REFERENCES arch_proposals(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        destination TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        message TEXT NULL,
        sent_at TIMESTAMPTZ NULL,
        error TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposals_tenant   ON arch_proposals (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposals_project  ON arch_proposals (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposals_budget   ON arch_proposals (budget_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposals_token    ON arch_proposals (portal_token)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposal_items_proposal     ON arch_proposal_items (proposal_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposal_events_proposal    ON arch_proposal_events (proposal_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_proposal_deliveries_proposal ON arch_proposal_deliveries (proposal_id)`);
    logger.info("startup migrations: arch_proposals + arch_proposal_items + arch_proposal_events + arch_proposal_deliveries OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_proposals skipped (may already exist)");
  }

  // Sprint 033 — Production, Procurement & Execution Flow
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_work_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        proposal_id UUID NULL,
        proposal_item_id UUID NULL,
        budget_item_id UUID NULL,
        spec_object_id UUID NULL,
        title TEXT NOT NULL,
        description TEXT NULL,
        type TEXT NOT NULL DEFAULT 'production',
        priority TEXT NOT NULL DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'planned',
        item TEXT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'un',
        material_name TEXT NULL,
        product_name TEXT NULL,
        supplier_name TEXT NULL,
        manufacturer_name TEXT NULL,
        planned_start DATE NULL,
        planned_end DATE NULL,
        actual_start TIMESTAMPTZ NULL,
        actual_end TIMESTAMPTZ NULL,
        estimated_cost NUMERIC NOT NULL DEFAULT 0,
        actual_cost NUMERIC NOT NULL DEFAULT 0,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_supplier_orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        work_order_id UUID NULL,
        supplier_name TEXT NOT NULL,
        contact_name TEXT NULL,
        contact_phone TEXT NULL,
        contact_email TEXT NULL,
        item TEXT NOT NULL,
        quantity NUMERIC NOT NULL DEFAULT 1,
        unit TEXT NOT NULL DEFAULT 'un',
        estimated_value NUMERIC NOT NULL DEFAULT 0,
        confirmed_value NUMERIC NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'not-requested',
        requested_at TIMESTAMPTZ NULL,
        expected_delivery DATE NULL,
        delivered_at TIMESTAMPTZ NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_installation_tasks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        work_order_id UUID NULL,
        title TEXT NOT NULL,
        team TEXT NULL,
        location TEXT NULL,
        scheduled_date DATE NULL,
        duration_hours NUMERIC NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'planned',
        checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_quality_checks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        work_order_id UUID NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        responsible TEXT NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_execution_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL,
        work_order_id UUID NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        actor_type TEXT NOT NULL DEFAULT 'system',
        actor_name TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_work_orders_tenant   ON arch_work_orders (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_work_orders_project  ON arch_work_orders (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_work_orders_proposal ON arch_work_orders (proposal_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_work_orders_status   ON arch_work_orders (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_tenant     ON arch_supplier_orders (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_project    ON arch_supplier_orders (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_work_order ON arch_supplier_orders (work_order_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_supplier_orders_status     ON arch_supplier_orders (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_installation_tasks_project ON arch_installation_tasks (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_quality_checks_project     ON arch_quality_checks (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_execution_events_project   ON arch_execution_events (project_id)`);
    logger.info("startup migrations: arch_work_orders + arch_supplier_orders + arch_installation_tasks + arch_quality_checks + arch_execution_events OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_work_orders skipped (may already exist)");
  }

  // Sprint 034 — Post-Sale, Delivery & Customer Success
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        project_id UUID NOT NULL,
        proposal_id UUID NULL,
        client_name TEXT NULL,
        client_email TEXT NULL,
        client_phone TEXT NULL,
        status TEXT NOT NULL DEFAULT 'not-started',
        delivery_date DATE NULL,
        accepted_at TIMESTAMPTZ NULL,
        closed_at TIMESTAMPTZ NULL,
        nps NUMERIC NULL,
        satisfaction_score NUMERIC NULL,
        summary TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at TIMESTAMPTZ NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_delivery_checklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        category TEXT NOT NULL DEFAULT 'execution',
        label TEXT NOT NULL,
        done BOOLEAN NOT NULL DEFAULT FALSE,
        required BOOLEAN NOT NULL DEFAULT TRUE,
        responsible TEXT NULL,
        notes TEXT NULL,
        completed_at TIMESTAMPTZ NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_delivery_terms (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        title TEXT NOT NULL,
        client_name TEXT NULL,
        content TEXT NOT NULL,
        accepted BOOLEAN NOT NULL DEFAULT FALSE,
        accepted_by TEXT NULL,
        accepted_at TIMESTAMPTZ NULL,
        signature_url TEXT NULL,
        public_token TEXT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_final_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        type TEXT NOT NULL DEFAULT 'other',
        title TEXT NOT NULL,
        description TEXT NULL,
        file_url TEXT NULL,
        thumbnail_url TEXT NULL,
        visible_to_client BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_satisfaction_surveys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        status TEXT NOT NULL DEFAULT 'not-sent',
        nps NUMERIC NULL,
        satisfaction_score NUMERIC NULL,
        comment TEXT NULL,
        client_name TEXT NULL,
        public_token TEXT NULL UNIQUE,
        sent_at TIMESTAMPTZ NULL,
        answered_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_testimonial_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        channel TEXT NOT NULL DEFAULT 'manual',
        message TEXT NOT NULL,
        testimonial TEXT NULL,
        rating NUMERIC NULL,
        received_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_future_opportunities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NULL,
        delivery_id UUID NOT NULL REFERENCES arch_deliveries(id) ON DELETE CASCADE,
        project_id UUID NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'identified',
        title TEXT NOT NULL,
        description TEXT NULL,
        estimated_value NUMERIC NOT NULL DEFAULT 0,
        next_action TEXT NULL,
        due_date DATE NULL,
        owner_name TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_post_sale_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NULL,
        project_id UUID NOT NULL,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        actor_type TEXT NOT NULL DEFAULT 'system',
        actor_name TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_deliveries_tenant              ON arch_deliveries (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_deliveries_project             ON arch_deliveries (project_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_delivery_checklist_delivery    ON arch_delivery_checklist (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_delivery_terms_delivery        ON arch_delivery_terms (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_final_documents_delivery       ON arch_final_documents (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_satisfaction_surveys_delivery  ON arch_satisfaction_surveys (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_testimonial_requests_delivery  ON arch_testimonial_requests (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_future_opportunities_delivery  ON arch_future_opportunities (delivery_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_future_opportunities_tenant    ON arch_future_opportunities (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_post_sale_events_project       ON arch_post_sale_events (project_id)`);
    logger.info("startup migrations: arch_deliveries + arch_delivery_checklist + arch_delivery_terms + arch_final_documents + arch_satisfaction_surveys + arch_testimonial_requests + arch_future_opportunities + arch_post_sale_events OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_deliveries skipped (may already exist)");
  }

  // Sprint — Prospector bot detection: add sinais_bot column + new status value
  try {
    await db.execute(sql`
      ALTER TABLE scout_oportunidades
        ADD COLUMN IF NOT EXISTS sinais_bot INTEGER NOT NULL DEFAULT 0
    `);
    logger.info("startup migrations: scout_oportunidades.sinais_bot OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: scout_oportunidades.sinais_bot skipped (may already exist)");
  }

  // Sprint 036 — Theme System: arch_theme_preferences table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_theme_preferences (
        id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id                UUID        NULL,
        user_id                  UUID        NULL,
        mode                     TEXT        NOT NULL DEFAULT 'light',
        accent                   TEXT        NOT NULL DEFAULT 'violet',
        use_dark_render_workspace BOOLEAN     NOT NULL DEFAULT true,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (tenant_id, user_id)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_theme_prefs_tenant ON arch_theme_preferences (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_theme_prefs_user   ON arch_theme_preferences (user_id)`);
    logger.info("startup migrations: arch_theme_preferences OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_theme_preferences skipped (may already exist)");
  }

  // Sprint 035 — System Consolidation & QA: arch_release_gates table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_release_gates (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id   UUID        NULL,
        gate_id     TEXT        NOT NULL UNIQUE,
        status      TEXT        NOT NULL DEFAULT 'pending',
        evidence    TEXT        NULL,
        owner       TEXT        NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_release_gates_tenant ON arch_release_gates (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_release_gates_status ON arch_release_gates (status)`);
    logger.info("startup migrations: arch_release_gates OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_release_gates skipped (may already exist)");
  }
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sdr_templates (
        id          TEXT PRIMARY KEY NOT NULL,
        tenant_id   TEXT REFERENCES tenants(id) ON DELETE CASCADE,
        cenario     TEXT NOT NULL,
        ordem       INTEGER DEFAULT 1 NOT NULL,
        delay_horas INTEGER DEFAULT 0 NOT NULL,
        template    TEXT NOT NULL,
        ativo       BOOLEAN DEFAULT true NOT NULL,
        created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
        updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
      SELECT gen_random_uuid()::text, NULL, 'frio_teste', 1, 0,
        'Oi {dono_nome}! Rapidinho — uma pergunta sobre a {empresa_lead}: hoje, como vocês lidam com o atendimento de clientes pelo WhatsApp?

1️⃣ Respondo tudo manualmente, sem sistema
2️⃣ Uso algum sistema, mas sem IA
3️⃣ Já uso IA ou automação de alguma forma

Só me manda o número, já ajuda demais 🙂',
        true
      WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'frio_teste' AND ordem = 1)
    `);
    await db.execute(sql`
      UPDATE sdr_templates
      SET    template    = 'Oi {dono_nome}! Rapidinho — uma pergunta sobre a {empresa_lead}: hoje, como vocês lidam com o atendimento de clientes pelo WhatsApp?

1️⃣ Respondo tudo manualmente, sem sistema
2️⃣ Uso algum sistema, mas sem IA
3️⃣ Já uso IA ou automação de alguma forma

Só me manda o número, já ajuda demais 🙂',
             updated_at  = NOW()
      WHERE  tenant_id IS NULL
        AND  cenario     = 'frio_teste'
        AND  ordem       = 1
        AND  template NOT LIKE '%1️⃣%'
    `);
    await db.execute(sql`
      INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
      SELECT gen_random_uuid()::text, NULL, 'frio_revelacao', 1, 20,
        'Oi {dono_nome}, tudo bem? {status_resposta} sobre a mensagem anterior — sem problema, sei que a rotina é corrida. Só reforçando: a ideia é simples, {empresa_lead} passa a responder cliente na hora pelo WhatsApp, sem precisar contratar mais gente pro atendimento.

Se quiser, consigo te mostrar rapidinho essa semana. Algum horário funciona melhor?',
        true
      WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'frio_revelacao' AND ordem = 1)
    `);
    await db.execute(sql`
      INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
      SELECT gen_random_uuid()::text, NULL, 'pos_visita', 1, 0,
        'Oi {dono_nome}! Passei aí em {empresa_lead} e conversei com {nome_gatekeeper} sobre como a IA pode ajudar vocês a atender mais rápido pelo WhatsApp. Fiquei pensando no que você comentou sobre {principal_reclamacao} — é exatamente o tipo de coisa que resolvemos.

Topa uma conversa rápida pra eu te mostrar como funcionaria na prática? {dia_sugestao_1} ou {dia_sugestao_2}?',
        true
      WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'pos_visita' AND ordem = 1)
    `);
    await db.execute(sql`
      INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
      SELECT gen_random_uuid()::text, NULL, 'direto_dono', 1, 0,
        '{dono_nome}, tudo bem? Sou {vendedor_nome}, trabalho ajudando empresas de {segmento} a vender mais organizando o atendimento pelo WhatsApp com IA. Antes de qualquer coisa: faz sentido pra {empresa_lead} hoje, ou vocês já têm isso resolvido?

Se fizer sentido, te mostro em 10 minutos como funciona.',
        true
      WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'direto_dono' AND ordem = 1)
    `);
    // Cenário inbound_site — leads que chegam pelo formulário do site ou landing pages
    await db.execute(sql`
      INSERT INTO sdr_templates (id, tenant_id, cenario, ordem, delay_horas, template, ativo)
      SELECT gen_random_uuid()::text, NULL, 'inbound_site', 1, 0,
        'Oi {dono_nome}! Aqui é da appvendor.ai — recebi sua mensagem pelo site e quero entender melhor o que você precisa 🙂

Me conta: qual é o maior gargalo no atendimento do seu negócio hoje? Com isso consigo te mostrar algo realmente útil.',
        true
      WHERE NOT EXISTS (SELECT 1 FROM sdr_templates WHERE tenant_id IS NULL AND cenario = 'inbound_site' AND ordem = 1)
    `);
    await db.execute(sql`
      UPDATE sdr_templates
      SET    template    = 'Oi {dono_nome}! Aqui é da appvendor.ai — recebi sua mensagem pelo site e quero entender melhor o que você precisa 🙂

Me conta: qual é o maior gargalo no atendimento do seu negócio hoje? Com isso consigo te mostrar algo realmente útil.',
             updated_at  = NOW()
      WHERE  tenant_id IS NULL
        AND  cenario     = 'inbound_site'
        AND  ordem       = 1
        AND  template LIKE '%VendorAI%'
    `);
    // Pesquisa de maturidade em IA/automação
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS maturidade_ia INTEGER`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_resposta_pesquisa TIMESTAMPTZ`);
    logger.info("startup migrations: sdr_templates global seeds OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: sdr_templates global seeds skipped");
  }

  // Campaign image support
  try {
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS image_url TEXT`);
    logger.info("startup migrations: campaigns.image_url OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: campaigns.image_url skipped");
  }

  // Dual-price support for catalog products (implantação + mensalidade)
  try {
    await db.execute(sql`ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS preco_implantacao NUMERIC(12,2)`);
    await db.execute(sql`ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS preco_mensalidade NUMERIC(12,2)`);
    logger.info("startup migrations: produtos_catalogo dual-price columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: produtos_catalogo dual-price columns skipped");
  }

  // Seed VendorAI SaaS plans for tenant 1d4ea673-58d0-413a-a554-c9aca72a3121
  // Deactivate ALL non-standard products (regardless of product_type — catches legacy entries
  // with wrong names like "Implantação sistema de gerenciamento lead com IA PRO")
  // and UPSERT the 6 real plans so values are always up-to-date on every restart.
  try {
    const VENDORAI_TENANT = "1d4ea673-58d0-413a-a554-c9aca72a3121";
    await db.execute(sql`
      UPDATE produtos_catalogo
      SET ativo = false, updated_at = now()
      WHERE tenant_id = ${VENDORAI_TENANT}
        AND nome NOT IN ('Growth Mensal','Growth Anual','PME+ Mensal','PME+ Anual','Enterprise Mensal','Enterprise Anual')
    `);
    const plans = [
      { nome: "Growth Mensal",      precoBase: "1490.00", implantacao: "4900.00", mensalidade: "1490.00", recorrencia: "mensal", prazo: 12 },
      { nome: "Growth Anual",       precoBase: "1190.00", implantacao: "4900.00", mensalidade: "1190.00", recorrencia: "anual",  prazo: 12 },
      { nome: "PME+ Mensal",        precoBase: "1890.00", implantacao: "6900.00", mensalidade: "1890.00", recorrencia: "mensal", prazo: 12 },
      { nome: "PME+ Anual",         precoBase: "1490.00", implantacao: "6900.00", mensalidade: "1490.00", recorrencia: "anual",  prazo: 12 },
      { nome: "Enterprise Mensal",  precoBase: "2490.00", implantacao: "8900.00", mensalidade: "2490.00", recorrencia: "mensal", prazo: 12 },
      { nome: "Enterprise Anual",   precoBase: "1990.00", implantacao: "8900.00", mensalidade: "1990.00", recorrencia: "anual",  prazo: 12 },
    ];
    for (const p of plans) {
      // UPDATE existing row to enforce correct prices (idempotent on every restart)
      await db.execute(sql`
        UPDATE produtos_catalogo
        SET preco_base = ${p.precoBase}::numeric,
            preco_implantacao = ${p.implantacao}::numeric,
            preco_mensalidade = ${p.mensalidade}::numeric,
            product_type = 'saas_plan',
            recorrencia = ${p.recorrencia},
            prazo_contrato = ${p.prazo},
            ativo = true,
            destaque = true,
            updated_at = now()
        WHERE tenant_id = ${VENDORAI_TENANT} AND nome = ${p.nome}
      `);
      // INSERT if no row exists yet
      await db.execute(sql`
        INSERT INTO produtos_catalogo
          (id, tenant_id, nome, product_type, preco_base, preco_implantacao, preco_mensalidade,
           recorrencia, prazo_contrato, unidade, ativo, destaque, exige_agendamento, created_at, updated_at)
        SELECT
          gen_random_uuid(), ${VENDORAI_TENANT}, ${p.nome}, 'saas_plan',
          ${p.precoBase}::numeric, ${p.implantacao}::numeric, ${p.mensalidade}::numeric,
          ${p.recorrencia}, ${p.prazo}, 'un', true, true, false, now(), now()
        WHERE NOT EXISTS (
          SELECT 1 FROM produtos_catalogo
          WHERE tenant_id = ${VENDORAI_TENANT} AND nome = ${p.nome}
        )
      `);
    }
    logger.info("startup migrations: VendorAI SaaS plans seeded/updated OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: VendorAI SaaS plans seed skipped");
  }

  // ── BLOCO 14: Organizações (redes de lojas) ──────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS organizacoes (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS usuarios_organizacao (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        organizacao_id TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
        nivel TEXT NOT NULL DEFAULT 'admin_organizacao',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS organizacao_id TEXT REFERENCES organizacoes(id) ON DELETE SET NULL`);
    logger.info("startup migrations: organizacoes OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: organizacoes skipped");
  }

  // ── BLOCO 14 Fase B: audit log de troca de tenant ────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenant_switch_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        from_tenant_id TEXT NOT NULL,
        to_tenant_id TEXT NOT NULL,
        organizacao_id TEXT NOT NULL,
        ip_address TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("startup migrations: tenant_switch_log OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: tenant_switch_log skipped");
  }

  // ── Relatos Técnicos — checkpoint humano para bugs identificados pelo Suporte ──
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS relatos_tecnicos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        lead_id UUID NULL,
        conversation_id UUID NULL,
        descricao_problema TEXT NOT NULL,
        transcript_relevante TEXT NULL,
        status TEXT NOT NULL DEFAULT 'pendente_revisao',
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_relatos_tecnicos_status ON relatos_tecnicos (status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_relatos_tecnicos_tenant ON relatos_tecnicos (tenant_id)`);
    logger.info("startup migrations: relatos_tecnicos OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: relatos_tecnicos skipped");
  }

  // ── Arch: arqdor_workspace_projects ──────────────────────────────────────────
  // Table stores Render Studio project context blobs per tenant.
  // Missing in production — created here so GET /api/arqdor/projects/:id
  // returns 404 (not found) instead of 500 (relation does not exist).
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arqdor_workspace_projects (
        id          TEXT        NOT NULL,
        tenant_id   TEXT        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        context_blob JSONB      NOT NULL DEFAULT '{}',
        created_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
        PRIMARY KEY (id, tenant_id)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arqdor_workspace_projects_tenant ON arqdor_workspace_projects (tenant_id)`);
    logger.info("startup migrations: arqdor_workspace_projects OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arqdor_workspace_projects skipped");
  }

  // ── Arch: arch_ai_renders — jobs assíncronos do Render Studio ────────────────
  // Table missing in production → INSERT throws "relation does not exist" → 500
  // causing the frontend to show "Resposta inválida do servidor".
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_ai_renders (
        id                       TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id                TEXT         NOT NULL,
        lead_id                  TEXT,
        project_id               TEXT,
        parent_render_id         TEXT,
        mode                     VARCHAR(20)  NOT NULL DEFAULT 'criar',
        ambiente                 TEXT         NOT NULL,
        estilo                   TEXT,
        iluminacao               TEXT,
        angulo                   TEXT,
        mask_zones               JSONB,
        mask_file_url            TEXT,
        original_image_url       TEXT,
        result_image_url         TEXT,
        segmentation_confidence  JSONB,
        composited               BOOLEAN      DEFAULT FALSE,
        version_tag              VARCHAR(30),
        status                   VARCHAR(30)  DEFAULT 'processando',
        erro_msg                 TEXT,
        prompt                   TEXT,
        motor                    VARCHAR(50),
        retentativas             VARCHAR(5)   DEFAULT '0',
        created_at               TIMESTAMP    NOT NULL DEFAULT NOW(),
        concluido_em             TIMESTAMP
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_tenant ON arch_ai_renders (tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_ai_renders_status ON arch_ai_renders (status)`);
    logger.info("startup migrations: arch_ai_renders OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_ai_renders skipped");
  }

  // ── Arch: arch_project_configs — configurações reutilizáveis de render ────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS arch_project_configs (
        id               TEXT         NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id        TEXT         NOT NULL,
        lead_id          TEXT,
        nome_config      TEXT         NOT NULL,
        mode             VARCHAR(20)  NOT NULL DEFAULT 'preservar',
        estilo           TEXT,
        iluminacao       TEXT,
        angulo_padrao    TEXT,
        paleta_materiais JSONB,
        created_at       TIMESTAMP    NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_arch_project_configs_tenant ON arch_project_configs (tenant_id)`);
    logger.info("startup migrations: arch_project_configs OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: arch_project_configs skipped");
  }

  // ── Seed: correct company name for Comercio Brasil / Vendor.ai tenant ────────
  // business_profiles.nome_fantasia must match the WhatsApp Business (WABA)
  // display name "appvendor.ai" so the agent uses the right brand in messages.
  try {
    await db.execute(sql`
      UPDATE business_profiles
      SET    nome_fantasia = 'appvendor.ai', updated_at = NOW()
      WHERE  tenant_id = '1d4ea673-58d0-413a-a554-c9aca72a3121'
        AND  (nome_fantasia IS DISTINCT FROM 'appvendor.ai')
    `);
    await db.execute(sql`
      UPDATE tenants
      SET    name = 'appvendor.ai', updated_at = NOW()
      WHERE  id = '1d4ea673-58d0-413a-a554-c9aca72a3121'
        AND  (name IS DISTINCT FROM 'appvendor.ai')
    `);
    logger.info("startup seed: appvendor.ai name OK");
  } catch (err) {
    logger.warn({ err }, "startup seed: appvendor.ai name skipped");
  }

  // ── Seed: tenant institucional (formulário do site / SDR inbound) ─────────
  // Garante tenant sistema + credenciais Z-API para +5549998089269 (appvendorai.ai).
  // Credenciais confirmadas via teste direto Z-API (retornou messageId com sucesso).
  // UPSERT garante atualização em cada boot sem depender de dados de outro tenant.
  try {
    await db.execute(sql`
      INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
      VALUES (
        'vendorai-institucional',
        'VendorAI Institucional',
        'vendorai-institucional',
        'active',
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `);
    await db.execute(sql`
      INSERT INTO agent_configs
        (id, tenant_id, zapi_instance_id, zapi_token, zapi_client_token, agents, created_at, updated_at)
      VALUES (
        gen_random_uuid()::text,
        'vendorai-institucional',
        '3F4B096FA7AD21713937F6DAA4CB42D9',
        'F6220ACB787A36D9C7966393',
        'Fe921a2894051472ab785be24e73b55b5S',
        '{}'::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        zapi_instance_id  = '3F4B096FA7AD21713937F6DAA4CB42D9',
        zapi_token        = 'F6220ACB787A36D9C7966393',
        zapi_client_token = 'Fe921a2894051472ab785be24e73b55b5S',
        updated_at        = NOW()
    `);
    logger.info("startup seed: vendorai-institucional tenant + agent_configs OK");
  } catch (err) {
    logger.warn({ err }, "startup seed: vendorai-institucional skipped");
  }

  // ── Backfill: move leads with 2+ consecutive outbound messages (no reply) ──
  // Applies the new cadence-closing rule retroactively to existing leads that
  // have already exceeded 2 unanswered attempts. Runs via raw SQL for performance.
  try {
    // Step 1: get candidate conversations — last message > 1 day ago, lead not yet aquecimento
    const staleConvs = await db.execute(sql`
      SELECT c.id AS conversation_id, c.lead_id, c.tenant_id
      FROM conversations c
      INNER JOIN leads l ON l.id = c.lead_id
      WHERE l.status != 'aquecimento'
        AND l.telefone IS NOT NULL
        AND c.ultima_mensagem_em < NOW() - INTERVAL '1 day'
        AND c.ultima_mensagem_em > NOW() - INTERVAL '60 days'
    `);

    // Step 2: check consecutive outbound tail per conversation, move eligible leads
    let backfillMoved = 0;
    const rows = (staleConvs as { rows: Array<{ conversation_id: string; lead_id: string; tenant_id: string }> }).rows ?? [];
    for (const row of rows) {
      const { conversation_id, lead_id, tenant_id } = row;
      const recentMsgs = await db.execute(sql`
        SELECT direcao FROM messages
        WHERE conversation_id = ${conversation_id}
        ORDER BY created_at DESC
        LIMIT 10
      `);
      const msgs = (recentMsgs as { rows: Array<{ direcao: string }> }).rows ?? [];
      let consecutiveOut = 0;
      for (const m of msgs) {
        if (m.direcao === "saida") consecutiveOut++;
        else break;
      }
      if (consecutiveOut < 2) continue;

      await db.execute(sql`
        UPDATE leads SET status = 'aquecimento', updated_at = NOW()
        WHERE id = ${lead_id} AND status != 'aquecimento'
      `);
      await db.execute(sql`
        UPDATE deals SET etapa = 'em_aquecimento', updated_at = NOW()
        WHERE id = (
          SELECT id FROM deals
          WHERE lead_id = ${lead_id} AND tenant_id = ${tenant_id}
            AND etapa NOT IN ('ganho', 'perdido', 'em_aquecimento')
          ORDER BY created_at DESC
          LIMIT 1
        )
      `);
      backfillMoved++;
    }
    logger.info({ backfillMoved }, "startup backfill: cadence-closing leads → aquecimento OK");
  } catch (err) {
    logger.warn({ err }, "startup backfill: cadence-closing backfill skipped");
  }

  // Seller commissions table
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS seller_commissions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        seller_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        cliente_tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
        deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
        plan_slug TEXT,
        cliente_nome TEXT,
        valor_implantacao_cents INTEGER NOT NULL,
        percentual INTEGER NOT NULL DEFAULT 20,
        valor_comissao_cents INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        observacoes TEXT,
        paid_at TIMESTAMP,
        paid_by_user_id TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seller_comm_tenant ON seller_commissions(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seller_comm_seller ON seller_commissions(seller_user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_seller_comm_deal   ON seller_commissions(deal_id)`);
    logger.info("startup migrations: seller_commissions OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: seller_commissions skipped (may already exist)");
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS prospect_feedback (
        id           TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating       INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment      TEXT,
        converted    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pfeedback_tenant_lead ON prospect_feedback(tenant_id, lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pfeedback_lead ON prospect_feedback(lead_id)`);
    logger.info("startup migrations: prospect_feedback OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: prospect_feedback skipped (may already exist)");
  }

  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lead_embeddings (
        id           TEXT PRIMARY KEY,
        tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id      TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        embedding    VECTOR(1536),
        segmento     TEXT,
        nome         TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_lead_emb_tenant ON lead_embeddings(tenant_id)`);
    logger.info("startup migrations: lead_embeddings OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: lead_embeddings skipped (may already exist or pgvector unavailable)");
  }

  // ── Flow execution engagement tracking (wamid + aberta_em + clicada_em) ──
  try {
    await db.execute(sql`ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS wamid TEXT`);
    await db.execute(sql`ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS aberta_em TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS clicada_em TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE prospector_flow_executions ADD COLUMN IF NOT EXISTS engajamento_adaptado BOOLEAN DEFAULT FALSE`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pfe_wamid ON prospector_flow_executions(wamid) WHERE wamid IS NOT NULL`);
    logger.info("startup migrations: prospector_flow_executions engagement columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: prospector_flow_executions engagement columns skipped");
  }

  // ── Campaign A/B testing columns ──────────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_enabled INTEGER DEFAULT 0`);
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_sample_pct INTEGER DEFAULT 30`);
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS variant_a_text TEXT`);
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS variant_b_text TEXT`);
    await db.execute(sql`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS winning_variant TEXT`);
    logger.info("startup migrations: campaigns A/B columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: campaigns A/B columns skipped");
  }

  // ── campaign_sent_logs ────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS campaign_sent_logs (
        id TEXT PRIMARY KEY,
        campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        variant TEXT NOT NULL DEFAULT 'main',
        wamid TEXT,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_at TIMESTAMPTZ
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_csl_campaign ON campaign_sent_logs(campaign_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_csl_lead ON campaign_sent_logs(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_csl_wamid ON campaign_sent_logs(wamid) WHERE wamid IS NOT NULL`);
    logger.info("startup migrations: campaign_sent_logs OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: campaign_sent_logs skipped");
  }

  // ── lead_optimal_hours ────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS lead_optimal_hours (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL UNIQUE REFERENCES leads(id) ON DELETE CASCADE,
        optimal_hour INTEGER,
        confidence REAL NOT NULL DEFAULT 0.5,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    logger.info("startup migrations: lead_optimal_hours OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: lead_optimal_hours skipped");
  }

  // ── scout_oportunidades.score_oportunidade ────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE scout_oportunidades ADD COLUMN IF NOT EXISTS score_oportunidade NUMERIC(5,2)`);
    logger.info("startup migrations: scout_oportunidades.score_oportunidade OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: scout_oportunidades.score_oportunidade skipped");
  }

  // ── leads churn columns ───────────────────────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_churned BOOLEAN NOT NULL DEFAULT FALSE`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS churned_at TIMESTAMPTZ`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_is_churned ON leads(tenant_id) WHERE is_churned = FALSE`);
    logger.info("startup migrations: leads churn columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: leads churn columns skipped");
  }

  // ── churn_actions ─────────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS churn_actions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        action_type TEXT NOT NULL,
        message_sent TEXT,
        churn_risk_at_action REAL,
        action_successful BOOLEAN,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_churn_actions_lead ON churn_actions(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_churn_actions_tenant ON churn_actions(tenant_id)`);
    logger.info("startup migrations: churn_actions OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: churn_actions skipped");
  }

  // ── campaign_sent_logs: converted_at ───────────────────────────────────────
  try {
    await db.execute(sql`
      ALTER TABLE campaign_sent_logs
        ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ
    `);
    logger.info("startup migrations: campaign_sent_logs.converted_at OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: campaign_sent_logs.converted_at skipped");
  }

  // ── agent_execution_log ────────────────────────────────────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_execution_log (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        agent_name TEXT NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        success BOOLEAN,
        error_message TEXT,
        duration_ms INTEGER
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_exec_log_agent ON agent_execution_log(agent_name)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_exec_log_at ON agent_execution_log(executed_at DESC)`);
    logger.info("startup migrations: agent_execution_log OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: agent_execution_log skipped");
  }

  // ── intent_signals (Revenue Scout com Intenção Preditiva) ─────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS intent_signals (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        signal_type TEXT NOT NULL,
        source TEXT NOT NULL,
        product_name TEXT,
        search_term TEXT,
        url TEXT,
        value REAL NOT NULL DEFAULT 50,
        confidence REAL NOT NULL DEFAULT 0.8,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        metadata JSONB
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_intent_signals_lead ON intent_signals(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_intent_signals_tenant ON intent_signals(tenant_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_intent_signals_captured ON intent_signals(captured_at DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_intent_signals_type ON intent_signals(signal_type)`);
    logger.info("startup migrations: intent_signals OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: intent_signals skipped");
  }

  // ── leads: intent_score, last_intent_update, construction_stage, context_answered_at
  try {
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS intent_score REAL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_intent_update TIMESTAMPTZ`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS construction_stage TEXT`);
    await db.execute(sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS context_answered_at TIMESTAMPTZ`);
    logger.info("startup migrations: leads intent/construction columns OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: leads intent/construction columns skipped");
  }

  // ── tenant_nav_modules: layout dinâmico por tenant ───────────────────────
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tenant_nav_modules (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        module_key TEXT NOT NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT tenant_nav_modules_tenant_key_uidx UNIQUE (tenant_id, module_key)
      )
    `);
    logger.info("startup migrations: tenant_nav_modules OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: tenant_nav_modules skipped");
  }

  // ── produtos_catalogo: comissao_percentual ───────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE produtos_catalogo ADD COLUMN IF NOT EXISTS comissao_percentual NUMERIC(5,2)`);
    logger.info("startup migrations: produtos_catalogo.comissao_percentual OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: produtos_catalogo.comissao_percentual skipped");
  }

  // ── tenants: comissao_padrao_percentual ─────────────────────────────────
  try {
    await db.execute(sql`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS comissao_padrao_percentual NUMERIC(5,2) DEFAULT 0`);
    logger.info("startup migrations: tenants.comissao_padrao_percentual OK");
  } catch (err) {
    logger.warn({ err }, "startup migrations: tenants.comissao_padrao_percentual skipped");
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
