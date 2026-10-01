import { Pool } from "pg";

if (process.env.VENDORAI_HOMOLOGATION_SEED !== "1") {
  console.log("[homolog-seed] skipped");
  process.exit(0);
}

const connectionString =
  process.env.APP_DATABASE_URL ??
  process.env.SUPABASE_DATABASE_URL ??
  process.env.DATABASE_URL;

if (!connectionString) throw new Error("Homologation database URL missing");
if (/gfocphuiyyufwzcyihbk/i.test(connectionString)) {
  throw new Error("Refusing to seed production database");
}

const pool = new Pool({ connectionString, max: 1 });

const KRAFHT_ID = "homolog-krafht";
const WINDOOR_ID = "homolog-windoor";
const KRAFHT_ADMIN_ID = "homolog-krafht-admin";
const WINDOOR_USER_ID = "homolog-windoor-user";
const VENDORAI_ADMIN_ID = "homolog-vendorai-admin";

await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
await pool.query(`CREATE SCHEMA IF NOT EXISTS app_security`);

await pool.query(`
  CREATE OR REPLACE FUNCTION app_security.lookup_user_for_auth(input_email text)
  RETURNS TABLE (
    id text,
    tenant_id text,
    name text,
    email text,
    password text,
    role user_role,
    platform_role platform_role,
    active boolean,
    created_at timestamp,
    updated_at timestamp,
    user_function user_function,
    telefone text,
    force_password_reset boolean,
    last_assigned_at timestamp,
    limite_entregas_por_turno numeric,
    changelog_lido_em timestamp,
    permissions jsonb,
    custom_function_id text,
    lead_assignment_enabled boolean,
    lead_assignment_cities jsonb,
    lead_assignment_regions jsonb,
    lead_assignment_segments jsonb,
    lead_assignment_lat double precision,
    lead_assignment_lng double precision,
    lead_assignment_raio_km double precision
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT
      u.id, u.tenant_id, u.name, u.email, u.password, u.role, u.platform_role,
      u.active, u.created_at, u.updated_at, u.user_function, u.telefone,
      u.force_password_reset, u.last_assigned_at, u.limite_entregas_por_turno,
      u.changelog_lido_em, u.permissions, u.custom_function_id,
      u.lead_assignment_enabled, u.lead_assignment_cities,
      u.lead_assignment_regions, u.lead_assignment_segments,
      u.lead_assignment_lat, u.lead_assignment_lng, u.lead_assignment_raio_km
    FROM public.users u
    WHERE lower(u.email) = lower(input_email)
    LIMIT 1
  $$;
`);

await pool.query(`
  INSERT INTO tenants (
    id, tenant_code, name, slug, status, vertical,
    country_code, default_locale, timezone, default_currency,
    supported_currencies, is_demo, onboarding_concluido,
    integracoes_concluido, integracoes_step, created_at, updated_at
  ) VALUES
    ($1, 'VAI-H00035', 'Krafht esquadrias de PVC', 'krafht-homolog', 'active',
     'Esquadrias', 'BR', 'pt-BR', 'America/Sao_Paulo', 'BRL',
     '["BRL"]'::json, false, true, true, 0, now(), now()),
    ($2, 'VAI-H00007', 'Windoor Representações', 'windoor-homolog', 'active',
     'Representação Comercial', 'BR', 'pt-BR', 'America/Sao_Paulo', 'BRL',
     '["BRL"]'::json, false, true, true, 0, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, status = 'active', updated_at = now()
`, [KRAFHT_ID, WINDOOR_ID]);

await pool.query(`
  INSERT INTO users (
    id, tenant_id, name, email, password, role, platform_role, user_function,
    permissions, active, force_password_reset, lead_assignment_enabled,
    lead_assignment_cities, lead_assignment_regions, lead_assignment_segments,
    created_at, updated_at
  ) VALUES
    ($1, $2, 'Administrador Krafht — Homologação',
     'homolog.krafht@appvendorai.com', crypt('Homolog@2026!', gen_salt('bf', 12)),
     'admin', 'tenant_admin', 'administrador',
     '["dashboard","leads","deals","conversations","agenda","proposals","catalog","team","settings"]'::jsonb,
     true, false, true, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now()),
    ($3, $4, 'Representante Windoor — Homologação',
     'homolog.windoor@appvendorai.com', crypt('Homolog@2026!', gen_salt('bf', 12)),
     'member', 'tenant_seller', 'representante_comercial',
     '["dashboard","leads","deals","agenda","proposals"]'::jsonb,
     true, false, true, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now())
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password = EXCLUDED.password,
    active = true,
    updated_at = now()
`, [KRAFHT_ADMIN_ID, KRAFHT_ID, WINDOOR_USER_ID, WINDOOR_ID]);

await pool.query(`
  INSERT INTO users (
    id, tenant_id, name, email, password, role, platform_role, user_function,
    permissions, active, force_password_reset, lead_assignment_enabled,
    lead_assignment_cities, lead_assignment_regions, lead_assignment_segments,
    created_at, updated_at
  ) VALUES (
    $1, $2, 'Administrador Vendor.ai — Homologação',
    'homolog.admin@appvendorai.com', crypt('Homolog@2026!', gen_salt('bf', 12)),
    'admin', 'super_admin', 'administrador',
    '["dashboard","leads","deals","conversations","agenda","proposals","catalog","team","settings"]'::jsonb,
    true, false, true, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, now(), now()
  )
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    password = EXCLUDED.password,
    role = EXCLUDED.role,
    platform_role = EXCLUDED.platform_role,
    user_function = EXCLUDED.user_function,
    active = true,
    updated_at = now()
`, [VENDORAI_ADMIN_ID, KRAFHT_ID]);

console.log("[homolog-seed] Krafht/Windoor + Vendor.ai admin fixtures ready");
await pool.end();
