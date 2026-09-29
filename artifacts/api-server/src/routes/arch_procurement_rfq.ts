import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { sendJarvisEmail } from "../services/jarvis-email-provider.js";

export const archProcurementRfqRouter: IRouter = Router();
export const archProcurementRfqPublicRouter: IRouter = Router();

function tenantId(req: any): string | null {
  return req?.user?.tenantId ?? req?.tenantId ?? null;
}
function requireTenant(req: any, res: any): string | null {
  const tid = tenantId(req);
  if (!tid) {
    res.status(403).json({ error: "Tenant ativo é obrigatório." });
    return null;
  }
  return tid;
}
function n(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c] ?? c));
}
function scopeHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function codeFor(category: string) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `RFQ-${category.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 12)}-${date}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
}
function normalizeText(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function inferScope(item: any) {
  const explicit = normalizeText(item.spec_category);
  if (explicit) return { category: explicit, discipline: explicit };
  const text = normalizeText([item.item, item.description, item.product_name, item.material_name, item.type].filter(Boolean).join(" "));
  const rules: Array<[string, string, RegExp]> = [
    ["esquadrias", "esquadrias", /(janela|porta|esquadria|vidro|aluminio|pvc|fachada glazing)/],
    ["revestimentos", "revestimentos", /(porcelanato|ceramica|revestimento|piso|rodape|azulejo)/],
    ["marmoraria", "marmoraria", /(marmore|granito|quartzo|pedra|bancada|soleira)/],
    ["marcenaria", "marcenaria", /(marcenaria|mdf|armario|painel|cozinha planejada|movel planejado)/],
    ["mobiliario", "mobiliario", /(sofa|poltrona|cadeira|mesa|cama|mobiliario|estofado)/],
    ["iluminacao", "iluminacao", /(luminaria|led|spot|perfil led|pendente|plafon)/],
    ["eletrica", "eletrica", /(eletric|tomada|interruptor|quadro|disjuntor|cabo)/],
    ["hidraulica", "hidraulica", /(hidraul|torneira|chuveiro|vaso|cuba|registro|tubul)/],
    ["gesso", "gesso", /(gesso|drywall|forro|sanca|cortineiro)/],
    ["pintura", "pintura", /(tinta|pintura|massa corrida|selador)/],
    ["estrutura", "estrutura", /(icf|concreto|aco|estrutura|forma|fundacao)/],
  ];
  for (const [category, discipline, rx] of rules) if (rx.test(text)) return { category, discipline };
  return { category: String(item.type || "geral"), discipline: String(item.type || "geral") };
}
async function ownedObra(tid: string, obraId: string) {
  const result = await pool.query(`SELECT * FROM obras WHERE id=$1 AND tenant_id=$2 LIMIT 1`, [obraId, tid]);
  return result.rows[0] ?? null;
}
async function packageBundle(tid: string, obraId: string) {
  const [packages, items, invitations, quoteItems, suppliers] = await Promise.all([
    pool.query(`SELECT * FROM arch_rfq_packages WHERE tenant_id=$1 AND obra_id=$2 ORDER BY created_at DESC`, [tid, obraId]),
    pool.query(`SELECT pi.*, c.descricao, c.ambiente, c.disciplina, c.categoria, c.quantidade, c.unidade,
                       c.valor_total, c.valor_venda_snapshot, c.custo_estimado_snapshot, c.custo_confirmado,
                       c.cotacao_desatualizada, c.escopo_versao
                  FROM arch_rfq_package_items pi
                  JOIN compras_obras c ON c.id=pi.compra_id
                  JOIN arch_rfq_packages p ON p.id=pi.package_id
                 WHERE p.tenant_id=$1 AND p.obra_id=$2
                 ORDER BY pi.sort_order, pi.created_at`, [tid, obraId]),
    pool.query(`SELECT i.* FROM arch_rfq_invitations i JOIN arch_rfq_packages p ON p.id=i.package_id
                 WHERE i.tenant_id=$1 AND p.obra_id=$2 ORDER BY i.created_at DESC`, [tid, obraId]),
    pool.query(`SELECT qi.* FROM arch_rfq_quote_items qi
                 JOIN arch_rfq_invitations i ON i.id=qi.invitation_id
                 JOIN arch_rfq_packages p ON p.id=i.package_id
                 WHERE i.tenant_id=$1 AND p.obra_id=$2`, [tid, obraId]),
    pool.query(`SELECT id,nome,contato,telefone,email,categorias,disciplinas,regioes,marcas,prazo_medio_dias
                   FROM fornecedores WHERE tenant_id=$1 AND ativo=true ORDER BY nome`, [tid]),
  ]);
  return { packages: packages.rows, items: items.rows, invitations: invitations.rows, quoteItems: quoteItems.rows, suppliers: suppliers.rows };
}

archProcurementRfqRouter.get("/arch/procurement-rfq/:obraId", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const obraId = String(req.params["obraId"] || "");
    const obra = await ownedObra(tid, obraId);
    if (!obra) return res.status(404).json({ error: "Obra não encontrada." });
    res.json({ obra, ...(await packageBundle(tid, obraId)) });
  } catch (err) { logger.error({ err }, "rfq bundle error"); next(err); }
});

archProcurementRfqRouter.patch("/arch/procurement-rfq/suppliers/:supplierId/scope", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const supplierId = String(req.params["supplierId"] || "");
    const categories = Array.isArray(req.body?.categories) ? [...new Set(req.body.categories.map((x: unknown) => normalizeText(x)).filter(Boolean))] : [];
    const disciplines = Array.isArray(req.body?.disciplines) ? [...new Set(req.body.disciplines.map((x: unknown) => normalizeText(x)).filter(Boolean))] : [];
    const regions = Array.isArray(req.body?.regions) ? [...new Set(req.body.regions.map((x: unknown) => String(x).trim()).filter(Boolean))] : [];
    const brands = Array.isArray(req.body?.brands) ? [...new Set(req.body.brands.map((x: unknown) => String(x).trim()).filter(Boolean))] : [];
    const leadTime = req.body?.leadTimeDays == null || req.body?.leadTimeDays === "" ? null : Math.max(0, Math.round(n(req.body.leadTimeDays)));
    const result = await pool.query(
      `UPDATE fornecedores
          SET categorias=$1::jsonb, disciplinas=$2::jsonb, regioes=$3::jsonb, marcas=$4::jsonb,
              prazo_medio_dias=$5, updated_at=now()
        WHERE id=$6 AND tenant_id=$7
        RETURNING id,nome,contato,telefone,email,categorias,disciplinas,regioes,marcas,prazo_medio_dias,ativo`,
      [JSON.stringify(categories), JSON.stringify(disciplines), JSON.stringify(regions), JSON.stringify(brands), leadTime, supplierId, tid],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Fornecedor não encontrado." });
    res.json({ supplier: result.rows[0] });
  } catch (err) { logger.error({ err }, "supplier scope update error"); next(err); }
});

archProcurementRfqRouter.post("/arch/procurement-rfq/:obraId/from-budget", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const obraId = String(req.params["obraId"] || "");
    const budgetId = String(req.body?.budgetId || "");
    if (!budgetId) return res.status(400).json({ error: "budgetId é obrigatório." });
    if (!await ownedObra(tid, obraId)) return res.status(404).json({ error: "Obra não encontrada." });

    const budgetResult = await client.query(`SELECT * FROM arch_budgets WHERE id=$1::uuid AND tenant_id::text=$2 AND deleted_at IS NULL LIMIT 1`, [budgetId, tid]);
    const budget = budgetResult.rows[0];
    if (!budget) return res.status(404).json({ error: "Orçamento não encontrado." });

    const selectedIds = Array.isArray(req.body?.budgetItemIds) ? req.body.budgetItemIds.map(String) : [];
    const params: any[] = [budgetId, tid];
    let filter = "";
    if (selectedIds.length) { params.push(selectedIds); filter = ` AND id = ANY($3::uuid[])`; }
    const itemResult = await client.query(
      `SELECT abi.*, aso.category AS spec_category, aso.region AS spec_region, aa.nome AS ambiente_nome\n       FROM arch_budget_items abi\n       LEFT JOIN arch_spec_objects aso ON aso.id=abi.spec_object_id\n       LEFT JOIN arch_ambientes aa ON aa.id::text=abi.ambiente_id::text\n      WHERE abi.budget_id=$1::uuid AND abi.tenant_id::text=$2 AND abi.deleted_at IS NULL ${filter.replace(" id ", " abi.id ")}\n      ORDER BY abi.sort_order,abi.created_at`,
      params,
    );
    if (!itemResult.rows.length) return res.status(422).json({ error: "O orçamento não possui itens para cotação." });

    const groups = new Map<string, { category: string; discipline: string; rows: any[] }>();
    for (const row of itemResult.rows) {
      const scope = inferScope(row);
      const key = `${scope.category}::${scope.discipline}`;
      const group = groups.get(key) ?? { ...scope, rows: [] };
      group.rows.push(row); groups.set(key, group);
    }

    await client.query("BEGIN");
    const created: any[] = [];
    for (const group of groups.values()) {
      const snapshotItems: any[] = [];
      const requestIds: string[] = [];
      let saleValue = 0;
      for (const row of group.rows) {
        const requestId = crypto.randomUUID();
        const total = n(row.total);
        saleValue += total;
        const snapshot = {
          budgetItemId: row.id, specObjectId: row.spec_object_id, item: row.item, description: row.description,
          ambienteId: row.ambiente_id, ambiente: row.ambiente_nome || null, region: row.spec_region || null, quantity: n(row.quantity, 1), unit: row.unit || "un",
          productName: row.product_name, materialName: row.material_name, manufacturerName: row.manufacturer_name,
          total, category: group.category, discipline: group.discipline,
        };
        const hash = scopeHash(snapshot);
        const existing = await client.query(
          `SELECT id,escopo_hash FROM compras_obras WHERE tenant_id=$1 AND obra_id=$2 AND budget_item_id=$3::uuid ORDER BY created_at DESC LIMIT 1`,
          [tid, obraId, row.id],
        );
        let finalRequestId = existing.rows[0]?.id;
        if (finalRequestId) {
          const changed = existing.rows[0].escopo_hash && existing.rows[0].escopo_hash !== hash;
          await client.query(
            `UPDATE compras_obras SET descricao=$1,ambiente=$2,disciplina=$3,categoria=$4,quantidade=$5,unidade=$6,
               valor_total=$7,valor_venda_snapshot=$7,custo_estimado_snapshot=$8,escopo_snapshot=$9::jsonb,
               escopo_hash=$10,cotacao_desatualizada=CASE WHEN $11 THEN true ELSE cotacao_desatualizada END,
               escopo_versao=CASE WHEN $11 THEN escopo_versao+1 ELSE escopo_versao END,updated_at=now()
             WHERE id=$12 AND tenant_id=$13`,
            [row.item, row.ambiente_nome || (row.ambiente_id ? String(row.ambiente_id) : null), group.discipline, group.category,
             String(n(row.quantity,1)), row.unit || "un", String(total), String(total), JSON.stringify(snapshot), hash, Boolean(changed), finalRequestId, tid],
          );
        } else {
          finalRequestId = requestId;
          await client.query(
            `INSERT INTO compras_obras
             (id,tenant_id,obra_id,codigo,descricao,ambiente,disciplina,categoria,quantidade,unidade,valor_unitario,valor_total,
              prioridade,status,origem,documentos,budget_id,budget_item_id,spec_object_id,escopo_versao,escopo_hash,escopo_snapshot,
              valor_venda_snapshot,custo_estimado_snapshot,created_at,updated_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'media','pendente','budget_rfq','[]'::jsonb,
                    $13::uuid,$14::uuid,$15::uuid,1,$16,$17::jsonb,$18,$19,now(),now())`,
            [finalRequestId,tid,obraId,`BUD-${String(row.id).slice(0,8).toUpperCase()}`,row.item,row.ambiente_nome||(row.ambiente_id?String(row.ambiente_id):null),
             group.discipline,group.category,String(n(row.quantity,1)),row.unit||"un",String(n(row.unit_total)),String(total),
             budgetId,row.id,row.spec_object_id||null,hash,JSON.stringify(snapshot),String(total),String(total)],
          );
        }
        requestIds.push(finalRequestId);
        snapshotItems.push({ ...snapshot, requestId: finalRequestId, scopeHash: hash });
      }
      const versionResult = await client.query(
        `SELECT COALESCE(MAX(version),0)::int AS latest
           FROM arch_rfq_packages
          WHERE tenant_id=$1 AND obra_id=$2 AND budget_id=$3::uuid
            AND COALESCE(category,'')=COALESCE($4,'') AND COALESCE(discipline,'')=COALESCE($5,'')`,
        [tid, obraId, budgetId, group.category, group.discipline],
      );
      const packageVersion = n(versionResult.rows[0]?.latest) + 1;
      const packageSnapshot = { budgetId, budgetVersion: budget.version, category: group.category, discipline: group.discipline, version: packageVersion, items: snapshotItems };
      const packageHash = scopeHash(packageSnapshot);
      const pkg = await client.query(
        `INSERT INTO arch_rfq_packages
         (tenant_id,obra_id,project_id,budget_id,code,title,category,discipline,version,status,scope_hash,scope_snapshot,documents,created_by,created_at,updated_at)
         VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'draft',$10,$11::jsonb,'[]'::jsonb,$12,now(),now()) RETURNING *`,
        [tid,obraId,budget.project_id,budgetId,codeFor(group.category),`Cotação — ${group.category}`,group.category,group.discipline,packageVersion,packageHash,JSON.stringify(packageSnapshot),req.user?.sub??null],
      );
      for (let i=0;i<requestIds.length;i++) {
        await client.query(`INSERT INTO arch_rfq_package_items(package_id,compra_id,sort_order) VALUES($1::uuid,$2,$3) ON CONFLICT DO NOTHING`, [pkg.rows[0].id,requestIds[i],i]);
      }
      created.push({ ...pkg.rows[0], itemCount: requestIds.length, saleValue });
    }
    await client.query("COMMIT");
    res.status(201).json({ packages: created });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "rfq from budget error"); next(err);
  } finally { client.release(); }
});

archProcurementRfqRouter.post("/arch/procurement-rfq/:obraId/packages/:packageId/invitations", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const obraId = String(req.params["obraId"] || "");
    const packageId = String(req.params["packageId"] || "");
    const pkgResult = await pool.query(`SELECT * FROM arch_rfq_packages WHERE id=$1::uuid AND obra_id=$2 AND tenant_id=$3 LIMIT 1`, [packageId,obraId,tid]);
    const pkg = pkgResult.rows[0];
    if (!pkg) return res.status(404).json({ error: "Pacote de cotação não encontrado." });
    const supplierIds = Array.isArray(req.body?.supplierIds) ? req.body.supplierIds.map(String) : [];
    if (!supplierIds.length) return res.status(400).json({ error: "Selecione ao menos um fornecedor." });
    const suppliers = await pool.query(
      `SELECT * FROM fornecedores WHERE tenant_id=$1 AND ativo=true AND id=ANY($2::text[])`, [tid,supplierIds],
    );
    const created: any[] = [];
    for (const supplier of suppliers.rows) {
      const categories = Array.isArray(supplier.categorias) ? supplier.categorias.map(normalizeText) : [];
      const disciplines = Array.isArray(supplier.disciplinas) ? supplier.disciplinas.map(normalizeText) : [];
      const compatible = (!categories.length && !disciplines.length) || categories.includes(normalizeText(pkg.category)) || disciplines.includes(normalizeText(pkg.discipline));
      if (!compatible) continue;
      const channel = supplier.email ? "email" : supplier.telefone ? "whatsapp" : "link";
      const destination = supplier.email || supplier.telefone || null;
      const inviteResult = await pool.query(
        `INSERT INTO arch_rfq_invitations
         (tenant_id,package_id,supplier_id,supplier_name,contact_name,channel,destination,status,created_at,updated_at)
         VALUES($1,$2::uuid,$3,$4,$5,$6,$7,'draft',now(),now()) RETURNING *`,
        [tid,packageId,supplier.id,supplier.nome,supplier.contato||null,channel,destination],
      );
      const invite = inviteResult.rows[0];
      const publicUrl = `${req.protocol}://${req.get("host")}/api/public/arqdor/rfq/${invite.public_token}`;
      const message = [
        `Solicitação de cotação: ${pkg.title}`,
        `Código: ${pkg.code} • versão ${pkg.version}`,
        "O link abaixo contém somente os itens do seu escopo, com quantidades e informações técnicas.",
        publicUrl,
      ].join("\n\n");
      try {
        if (channel === "email" && destination) {
          await sendJarvisEmail({ to: destination, subject: `Cotação ${pkg.code} — ${pkg.title}`, body: message });
        } else if (channel === "whatsapp" && destination) {
          await sendDirectWhatsAppMessage(tid, destination, message, logger);
        }
        await pool.query(`UPDATE arch_rfq_invitations SET status='sent',sent_at=now(),updated_at=now() WHERE id=$1::uuid`, [invite.id]);
        created.push({ ...invite, status: "sent", publicUrl });
      } catch (sendErr) {
        await pool.query(`UPDATE arch_rfq_invitations SET status='failed',updated_at=now() WHERE id=$1::uuid`, [invite.id]);
        created.push({ ...invite, status: "failed", publicUrl, error: sendErr instanceof Error ? sendErr.message : "Falha no envio" });
      }
    }
    await pool.query(`UPDATE arch_rfq_packages SET status='sent',updated_at=now() WHERE id=$1::uuid`, [packageId]);
    res.status(201).json({ invitations: created, skipped: supplierIds.length - created.length });
  } catch (err) { logger.error({ err }, "rfq invitations error"); next(err); }
});

