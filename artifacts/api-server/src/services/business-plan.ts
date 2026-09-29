import { pool } from "@workspace/db";
import { approvedContext, emptyPlan, readPlan, reviseSection, type PlanRecord, type PlanSectionId } from "./business-plan-model.js";

export async function loadBusinessPlan(tenantId: string) {
  const result = await pool.query("SELECT discovery_data->'businessPlan' AS plan FROM business_profiles WHERE tenant_id=$1 LIMIT 1", [tenantId]);
  return readPlan(result.rows[0]?.plan);
}
export async function loadApprovedBusinessContext(tenantId: string, role: string) {
  return approvedContext(await loadBusinessPlan(tenantId), role);
}
export async function loadBusinessPlanSources(tenantId: string) {
  const [profile, products, assets] = await Promise.all([
    pool.query("SELECT nome_fantasia, razao_social, vertical, diferenciais, publico_alvo, canais_venda, metodo_vendas FROM business_profiles WHERE tenant_id=$1 LIMIT 1", [tenantId]),
    pool.query("SELECT id, nome, descricao FROM produtos_catalogo WHERE tenant_id=$1 AND ativo=true ORDER BY nome LIMIT 500", [tenantId]),
    pool.query("SELECT id, original_filename AS title, storage_url, metadata, type FROM media_assets WHERE tenant_id=$1 AND type='image' ORDER BY created_at DESC LIMIT 200", [tenantId]),
  ]);
  return { profile: profile.rows[0] ?? null, products: products.rows, assets: assets.rows.map(r => ({ id: String(r.id), url: String(r.storage_url), title: String(r.metadata?.title || r.title || "Imagem da biblioteca") })) };
}
export async function validateBusinessReferences(tenantId: string, records: PlanRecord[]) {
  const products = [...new Set(records.flatMap(r => r.productIds))];
  const assets = [...new Set(records.flatMap(r => r.assetIds))];
  const [p, a] = await Promise.all([
    pool.query("SELECT id FROM produtos_catalogo WHERE tenant_id=$1 AND ativo=true AND id=ANY($2::text[])", [tenantId, products]),
    pool.query("SELECT id FROM media_assets WHERE tenant_id=$1 AND type='image' AND id=ANY($2::text[])", [tenantId, assets]),
  ]);
  if (p.rowCount !== products.length || a.rowCount !== assets.length) throw Object.assign(new Error("Produto ou imagem indisponível nesta empresa. Revise os vínculos."), { status: 422 });
}
export async function saveBusinessPlanSection(input: { tenantId: string; section: PlanSectionId; records: PlanRecord[]; action: "save" | "approve" | "revoke"; version: number; by: string }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO business_profiles (id, tenant_id, razao_social) SELECT gen_random_uuid()::text, id, COALESCE(nome_empresa,name,'Empresa') FROM tenants WHERE id=$1 ON CONFLICT (tenant_id) DO NOTHING", [input.tenantId]);
    const result = await client.query("SELECT discovery_data->'businessPlan' AS plan FROM business_profiles WHERE tenant_id=$1 FOR UPDATE", [input.tenantId]);
    if (!result.rowCount) throw Object.assign(new Error("Empresa não encontrada"), { status: 404 });
    const current = readPlan(result.rows[0]?.plan ?? emptyPlan());
    if (current.version !== input.version) throw Object.assign(new Error("O plano foi atualizado em outra tela. Recarregue antes de salvar; suas alterações continuam no editor."), { status: 409 });
    const next = reviseSection(current, input.section, input.records, input.action, input.by, new Date().toISOString());
    await client.query("UPDATE business_profiles SET discovery_data=jsonb_set(COALESCE(discovery_data,'{}'::jsonb),'{businessPlan}',$2::jsonb), updated_at=now() WHERE tenant_id=$1", [input.tenantId, JSON.stringify(next)]);
    await client.query("COMMIT");
    return next;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
