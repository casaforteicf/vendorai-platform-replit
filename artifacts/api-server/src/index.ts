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
