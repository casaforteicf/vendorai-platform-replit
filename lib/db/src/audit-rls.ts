#!/usr/bin/env tsx
/**
 * audit-rls — Row Level Security audit for VendorAI Supabase schema.
 *
 * Usage:
 *   tsx src/audit-rls.ts           # informational report
 *   tsx src/audit-rls.ts --strict  # exits 1 if any of the 54 migration-032 tables lacks RLS or policy
 */

import pg from 'pg';

const { Pool } = pg;
const strict = process.argv.includes('--strict');

const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function q<T extends Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

// The 54 tables targeted by migration 032
const TARGET_TABLES = new Set([
  'activities', 'agendamentos', 'agent_actions_log', 'agent_configs', 'agent_tasks',
  'api_usage', 'arch_ai_renders', 'arch_project_configs', 'arch_specifications',
  'business_profiles', 'campaigns', 'composicoes', 'compras_obras', 'consents',
  'content_studio_uploads', 'conversations', 'customer_intelligence', 'deals',
  'estoque_central_obras', 'funis', 'insumos', 'invoices', 'knowledge_base',
  'lead_products', 'lead_proposals', 'leads', 'messages', 'movimentacoes_estoque_obras',
  'notification_logs', 'notifications', 'obra_lancamentos', 'obras',
  'poe_opportunities', 'poe_quotation_requests', 'produtos_catalogo', 'propostas',
  'rules', 'sdr_templates', 'subscriptions', 'tenant_domains', 'token_purchases',
  'users', 'varejo_colecoes', 'varejo_combos', 'varejo_fidelidade', 'varejo_fornecedores',
  'varejo_grades', 'varejo_pedidos_compra', 'varejo_produtos', 'vcn_companies',
  'vep_companies', 'whatsapp_connections', 'whatsapp_contacts', 'whatsapp_messages',
]);

// ── Queries ──────────────────────────────────────────────────────────────────

const tenantTables = await q<{ table_name: string }>(`
  SELECT table_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND column_name  = 'tenant_id'
  ORDER BY table_name
`);

const rlsStatus = await q<{ t: string; rls: boolean; force: boolean }>(`
  SELECT relname          AS t,
         relrowsecurity   AS rls,
         relforcerowsecurity AS force
  FROM   pg_class c
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public' AND c.relkind = 'r'
  ORDER  BY relname
`);

const policies = await q<{ tablename: string; policyname: string; cmd: string; roles: unknown }>(`
  SELECT tablename, policyname, cmd, roles
  FROM   pg_policies
  WHERE  schemaname = 'public'
  ORDER  BY tablename, policyname
`);

const appRole = await q<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean; rolcanlogin: boolean }>(`
  SELECT rolname, rolbypassrls, rolsuper, rolcanlogin
  FROM   pg_roles
  WHERE  rolname IN ('postgres', 'vendorai_app')
  ORDER  BY rolname
`);

const currentRole = await q<{ cur: string; ses: string }>(`SELECT current_user AS cur, session_user AS ses`);

await pool.end();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** pg returns name[] as string '{role1,role2}' — normalize to JS array */
function parseRoles(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw as string[];
  const s = String(raw ?? '');
  return s.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
}

// ── Analysis ─────────────────────────────────────────────────────────────────

const tenantSet = new Set(tenantTables.map(r => r.table_name));
const rlsMap    = new Map(rlsStatus.map(r => [r.t, r]));
const policySet = new Set(policies.map(p => p.tablename));

const withRls    = rlsStatus.filter(r => r.rls);
// All tenant tables missing RLS (informational — shows full schema state)
const missingRls = tenantTables.filter(r => !rlsMap.get(r.table_name)?.rls);
// Target tables missing RLS (for strict mode)
const targetMissingRls = [...TARGET_TABLES].filter(t => !rlsMap.get(t)?.rls).sort();
// Target tables with RLS but missing policy (for strict mode)
const targetRlsNoPol   = [...TARGET_TABLES].filter(t => rlsMap.get(t)?.rls && !policySet.has(t)).sort();
// All tenant tables with RLS but no policy (informational)
const rlsNoPol   = withRls.filter(r => tenantSet.has(r.t) && !policySet.has(r.t));

// ── Report ───────────────────────────────────────────────────────────────────

const W = 66;
const hr = '═'.repeat(W);

console.log(`\n${hr}`);
console.log('  AUDITORIA RLS — VendorAI (migration 032 — 54 tabelas)');
console.log(hr);

console.log('\n● ROLE ATUAL DO BANCO');
console.log(`  current_user : ${currentRole[0]?.cur}`);
console.log(`  session_user : ${currentRole[0]?.ses}`);