archProcurementRfqRouter.post("/arch/procurement-rfq/:obraId/packages/:packageId/select/:invitationId", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const { obraId, packageId, invitationId } = req.params as Record<string,string>;
    const invResult = await client.query(
      `SELECT i.*,p.project_id,p.budget_id,p.category,p.discipline FROM arch_rfq_invitations i
       JOIN arch_rfq_packages p ON p.id=i.package_id
       WHERE i.id=$1::uuid AND p.id=$2::uuid AND p.obra_id=$3 AND i.tenant_id=$4 LIMIT 1`,
      [invitationId,packageId,obraId,tid],
    );
    const inv = invResult.rows[0];
    if (!inv || inv.status !== "responded") return res.status(409).json({ error: "A cotação precisa estar respondida antes da seleção." });
    const items = await client.query(`SELECT * FROM arch_rfq_quote_items WHERE invitation_id=$1::uuid`, [invitationId]);
    const lineTotal = items.rows.reduce((sum: number, qi: any) => sum + n(qi.total_value), 0);
    const netExtras = n(inv.freight_value) + n(inv.tax_value) - n(inv.discount_value);
    await client.query("BEGIN");
    for (const qi of items.rows) {
      const request = await client.query(`SELECT * FROM compras_obras WHERE id=$1 AND obra_id=$2 AND tenant_id=$3 LIMIT 1`, [qi.compra_id,obraId,tid]);
      const row = request.rows[0]; if (!row) continue;
      const weight = lineTotal > 0 ? n(qi.total_value) / lineTotal : 1 / Math.max(items.rows.length, 1);
      const allocatedExtras = netExtras * weight;
      const confirmedCost = Math.max(0, n(qi.total_value) + allocatedExtras);
      const order = await client.query(
        `INSERT INTO arch_supplier_orders
         (id,tenant_id,project_id,obra_id,compra_id,supplier_name,item,quantity,unit,estimated_value,confirmed_value,
          freight_value,discount_value,tax_value,payment_terms,quote_valid_until,lead_time_days,status,requested_at,quoted_at,notes,documents,created_at,updated_at)
         VALUES(gen_random_uuid(),$1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,0,0,0,$11,$12,$13,'approved',now(),now(),$14,'[]'::jsonb,now(),now()) RETURNING id`,
        [tid,inv.project_id,obraId,qi.compra_id,inv.supplier_name,row.descricao,String(qi.quantity),qi.unit,String(row.custo_estimado_snapshot||row.valor_total||0),
         String(confirmedCost),inv.payment_terms||null,inv.validity_date||null,inv.lead_time_days||null,
         [qi.notes, allocatedExtras ? `Rateio de frete/impostos/desconto do pacote: ${allocatedExtras.toFixed(2)}` : ""].filter(Boolean).join(" • ") || null],
      );
      await client.query(
        `UPDATE compras_obras SET fornecedor=$1,cotacao_selecionada_id=$2::uuid,custo_confirmado=$3,status='aprovado',cotacao_desatualizada=false,updated_at=now()
         WHERE id=$4 AND obra_id=$5 AND tenant_id=$6`,
        [inv.supplier_name,order.rows[0].id,String(confirmedCost),qi.compra_id,obraId,tid],
      );
    }
    await client.query(`UPDATE arch_rfq_invitations SET status='accepted',updated_at=now() WHERE id=$1::uuid`, [invitationId]);
    await client.query(`UPDATE arch_rfq_invitations SET status='rejected',updated_at=now() WHERE package_id=$1::uuid AND id<>$2::uuid AND status='responded'`, [packageId,invitationId]);
    await client.query(`UPDATE arch_rfq_packages SET status='completed',updated_at=now() WHERE id=$1::uuid`, [packageId]);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "rfq selection error"); next(err);
  } finally { client.release(); }
});

