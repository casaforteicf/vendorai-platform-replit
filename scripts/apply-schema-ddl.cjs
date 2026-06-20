const pg = require('pg');

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) {
  console.error("No SUPABASE_DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const ddl = `
-- Novas colunas na tabela tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_seeded BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS openai_key_configured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS openai_key_status TEXT DEFAULT 'nao_configurada',
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

-- Tabela plan_assignment_log
CREATE TABLE IF NOT EXISTS plan_assignment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela deal_closing_status
CREATE TABLE IF NOT EXISTS deal_closing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id TEXT NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  etapa_atual TEXT NOT NULL,
  contrato_zapsign_id TEXT,
  contrato_status TEXT,
  cobranca_asaas_id TEXT,
  cobranca_status TEXT,
  ultimo_erro TEXT,
  tentativas INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela tenant_alerts
CREATE TABLE IF NOT EXISTS tenant_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  urgente BOOLEAN NOT NULL DEFAULT false,
  lido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query(ddl);
    console.log("Schema applied successfully");
  } catch (e) {
    console.error("Error:", e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