console.log('\n● STATUS DAS ROLES');
for (const r of appRole) {
  const flags = [
    r.rolsuper     ? 'SUPERUSER'   : 'NOSUPERUSER',
    r.rolbypassrls ? 'BYPASSRLS'   : 'NOBYPASSRLS',
    r.rolcanlogin  ? 'LOGIN'       : 'NOLOGIN',
  ].join('  ');
  const ok = r.rolname === 'vendorai_app' && !r.rolbypassrls ? '✓' : r.rolbypassrls ? '⚠' : '·';
  console.log(`  ${ok}  ${r.rolname.padEnd(16)} ${flags}`);
}
if (!appRole.some(r => r.rolname === 'vendorai_app')) {
  console.log('  ✗  vendorai_app       (role não existe)');
}

console.log('\n● COBERTURA migration-032 (54 tabelas alvo)');
const targetOk   = [...TARGET_TABLES].filter(t => rlsMap.get(t)?.rls && policySet.has(t)).length;
const targetBad  = TARGET_TABLES.size - targetOk;
console.log(`  Tabelas alvo (migration 032)      : ${TARGET_TABLES.size}`);
console.log(`  Com RLS + política                : ${targetOk}${targetOk === TARGET_TABLES.size ? '  ✓' : ''}`);
console.log(`  Sem RLS ou sem política           : ${targetBad}${targetBad ? '  ⚠' : '  ✓'}`);

console.log('\n● COBERTURA GERAL (todas as tabelas public)');
console.log(`  Tabelas com tenant_id             : ${tenantTables.length}`);
console.log(`  Tabelas públicas totais           : ${rlsStatus.length}`);
console.log(`  Com RLS ativo                     : ${withRls.length}`);
console.log(`  Com tenant_id SEM RLS (geral)     : ${missingRls.length}${missingRls.length ? '  ⚠' : '  ✓'}`);
console.log(`  Com RLS mas sem política (geral)  : ${rlsNoPol.length}${rlsNoPol.length ? '  ⚠' : '  ✓'}`);
console.log(`  Políticas definidas               : ${policies.length}`);

if (targetMissingRls.length) {
  console.log('\n● TABELAS ALVO SEM RLS (migration 032)');
  targetMissingRls.forEach(t => console.log(`    ✗  ${t}`));
}

if (targetRlsNoPol.length) {
  console.log('\n● TABELAS ALVO COM RLS MAS SEM POLÍTICA');
  targetRlsNoPol.forEach(t => console.log(`    ✗  ${t}`));
}

if (missingRls.filter(r => !TARGET_TABLES.has(r.table_name)).length) {
  console.log('\n● OUTRAS TABELAS COM tenant_id SEM RLS (fora do escopo de 032)');
  missingRls
    .filter(r => !TARGET_TABLES.has(r.table_name))
    .forEach(r => console.log(`    ⚠  ${r.table_name}`));
}

console.log('\n● TABELAS ALVO — STATUS RLS');
for (const t of [...TARGET_TABLES].sort()) {
  const rls = rlsMap.get(t);
  const hasPol = policySet.has(t);
  const status = !rls ? '✗ sem RLS'
    : !rls.rls         ? '✗ sem RLS'
    : !hasPol           ? '⚠ sem política'
    : '✓';
  console.log(`  ${t.padEnd(36)} ${status}`);
}

console.log('\n● POLÍTICAS RLS (tabelas alvo)');
const targetPolicies = policies.filter(p => TARGET_TABLES.has(p.tablename));
if (targetPolicies.length) {
  targetPolicies.forEach(p => {
    const roles = parseRoles(p.roles).join(',');
    console.log(`  ${p.tablename.padEnd(32)} ${p.policyname}  cmd=${p.cmd}  roles=[${roles}]`);
  });
} else {
  console.log('  (nenhuma política nas tabelas alvo)');
}

console.log(`\n${hr}\n`);

// ── Strict exit ───────────────────────────────────────────────────────────────

if (strict) {
  const errors: string[] = [];

  if (!appRole.some(r => r.rolname === 'vendorai_app')) {
    errors.push('Role vendorai_app não existe');
  } else {
    const va = appRole.find(r => r.rolname === 'vendorai_app')!;
    if (va.rolbypassrls) errors.push('vendorai_app tem BYPASSRLS (deve ser NOBYPASSRLS)');
  }

  targetMissingRls.forEach(t => errors.push(`Tabela alvo sem RLS: ${t}`));
  targetRlsNoPol.forEach(t => errors.push(`Tabela alvo com RLS mas sem política: ${t}`));

  if (errors.length) {
    console.error(`audit:rls:strict — ${errors.length} problema(s) encontrado(s):`);
    errors.forEach(e => console.error(`  ✗  ${e}`));
    process.exit(1);
  }
  console.log(`audit:rls:strict — OK: todas as ${TARGET_TABLES.size} tabelas alvo têm RLS + política ✓`);
}