archProcurementRfqPublicRouter.get("/public/arqdor/rfq/:token", async (req, res, next) => {
  try {
    const token = String(req.params["token"] || "");
    const bundleResult = await pool.query(`SELECT public.arch_rfq_public_bundle($1::uuid) AS bundle`, [token]);
    const bundle = bundleResult.rows[0]?.bundle;
    if (!bundle) return res.status(404).send("Cotação não encontrada.");
    const inv = bundle.invitation;
    const pkg = bundle.package;
    const obra = bundle.obra;
    const items = Array.isArray(bundle.items) ? bundle.items : [];
    await pool.query(`SELECT public.arch_rfq_public_mark_viewed($1::uuid)`, [token]);

    const itemRows = items.map((item:any)=>`<tr>
      <td><strong>${esc(item.descricao)}</strong><br><small>${esc(item.ambiente || "")}</small></td>
      <td>${esc(item.quantidade)} ${esc(item.unidade)}</td>
      <td><input data-id="${esc(item.id)}" data-field="unitValue" type="number" step="0.01" min="0" required></td>
      <td><input data-id="${esc(item.id)}" data-field="brandModel" placeholder="marca/modelo"></td>
      <td><input data-id="${esc(item.id)}" data-field="notes" placeholder="observações"></td>
    </tr>`).join("");
    const itemMeta = JSON.stringify(items.map((x:any)=>({id:String(x.id),quantity:n(x.quantidade),unit:x.unidade||"un"})));

    res.type("html").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(pkg.code)} — Cotação</title><style>
    body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;color:#111827;margin:0}.wrap{max-width:1100px;margin:36px auto;padding:0 18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:24px;margin-bottom:18px}h1{margin:4px 0 8px;font-size:28px}small,.muted{color:#6b7280}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee;vertical-align:top}input,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px}label{display:block;font-size:12px;font-weight:700;margin:12px 0 6px}button{background:#111827;color:#fff;border:0;border-radius:12px;padding:13px 18px;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media(max-width:760px){.grid{grid-template-columns:1fr}table{font-size:12px}.wrap{margin:14px auto}}
    </style></head><body><div class="wrap"><div class="card"><div class="muted">ARQDOR • Solicitação de cotação</div><h1>${esc(pkg.title)}</h1>
    <p>${esc(obra?.nome || "Obra")} • ${esc(pkg.code)} • versão ${esc(pkg.version)}</p><p class="muted">Esta página contém somente os itens direcionados ao seu escopo: ${esc(pkg.category || pkg.discipline)}.</p></div>
    <div class="card"><table><thead><tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Marca/modelo</th><th>Observação</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    <div class="card"><div class="grid"><div><label>Frete</label><input id="freight" type="number" step="0.01" min="0" value="0"></div><div><label>Impostos/taxas</label><input id="taxes" type="number" step="0.01" min="0" value="0"></div>
    <div><label>Desconto</label><input id="discount" type="number" step="0.01" min="0" value="0"></div><div><label>Prazo de entrega (dias)</label><input id="leadTime" type="number" min="0"></div>
    <div><label>Validade</label><input id="validity" type="date"></div><div><label>Condição de pagamento</label><input id="payment" placeholder="Ex.: 30/60/90"></div></div>
    <label>Observações gerais</label><textarea id="supplierNotes" rows="4"></textarea><p id="msg" class="muted"></p><button id="send">Enviar cotação</button></div></div>
    <script>
    const META=${itemMeta};
    document.getElementById('send').onclick=async()=>{const rows=[...document.querySelectorAll('[data-id][data-field="unitValue"]')].map(el=>{const id=el.dataset.id;const q=META.find(x=>x.id===id);return{compraId:id,quantity:q?.quantity||0,unit:q?.unit||'un',unitValue:Number(el.value||0),brandModel:document.querySelector('[data-id="'+id+'"][data-field="brandModel"]').value,notes:document.querySelector('[data-id="'+id+'"][data-field="notes"]').value}});const body={items:rows,freight:Number(document.getElementById('freight').value||0),taxes:Number(document.getElementById('taxes').value||0),discount:Number(document.getElementById('discount').value||0),leadTimeDays:Number(document.getElementById('leadTime').value||0)||null,validityDate:document.getElementById('validity').value||null,paymentTerms:document.getElementById('payment').value||null,supplierNotes:document.getElementById('supplierNotes').value||null};const r=await fetch(location.pathname+'/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));document.getElementById('msg').textContent=r.ok?'Cotação enviada com sucesso.':(d.error||'Não foi possível enviar.');if(r.ok)document.getElementById('send').disabled=true}
    </script></body></html>`);
  } catch (err) { logger.error({ err }, "public rfq page error"); next(err); }
});

archProcurementRfqPublicRouter.post("/public/arqdor/rfq/:token/respond", async (req, res, next) => {
  try {
    const token = String(req.params["token"] || "");
    const result = await pool.query(`SELECT public.arch_rfq_public_submit($1::uuid,$2::jsonb) AS result`, [token, JSON.stringify(req.body ?? {})]);
    res.json(result.rows[0]?.result ?? { ok: true });
  } catch (err) {
    logger.error({ err }, "public rfq response error");
    const message = err instanceof Error ? err.message : "Não foi possível registrar a cotação.";
    if (/Cotação não encontrada|Cotação encerrada|Informe os itens|Item fora do escopo/i.test(message)) {
      return res.status(400).json({ error: message.replace(/^.*?:\s*/, "") });
    }
    next(err);
  }
});

