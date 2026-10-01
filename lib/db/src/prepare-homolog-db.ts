import { Pool } from "pg";

if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
  console.log("[homolog-bootstrap] skipped");
  process.exit(0);
}

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) throw new Error("Homologation database URL missing");
if (/gfocphuiyyufwzcyihbk/i.test(connectionString)) {
  throw new Error("Refusing to bootstrap production database");
}

const pool = new Pool({ connectionString, max: 1 });

await pool.query(`
  CREATE SEQUENCE IF NOT EXISTS tenant_public_code_seq START WITH 1 INCREMENT BY 1;

  DO $$ BEGIN
    CREATE TYPE tenant_status AS ENUM ('active','suspended','cancelled');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin','member');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE platform_role AS ENUM ('super_admin','tenant_admin','tenant_seller','partner','member');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE TYPE user_function AS ENUM ('vendedor','representante_comercial','financeiro','suporte','entrega','administrador','outro');
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS tenants (
    id text PRIMARY KEY,
    tenant_code varchar(16) NOT NULL UNIQUE DEFAULT ('VAI-' || lpad(nextval('tenant_public_code_seq')::text, 6, '0')),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    status tenant_status NOT NULL DEFAULT 'active',
    vertical text,
    vertical_secundaria text,
    country_code varchar(2) NOT NULL DEFAULT 'BR',
    default_locale varchar(12) NOT NULL DEFAULT 'pt-BR',
    timezone varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    default_currency varchar(3) NOT NULL DEFAULT 'BRL',
    supported_currencies json NOT NULL DEFAULT '["BRL"]'::json,
    is_demo boolean NOT NULL DEFAULT false,
    provisioning_method text,
    first_login_at timestamp,
    logo_url varchar(500),
    white_label_completo boolean NOT NULL DEFAULT false,
    organizacao_id text,
    onboarding_concluido boolean NOT NULL DEFAULT false,
    integracoes_concluido boolean NOT NULL DEFAULT false,
    integracoes_step integer NOT NULL DEFAULT 0,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS tenant_user_functions (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    system_key text,
    permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
    kind text NOT NULL DEFAULT 'internal',
    linked_tenant_id text REFERENCES tenants(id) ON DELETE SET NULL,
    linked_tenant_code text,
    lead_access_scope text NOT NULL DEFAULT 'assigned',
    representative_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    password text NOT NULL,
    role user_role NOT NULL DEFAULT 'member',
    platform_role platform_role NOT NULL DEFAULT 'member',
    user_function user_function DEFAULT 'outro',
    custom_function_id text REFERENCES tenant_user_functions(id) ON DELETE SET NULL,
    permissions jsonb,
    telefone text,
    active boolean NOT NULL DEFAULT true,
    force_password_reset boolean NOT NULL DEFAULT false,
    last_assigned_at timestamp,
    lead_assignment_enabled boolean,
    lead_assignment_cities jsonb NOT NULL DEFAULT '[]'::jsonb,
    lead_assignment_regions jsonb NOT NULL DEFAULT '[]'::jsonb,
    lead_assignment_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
    lead_assignment_lat double precision,
    lead_assignment_lng double precision,
    lead_assignment_raio_km double precision,
    limite_entregas_por_turno numeric(6,0),
    changelog_lido_em timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );


  CREATE TABLE IF NOT EXISTS crm_companies_master (
    id text PRIMARY KEY,
    cnpj text NOT NULL,
    razao_social text,
    nome_fantasia text,
    situacao_cadastral text,
    natureza_juridica text,
    porte text,
    capital_social numeric(18,2),
    data_abertura text,
    cnae_principal text,
    cnaes_secundarios jsonb DEFAULT '[]'::jsonb,
    endereco jsonb,
    telefone text,
    email text,
    website text,
    social_profiles jsonb DEFAULT '{}'::jsonb,
    enrichment_data jsonb DEFAULT '{}'::jsonb,
    source text NOT NULL DEFAULT 'manual',
    enriched_at timestamp,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS crm_companies_master_cnpj_uidx ON crm_companies_master(cnpj);

  CREATE TABLE IF NOT EXISTS crm_people_master (
    id text PRIMARY KEY,
    nome text NOT NULL,
    documento text,
    data_nascimento text,
    telefones jsonb DEFAULT '[]'::jsonb,
    emails jsonb DEFAULT '[]'::jsonb,
    social_profiles jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    source text NOT NULL DEFAULT 'manual',
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS crm_company_people (
    id text PRIMARY KEY,
    company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
    person_id text NOT NULL REFERENCES crm_people_master(id) ON DELETE CASCADE,
    cargo text,
    qualificacao text,
    participacao numeric(7,4),
    is_legal_representative boolean NOT NULL DEFAULT false,
    source text NOT NULL DEFAULT 'manual',
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS crm_company_people_company_person_uidx ON crm_company_people(company_id, person_id);

  CREATE TABLE IF NOT EXISTS crm_tenant_companies (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_id text NOT NULL REFERENCES crm_companies_master(id) ON DELETE CASCADE,
    lead_id text,
    relationship_type text NOT NULL DEFAULT 'lead',
    status text NOT NULL DEFAULT 'ativo',
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS crm_tenant_companies_tenant_company_uidx ON crm_tenant_companies(tenant_id, company_id);
  CREATE INDEX IF NOT EXISTS crm_tenant_companies_tenant_lead_idx ON crm_tenant_companies(tenant_id, lead_id);

  DO $ BEGIN
    IF to_regclass('public.leads') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint WHERE conname = 'crm_tenant_companies_lead_fk'
       ) THEN
      ALTER TABLE crm_tenant_companies
        ADD CONSTRAINT crm_tenant_companies_lead_fk
        FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
    END IF;
  END $;

  CREATE TABLE IF NOT EXISTS crm_tenant_company_contacts (
    id text PRIMARY KEY,
    tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    tenant_company_id text NOT NULL REFERENCES crm_tenant_companies(id) ON DELETE CASCADE,
    person_id text NOT NULL REFERENCES crm_people_master(id) ON DELETE CASCADE,
    roles jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_primary boolean NOT NULL DEFAULT false,
    preferred_channel text,
    priority_by_purpose jsonb DEFAULT '{}'::jsonb,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS crm_tenant_company_contacts_tc_person_uidx ON crm_tenant_company_contacts(tenant_company_id, person_id);
  CREATE INDEX IF NOT EXISTS crm_tenant_company_contacts_tenant_idx ON crm_tenant_company_contacts(tenant_id);
  CREATE INDEX IF NOT EXISTS crm_tenant_company_contacts_company_idx ON crm_tenant_company_contacts(tenant_company_id);

  CREATE SCHEMA IF NOT EXISTS app_security;
`);

console.log("[homolog-bootstrap] auth/representation + crm company master schema ready");
await pool.end();
