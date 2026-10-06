import { Router, type IRouter } from "express";
import { createHash } from "node:crypto";
import multer from "multer";
import { pool } from "@workspace/db";
import { objectStorageClient } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { sendJarvisEmail } from "../services/jarvis-email-provider.js";

export const archProcurementRfqRouter: IRouter = Router();
export const archProcurementRfqPublicRouter: IRouter = Router();
const publicUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 5 } });

function safeFilename(name: string) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120) || "documento";
}

async function saveSupplierDocument(tid: string, obraId: string, file: Express.Multer.File) {
  const privateDir = process.env["PRIVATE_OBJECT_DIR"] || "/app-uploads/private";
  const storedName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeFilename(file.originalname)}`;
  const fullPath = `${privateDir}/procurement/rfq/${tid}/${obraId}/${storedName}`;
  const parts = fullPath.split("/").filter(Boolean);
  const bucketName = parts.shift();
  if (!bucketName || !parts.length) throw new Error("PRIVATE_OBJECT_DIR inválido");
  const objectName = parts.join("/");
  await objectStorageClient.bucket(bucketName).file(objectName).save(file.buffer, { contentType: file.mimetype, resumable: false });
  return {
    name: file.originalname,
    storedName,
    mimeType: file.mimetype,
    size: file.size,
    url: `/api/storage/objects/procurement/rfq/${tid}/${obraId}/${storedName}`,
    uploadedAt: new Date().toISOString(),
  };
}

function allowedSupplierFile(file: Express.Multer.File) {
  const lower = file.originalname.toLowerCase();
  return file.mimetype === "application/pdf"
    || file.mimetype.startsWith("image/")
    || /\.(xlsx|xls|csv|txt|xml|dwg|dxf)$/i.test(lower);
}

async function technicalDocuments(tid: string, obraId: string, category: string) {
  const result = await pool.query(
    `SELECT id,categoria,titulo,descricao,url,mime_type,versao,created_at
       FROM obra_portal_documents
      WHERE tenant_id=$1 AND obra_id=$2
        AND lower(categoria) = ANY($3::text[])
      ORDER BY created_at DESC
      LIMIT 30`,
    [tid, obraId, ["projeto","planta","desenho","detalhe","memorial","especificacao","arquivo_tecnico","levantamento"]],
  ).catch(() => ({ rows: [] as any[] }));

  const normalizedCategory = normalizeText(category);
  const rows = (result as any).rows as any[];
  const direct = rows.filter((doc: any) => {
    const hay = normalizeText([doc.categoria, doc.titulo, doc.descricao].filter(Boolean).join(" "));
    return Boolean(normalizedCategory) && hay.includes(normalizedCategory);
  });
  return direct.map((doc: any) => ({
    id: doc.id,
    category: doc.categoria,
    title: doc.titulo,
    description: doc.descricao,
    url: doc.url,
    mimeType: doc.mime_type,
    version: doc.versao,
  }));
}

async function commercialContext(tid: string, projectId: string, budgetId: string) {
  const [budgetResult, linkedResult, archProposalResult] = await Promise.all([
    pool.query(`SELECT sale_total,sale_source,grand_total,version FROM arch_budgets WHERE id=$1::uuid AND tenant_id::text=$2 LIMIT 1`, [budgetId, tid]),
    pool.query(
      `SELECT p.id,p.numero,p.valor_total,p.status,p.updated_at
         FROM arch_projetos ap
         JOIN propostas p ON p.id=ap.proposta_id
        WHERE ap.id=$1::text AND ap.tenant_id=$2 AND p.tenant_id=$2
        LIMIT 1`,
      [projectId, tid],
    ).catch(() => ({ rows: [] as any[] })),
    pool.query(
      `SELECT id,version,grand_total,status,updated_at
         FROM arch_proposals
        WHERE project_id=$1::uuid AND budget_id=$2::uuid AND tenant_id::text=$3 AND deleted_at IS NULL
        ORDER BY version DESC,updated_at DESC LIMIT 1`,
      [projectId, budgetId, tid],
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const budget = budgetResult.rows[0] ?? {};
  const linked = (linkedResult as any).rows?.[0] ?? null;
  const archProposal = (archProposalResult as any).rows?.[0] ?? null;

  if (linked && n(linked.valor_total) > 0) {
    return {
      saleTotal: n(linked.valor_total),
      saleSource: "commercial_proposal",
      commercialProposalId: String(linked.id),
      archProposalId: archProposal?.id ? String(archProposal.id) : null,
      revision: linked.numero || (archProposal ? `R${archProposal.version}` : null),
    };
  }
  if (budget.sale_total != null && n(budget.sale_total) > 0) {
    return {
      saleTotal: n(budget.sale_total),
      saleSource: String(budget.sale_source || "budget"),
      commercialProposalId: null,
      archProposalId: archProposal?.id ? String(archProposal.id) : null,
      revision: archProposal ? `R${archProposal.version}` : `B${budget.version || 1}`,
    };
  }
  return {
    saleTotal: null,
    saleSource: null,
    commercialProposalId: null,
    archProposalId: archProposal?.id ? String(archProposal.id) : null,
    revision: archProposal ? `R${archProposal.version}` : `B${budget.version || 1}`,
  };
}

async function assertPackageStillCurrent(tid: string, obraId: string, packageId: string) {
  const packageResult = await pool.query(
    `SELECT * FROM arch_rfq_packages WHERE id=$1::uuid AND tenant_id=$2 AND obra_id=$3 LIMIT 1`,
    [packageId, tid, obraId],
  );
  const pkg = packageResult.rows[0];
  if (!pkg) return { ok: false as const, reason: "Pacote de cotação não encontrado." };

  const snapshot = pkg.scope_snapshot || {};
  const snapshotItems = Array.isArray(snapshot.items) ? snapshot.items : [];
  for (const snap of snapshotItems) {
    const currentResult = await pool.query(
      `SELECT abi.*,aso.category AS spec_category,aso.region AS spec_region,aa.nome AS ambiente_nome
         FROM arch_budget_items abi
         LEFT JOIN arch_spec_objects aso ON aso.id=abi.spec_object_id
         LEFT JOIN arch_ambientes aa ON aa.id::text=abi.ambiente_id::text
        WHERE abi.id=$1::uuid AND abi.budget_id=$2::uuid AND abi.tenant_id::text=$3 AND abi.deleted_at IS NULL
        LIMIT 1`,
      [snap.budgetItemId, pkg.budget_id, tid],
    );
    const row = currentResult.rows[0];
    if (!row) return { ok: false as const, reason: `Item removido do orçamento: ${snap.item || snap.budgetItemId}` };
    const scope = inferScope(row);
    const currentSnapshot = {
      budgetItemId: row.id,
      specObjectId: row.spec_object_id,
      item: row.item,
      description: row.description,
      ambienteId: row.ambiente_id,
      ambiente: row.ambiente_nome || null,
      region: row.spec_region || null,
      quantity: n(row.quantity, 1),
      unit: row.unit || "un",
      productName: row.product_name,
      materialName: row.material_name,
      manufacturerName: row.manufacturer_name,
      total: n(row.total),
      category: scope.category,
      discipline: scope.discipline,
    };
    if (scopeHash(currentSnapshot) !== snap.scopeHash) {
      return { ok: false as const, reason: `Escopo alterado após o envio: ${row.item}` };
    }
  }
  return { ok: true as const, pkg };
}


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
async function ensureArchitectReferralPartner(tid: string, userId: string | null | undefined) {
  if (!userId) return null;
  const existing = await pool.query(
    `SELECT id FROM partners WHERE user_id=$1 AND status='ativo' ORDER BY created_at ASC LIMIT 1`,
    [userId],
  );
  if (existing.rows[0]) return String(existing.rows[0].id);

  const user = await pool.query(
    `SELECT id,name,email,telefone FROM users WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
    [userId, tid],
  );
  const row = user.rows[0];
  if (!row?.email) return null;

  const byEmail = await pool.query(
    `SELECT id FROM partners WHERE lower(email)=lower($1) ORDER BY created_at ASC LIMIT 1`,
    [row.email],
  );
  if (byEmail.rows[0]) {
    await pool.query(
      `UPDATE partners SET user_id=COALESCE(user_id,$1),tenant_id=COALESCE(tenant_id,$2),tipo_parceiro='arquiteto'
        WHERE id=$3`,
      [userId, tid, byEmail.rows[0].id],
    );
    return String(byEmail.rows[0].id);
  }

  const created = await pool.query(
    `INSERT INTO partners
      (id,name,user_id,tenant_id,nome_fantasia,email,telefone,phone,status,tipo_parceiro,created_at,data_cadastro)
     VALUES(gen_random_uuid()::text,$1,$2,$3,$1,$4,$5,$5,'ativo','arquiteto',now(),now())
     RETURNING id`,
    [row.name || row.email, userId, tid, row.email, row.telefone || null],
  );
  return created.rows[0]?.id ? String(created.rows[0].id) : null;
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
  const [packages, items, invitations, quoteItems, suppliers, supplierStats] = await Promise.all([
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
    pool.query(`SELECT lower(supplier_name) AS supplier_key,
                       COUNT(*)::int AS total_orders,
                       COUNT(*) FILTER (WHERE status IN ('approved','ordered','partial','delivered'))::int AS selected_orders,
                       COUNT(*) FILTER (WHERE status='delivered')::int AS delivered_orders,
                       COUNT(*) FILTER (WHERE delivered_at IS NOT NULL AND expected_delivery IS NOT NULL AND delivered_at::date <= expected_delivery)::int AS on_time_orders,
                       AVG(lead_time_days)::numeric AS avg_lead_time_days,
                       AVG(confirmed_value)::numeric AS avg_confirmed_value
                  FROM arch_supplier_orders
                 WHERE tenant_id::text=$1 AND deleted_at IS NULL
                 GROUP BY lower(supplier_name)`, [tid]),
  ]);
  return { packages: packages.rows, items: items.rows, invitations: invitations.rows, quoteItems: quoteItems.rows, suppliers: suppliers.rows, supplierStats: supplierStats.rows };
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
    const commercial = await commercialContext(tid, String(budget.project_id), budgetId);

    const selectedIds = Array.isArray(req.body?.budgetItemIds) ? req.body.budgetItemIds.map(String) : [];
    const params: any[] = [budgetId, tid];
    let filter = "";
    if (selectedIds.length) { params.push(selectedIds); filter = ` AND id = ANY($3::uuid[])`; }
    const itemResult = await client.query(
      `SELECT abi.*, aso.category AS spec_category, aso.region AS spec_region,
              aso.purchase_quantity AS spec_purchase_quantity,
              aso.package_yield AS spec_package_yield,
              aso.waste_factor AS spec_waste_factor,
              aso.measurement_source AS spec_measurement_source,
              aso.measurement_revision AS spec_measurement_revision,
              aa.nome AS ambiente_nome\n       FROM arch_budget_items abi\n       LEFT JOIN arch_spec_objects aso ON aso.id=abi.spec_object_id\n       LEFT JOIN arch_ambientes aa ON aa.id::text=abi.ambiente_id::text\n      WHERE abi.budget_id=$1::uuid AND abi.tenant_id::text=$2 AND abi.deleted_at IS NULL ${filter.replace(" id ", " abi.id ")}\n      ORDER BY abi.sort_order,abi.created_at`,
      params,
    );
    if (!itemResult.rows.length) return res.status(422).json({ error: "O orçamento não possui itens para cotação." });

    const outdatedItems = itemResult.rows.filter((row: any) => Boolean(row.specification_outdated));
    if (outdatedItems.length) {
      return res.status(409).json({
        error: "Existem itens com especificação desatualizada. Revise a especificação antes de gerar a cotação.",
        code: "SPECIFICATION_OUTDATED",
        items: outdatedItems.map((row: any) => ({
          id: row.id,
          item: row.item,
          specificationRevision: row.specification_revision ?? null,
          specificationImpact: row.specification_impact ?? null,
        })),
      });
    }

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
      const budgetCostBase = Math.max(0, n(budget.subtotal) || itemResult.rows.reduce((sum: number, item: any) => sum + n(item.total), 0));
      const docs = await technicalDocuments(tid, obraId, group.category);
      for (const row of group.rows) {
        const requestId = crypto.randomUUID();
        const total = n(row.total);
        const rowSale = row.sale_total != null
          ? n(row.sale_total)
          : commercial.saleTotal != null && budgetCostBase > 0
            ? commercial.saleTotal * (total / budgetCostBase)
            : 0;
        saleValue += rowSale;
        const projectQuantity = n(row.quantity, 1);
        const purchaseQuantity = row.spec_purchase_quantity != null
          ? Math.max(0, n(row.spec_purchase_quantity))
          : projectQuantity;
        const quoteQuantity = purchaseQuantity > 0 ? purchaseQuantity : projectQuantity;
        const quoteTotal = n(row.unit_total) * quoteQuantity;
        const snapshot = {
          budgetItemId: row.id,
          specObjectId: row.spec_object_id,
          item: row.item,
          description: row.description,
          ambienteId: row.ambiente_id,
          ambiente: row.ambiente_nome || null,
          region: row.spec_region || null,
          projectQuantity,
          purchaseQuantity: quoteQuantity,
          quantity: quoteQuantity,
          unit: row.unit || "un",
          wasteFactor: row.spec_waste_factor != null ? n(row.spec_waste_factor) : null,
          packageYield: row.spec_package_yield != null ? n(row.spec_package_yield) : null,
          measurementSource: row.spec_measurement_source || null,
          measurementRevision: row.spec_measurement_revision || null,
          specificationRevision: row.specification_revision || null,
          productName: row.product_name,
          materialName: row.material_name,
          manufacturerName: row.manufacturer_name,
          total: quoteTotal,
          category: group.category,
          discipline: group.discipline,
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
               valor_total=$7,valor_venda_snapshot=$8,custo_estimado_snapshot=$7,escopo_snapshot=$9::jsonb,
               escopo_hash=$10,cotacao_desatualizada=CASE WHEN $11 THEN true ELSE cotacao_desatualizada END,
               escopo_versao=CASE WHEN $11 THEN escopo_versao+1 ELSE escopo_versao END,updated_at=now()
             WHERE id=$12 AND tenant_id=$13`,
            [row.item, row.ambiente_nome || (row.ambiente_id ? String(row.ambiente_id) : null), group.discipline, group.category,
             String(snapshot.quantity), row.unit || "un", String(snapshot.total), String(rowSale), JSON.stringify(snapshot), hash, Boolean(changed), finalRequestId, tid],
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
             group.discipline,group.category,String(snapshot.quantity),row.unit||"un",String(n(row.unit_total)),String(snapshot.total),
             budgetId,row.id,row.spec_object_id||null,hash,JSON.stringify(snapshot),String(rowSale),String(snapshot.total)],
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
         (tenant_id,obra_id,project_id,budget_id,code,title,category,discipline,version,status,scope_hash,scope_snapshot,documents,
          arch_proposal_id,commercial_proposal_id,proposal_revision,sale_total_snapshot,sale_source,technical_documents_snapshot,
          created_by,created_at,updated_at)
         VALUES($1,$2,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,'draft',$10,$11::jsonb,$12::jsonb,
                $13::uuid,$14,$15,$16,$17,$12::jsonb,$18,now(),now()) RETURNING *`,
        [tid,obraId,budget.project_id,budgetId,codeFor(group.category),`Cotação — ${group.category}`,group.category,group.discipline,
         packageVersion,packageHash,JSON.stringify(packageSnapshot),JSON.stringify(docs),
         commercial.archProposalId,commercial.commercialProposalId,commercial.revision,String(saleValue || 0),commercial.saleSource,
         req.user?.sub??null],
      );
      for (let i=0;i<requestIds.length;i++) {
        await client.query(`INSERT INTO arch_rfq_package_items(package_id,compra_id,sort_order) VALUES($1::uuid,$2,$3) ON CONFLICT DO NOTHING`, [pkg.rows[0].id,requestIds[i],i]);
      }
      created.push({ ...pkg.rows[0], itemCount: requestIds.length, saleValue, commercialSource: commercial.saleSource });
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
      const existingInvite = await pool.query(
        `SELECT * FROM arch_rfq_invitations
          WHERE tenant_id=$1 AND package_id=$2::uuid AND supplier_id=$3
          LIMIT 1`,
        [tid, packageId, supplier.id],
      );
      if (existingInvite.rows[0]) {
        created.push({ ...existingInvite.rows[0], duplicate: true, publicUrl: `${req.protocol}://${req.get("host")}/api/public/arqdor/rfq/${existingInvite.rows[0].public_token}` });
        continue;
      }
      const inviteResult = await pool.query(
        `INSERT INTO arch_rfq_invitations
         (tenant_id,package_id,supplier_id,supplier_name,contact_name,channel,destination,supplier_email,supplier_phone,access_mode,status,created_at,updated_at)
         VALUES($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,'registered','draft',now(),now())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [tid,packageId,supplier.id,supplier.nome,supplier.contato||null,channel,destination,supplier.email||null,supplier.telefone||null],
      );
      const invite = inviteResult.rows[0];
      if (!invite) continue;
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
    const sentCount = created.filter((item: any) => item.status === "sent" || item.status === "viewed" || item.status === "responded" || item.status === "accepted").length;
    const failedCount = created.filter((item: any) => item.status === "failed").length;
    const packageStatus = sentCount === 0 ? "draft" : failedCount > 0 ? "partial" : "sent";
    await pool.query(`UPDATE arch_rfq_packages SET status=$1,updated_at=now() WHERE id=$2::uuid`, [packageStatus, packageId]);
    res.status(201).json({ invitations: created, skipped: supplierIds.length - created.length, packageStatus });
  } catch (err) { logger.error({ err }, "rfq invitations error"); next(err); }
});


archProcurementRfqRouter.post("/arch/procurement-rfq/:obraId/packages/:packageId/guest-invitations", async (req, res, next) => {
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const obraId = String(req.params["obraId"] || "");
    const packageId = String(req.params["packageId"] || "");
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim();
    if (!name) return res.status(422).json({ error: "Informe o nome do fornecedor." });
    if (!email && !phone) return res.status(422).json({ error: "Informe telefone ou e-mail." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(422).json({ error: "E-mail inválido." });

    const pkgResult = await pool.query(
      `SELECT * FROM arch_rfq_packages WHERE id=$1::uuid AND obra_id=$2 AND tenant_id=$3 LIMIT 1`,
      [packageId,obraId,tid],
    );
    const pkg = pkgResult.rows[0];
    if (!pkg) return res.status(404).json({ error: "Pacote de cotação não encontrado." });

    const phoneDigits = phone.replace(/\D/g, "");
    const existing = await pool.query(
      `SELECT * FROM arch_rfq_invitations
        WHERE tenant_id=$1 AND package_id=$2::uuid AND supplier_id IS NULL
          AND (
            ($3<>'' AND lower(COALESCE(supplier_email,''))=lower($3))
            OR ($4<>'' AND regexp_replace(COALESCE(supplier_phone,''),'[^0-9]','','g')=$4)
          )
        LIMIT 1`,
      [tid, packageId, email, phoneDigits],
    );
    if (existing.rows[0]) {
      const inv = existing.rows[0];
      return res.status(200).json({
        invitation: inv,
        duplicate: true,
        publicUrl: `${req.protocol}://${req.get("host")}/api/public/arqdor/rfq/${inv.public_token}`,
      });
    }

    const primaryChannel = email ? "email" : "whatsapp";
    const destination = email || phone;
    const referrerUserId = req.user?.sub ? String(req.user.sub) : null;
    const referrerPartnerId = await ensureArchitectReferralPartner(tid, referrerUserId);
    const inviteResult = await pool.query(
      `INSERT INTO arch_rfq_invitations
       (tenant_id,package_id,supplier_id,supplier_name,contact_name,channel,destination,
        supplier_email,supplier_phone,access_mode,referrer_user_id,referrer_partner_id,referral_attributed_at,
        status,created_at,updated_at)
       VALUES($1,$2::uuid,NULL,$3,$3,$4,$5,$6,$7,'guest',$8,$9,now(),'draft',now(),now())
       RETURNING *`,
      [tid,packageId,name,primaryChannel,destination,email||null,phone||null,referrerUserId,referrerPartnerId],
    );
    const invite = inviteResult.rows[0];
    const publicUrl = `${req.protocol}://${req.get("host")}/api/public/arqdor/rfq/${invite.public_token}`;
    const message = [
      `Solicitação de cotação: ${pkg.title}`,
      `Código: ${pkg.code} • versão ${pkg.version}`,
      "Você não precisa criar conta para responder. O link contém somente os itens do seu escopo.",
      publicUrl,
    ].join("\\n\\n");

    let emailSent = false;
    let whatsappSent = false;
    const errors: string[] = [];
    if (email) {
      try {
        await sendJarvisEmail({ to: email, subject: `Cotação ${pkg.code} — ${pkg.title}`, body: message });
        emailSent = true;
      } catch (err) { errors.push(`e-mail: ${err instanceof Error ? err.message : "falha"}`); }
    }
    if (phone) {
      try {
        await sendDirectWhatsAppMessage(tid, phone, message, logger);
        whatsappSent = true;
      } catch (err) { errors.push(`WhatsApp: ${err instanceof Error ? err.message : "falha"}`); }
    }

    const sent = emailSent || whatsappSent;
    await pool.query(
      `UPDATE arch_rfq_invitations
          SET status=$1,sent_at=CASE WHEN $1='sent' THEN now() ELSE sent_at END,updated_at=now()
        WHERE id=$2::uuid`,
      [sent ? "sent" : "failed", invite.id],
    );
    if (sent) {
      await pool.query(
        `UPDATE arch_rfq_packages SET status=CASE WHEN status='draft' THEN 'sent' ELSE status END,updated_at=now()
          WHERE id=$1::uuid`,
        [packageId],
      );
    }

    res.status(201).json({
      invitation: { ...invite, status: sent ? "sent" : "failed" },
      publicUrl,
      delivery: { email: email ? emailSent : null, whatsapp: phone ? whatsappSent : null },
      errors,
    });
  } catch (err) {
    logger.error({ err }, "guest rfq invitation error");
    next(err);
  }
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

    const freshness = await assertPackageStillCurrent(tid, obraId, packageId);
    if (!freshness.ok) {
      await client.query(
        `UPDATE compras_obras c
            SET cotacao_desatualizada=true, updated_at=now()
           FROM arch_rfq_package_items pi
          WHERE pi.package_id=$1::uuid AND pi.compra_id=c.id AND c.tenant_id=$2 AND c.obra_id=$3`,
        [packageId, tid, obraId],
      );
      return res.status(409).json({ error: freshness.reason, code: "RFQ_SCOPE_STALE" });
    }

    const items = await client.query(`SELECT * FROM arch_rfq_quote_items WHERE invitation_id=$1::uuid`, [invitationId]);
    const expected = await client.query(`SELECT COUNT(*)::int AS count FROM arch_rfq_package_items WHERE package_id=$1::uuid`, [packageId]);
    if (items.rows.length !== Number(expected.rows[0]?.count || 0) || items.rows.some((item: any) => n(item.unit_value) <= 0 && n(item.quantity) > 0)) {
      return res.status(409).json({ error: "A cotação está incompleta. Todos os itens precisam ter preço antes da contratação.", code: "RFQ_INCOMPLETE" });
    }
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


archProcurementRfqRouter.post("/arch/procurement-rfq/:obraId/packages/:packageId/commercial-revision", async (req, res, next) => {
  const client = await pool.connect();
  try {
    const tid = requireTenant(req, res); if (!tid) return;
    const obraId = String(req.params["obraId"] || "");
    const packageId = String(req.params["packageId"] || "");
    const packageSaleTotal = Math.max(0, n(req.body?.saleTotal));
    if (packageSaleTotal <= 0) return res.status(422).json({ error: "Informe o novo preço de venda deste pacote." });

    const pkgResult = await client.query(
      `SELECT * FROM arch_rfq_packages WHERE id=$1::uuid AND obra_id=$2 AND tenant_id=$3 LIMIT 1`,
      [packageId, obraId, tid],
    );
    const pkg = pkgResult.rows[0];
    if (!pkg) return res.status(404).json({ error: "Pacote não encontrado." });
    if (!pkg.commercial_proposal_id) {
      return res.status(409).json({ error: "Não existe proposta comercial vinculada. Defina o preço no orçamento e gere a proposta primeiro." });
    }

    const baseResult = await client.query(
      `SELECT * FROM propostas WHERE id=$1 AND tenant_id=$2 LIMIT 1`,
      [pkg.commercial_proposal_id, tid],
    );
    const base = baseResult.rows[0];
    if (!base) return res.status(404).json({ error: "Proposta comercial base não encontrada." });

    const ancestryResult = await client.query(
      `SELECT base_proposta_id
         FROM orcamento_revisoes
        WHERE tenant_id=$1 AND proposta_revisao_id=$2
        ORDER BY created_at ASC
        LIMIT 1`,
      [tid, base.id],
    );
    const rootBaseId = String(ancestryResult.rows[0]?.base_proposta_id || base.id);
    const rootResult = rootBaseId === String(base.id)
      ? { rows: [base] }
      : await client.query(`SELECT * FROM propostas WHERE id=$1 AND tenant_id=$2 LIMIT 1`, [rootBaseId, tid]);
    const rootBase = rootResult.rows[0] || base;
    const baseNumero = String(rootBase.numero || rootBase.id);

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM orcamento_revisoes
        WHERE tenant_id=$1 AND lead_id=$2
          AND (base_proposta_id=$3 OR numero_orcamento=$4 OR numero_orcamento LIKE $5 OR numero_orcamento LIKE $6)`,
      [tid, base.lead_id, rootBaseId, baseNumero, `${baseNumero}-R%`, `${baseNumero}-A%`],
    );
    const revisionNumber = Number(countResult.rows[0]?.count || 0) + 1;
    const addendum = String(rootBase.status) === "aceita" || String(base.status) === "aceita";
    const revisionLabel = `${addendum ? "A" : "R"}${revisionNumber}`;
    const revisionNumero = `${baseNumero}-${revisionLabel}`;
    const revisionId = crypto.randomUUID();
    const reviewId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    await client.query("BEGIN");

    // First synchronize the current commercial proposal across all budget items.
    // Then alter only the items that belong to this supplier package.
    const budgetItemsResult = await client.query(
      `SELECT id,total
         FROM arch_budget_items
        WHERE budget_id=$1::uuid AND tenant_id::text=$2 AND deleted_at IS NULL
        ORDER BY sort_order,created_at`,
      [pkg.budget_id, tid],
    );
    const technicalBase = budgetItemsResult.rows.reduce((sum: number, row: any) => sum + n(row.total), 0);
    const currentProjectSale = Math.max(0, n(base.valor_total));
    if (technicalBase > 0 && currentProjectSale > 0) {
      await client.query(
        `UPDATE arch_budget_items
            SET sale_total=ROUND(($1::numeric * total::numeric / $2::numeric),2),updated_at=now()
          WHERE budget_id=$3::uuid AND tenant_id::text=$4 AND deleted_at IS NULL`,
        [String(currentProjectSale), String(technicalBase), pkg.budget_id, tid],
      );
    }

    const packageBudgetItems = await client.query(
      `SELECT abi.id,abi.total
         FROM arch_rfq_package_items pi
         JOIN compras_obras c ON c.id=pi.compra_id
         JOIN arch_budget_items abi ON abi.id=c.budget_item_id
        WHERE pi.package_id=$1::uuid
          AND c.tenant_id=$2 AND c.obra_id=$3
          AND abi.budget_id=$4::uuid AND abi.tenant_id::text=$2 AND abi.deleted_at IS NULL`,
      [packageId, tid, obraId, pkg.budget_id],
    );
    const packageTechnicalBase = packageBudgetItems.rows.reduce((sum: number, row: any) => sum + n(row.total), 0);
    if (!packageBudgetItems.rows.length || packageTechnicalBase <= 0) {
      throw new Error("Não foi possível localizar os itens do pacote no orçamento atual.");
    }

    const packageItemIds = packageBudgetItems.rows.map((row: any) => String(row.id));
    await client.query(
      `UPDATE arch_budget_items
          SET sale_total=ROUND(($1::numeric * total::numeric / $2::numeric),2),updated_at=now()
        WHERE id=ANY($3::uuid[]) AND budget_id=$4::uuid AND tenant_id::text=$5 AND deleted_at IS NULL`,
      [String(packageSaleTotal), String(packageTechnicalBase), packageItemIds, pkg.budget_id, tid],
    );

    const projectSaleResult = await client.query(
      `SELECT COALESCE(SUM(COALESCE(sale_total,0)),0)::numeric AS total
         FROM arch_budget_items
        WHERE budget_id=$1::uuid AND tenant_id::text=$2 AND deleted_at IS NULL`,
      [pkg.budget_id, tid],
    );
    const projectSaleTotal = Math.max(0, n(projectSaleResult.rows[0]?.total));
    if (projectSaleTotal <= 0) throw new Error("O preço comercial total ficou inválido após a revisão.");

    const revisionResult = await client.query(
      `INSERT INTO propostas (
        id,tenant_id,lead_id,deal_id,titulo,itens,apresentacao,valor_total,status,validade_ate,observacoes,
        forma_pagamento,cond_pagamento,prazo_entrega,forma_pagamento_mensalidade,cond_pagamento_mensalidade,
        numero,arquivo_importado_url,arquivo_importado_nome,recorrente,valor_mensal,prazo_contrato_meses,num_parcelas,
        auto_generated,public_token,accepted_at,accepted_via,accepted_by,acceptance_metadata,payment_compositions,created_at,updated_at
      )
      SELECT
        $1,tenant_id,lead_id,deal_id,titulo,itens,
        COALESCE(apresentacao,'{}'::jsonb) || jsonb_build_object(
          'sourceSnapshot',
          COALESCE(apresentacao->'sourceSnapshot','{}'::jsonb) || jsonb_build_object(
            'schemaVersion',1,
            'capturedAt',$2,
            'immutableForVersion',true,
            'origin','revision',
            'changeType',$3,
            'baseBudgetId',id,
            'baseBudgetNumber',$4,
            'revisionLabel',$5
          )
        ),
        $6,'rascunho',validade_ate,observacoes,
        forma_pagamento,cond_pagamento,prazo_entrega,forma_pagamento_mensalidade,cond_pagamento_mensalidade,
        $7,arquivo_importado_url,arquivo_importado_nome,recorrente,valor_mensal,prazo_contrato_meses,num_parcelas,
        false,$8,null,null,null,null,payment_compositions,now(),now()
      FROM propostas
      WHERE id=$9 AND tenant_id=$10
      RETURNING *`,
      [revisionId, nowIso, addendum ? "contract_addendum" : "commercial_revision", baseNumero, revisionLabel,
       String(projectSaleTotal), revisionNumero, crypto.randomUUID().replace(/-/g, ""), base.id, tid],
    );
    const revision = revisionResult.rows[0];
    if (!revision) throw new Error("Não foi possível criar a revisão comercial.");

    // Keep the cloned proposal internally consistent. This is a draft revision:
    // detailed commercial items remain editable before sending.
    const baseProposalTotal = Math.max(0, n(base.valor_total));
    const projectPriceFactor = baseProposalTotal > 0 ? projectSaleTotal / baseProposalTotal : 1;
    await client.query(
      `UPDATE propostas
          SET itens=COALESCE((
            SELECT jsonb_agg(
              jsonb_set(
                item,
                '{valorUnitario}',
                to_jsonb(ROUND(COALESCE((item->>'valorUnitario')::numeric,0) * $1::numeric,2)),
                true
              )
            )
            FROM jsonb_array_elements(COALESCE(itens,'[]'::jsonb)) item
          ),'[]'::jsonb),
          updated_at=now()
        WHERE id=$2 AND tenant_id=$3`,
      [String(projectPriceFactor), revisionId, tid],
    );

    await client.query(
      `INSERT INTO orcamento_revisoes
        (id,tenant_id,lead_id,deal_id,base_proposta_id,proposta_revisao_id,revisao_numero,numero_orcamento,
         data_orcamento,apresentacao,observacao,anexos,created_by,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_DATE,$9,$10,'[]'::jsonb,$11,now(),now())`,
      [reviewId, tid, base.lead_id, base.deal_id, rootBaseId, revisionId, revisionLabel, revisionNumero,
       "Revisão gerada a partir da análise de cotação de fornecedores",
       `Pacote ${pkg.code}: preço comercial do pacote alterado de ${n(pkg.sale_total_snapshot).toFixed(2)} para ${packageSaleTotal.toFixed(2)}. Total comercial do projeto: ${projectSaleTotal.toFixed(2)}.`,
       req.user?.sub ?? null],
    );

    await client.query(
      `UPDATE arch_projetos SET proposta_id=$1,updated_at=now() WHERE id=$2::text AND tenant_id=$3`,
      [revisionId, pkg.project_id, tid],
    );
    await client.query(
      `UPDATE arch_budgets SET sale_total=$1,sale_source='proposal',updated_at=now()
        WHERE id=$2::uuid AND tenant_id::text=$3`,
      [String(projectSaleTotal), pkg.budget_id, tid],
    );

    await client.query("COMMIT");
    res.status(201).json({
      revision,
      revisionLabel,
      revisionNumero,
      packageSaleTotal,
      previousPackageSaleTotal: n(pkg.sale_total_snapshot),
      projectSaleTotal,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ err }, "rfq commercial revision error");
    next(err);
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
    const technicalDocs = Array.isArray(pkg.technical_documents_snapshot)
      ? pkg.technical_documents_snapshot
      : Array.isArray(pkg.documents) ? pkg.documents : [];
    const responseDocs = Array.isArray(inv.response_documents) ? inv.response_documents : [];
    await pool.query(`SELECT public.arch_rfq_public_mark_viewed($1::uuid)`, [token]);

    const itemRows = items.map((item:any)=>`<tr>
      <td><strong>${esc(item.descricao)}</strong><br><small>${esc(item.ambiente || "")}</small></td>
      <td>${esc(item.quantidade)} ${esc(item.unidade)}</td>
      <td><input data-id="${esc(item.id)}" data-field="unitValue" type="number" step="0.01" min="0" required></td>
      <td><input data-id="${esc(item.id)}" data-field="brandModel" placeholder="marca/modelo"></td>
      <td><input data-id="${esc(item.id)}" data-field="notes" placeholder="observações"></td>
    </tr>`).join("");
    const itemMeta = JSON.stringify(items.map((x:any)=>({id:String(x.id),quantity:n(x.quantidade),unit:x.unidade||"un"})));
    const technicalDocRows = technicalDocs.length
      ? technicalDocs.map((doc:any)=>`<li><a href="${esc(doc.url)}" target="_blank" rel="noopener">${esc(doc.title || doc.name || "Documento técnico")}</a>${doc.version ? ` <small>• ${esc(doc.version)}</small>` : ""}</li>`).join("")
      : "<li class='muted'>Nenhum arquivo técnico vinculado a este pacote.</li>";
    const responseDocRows = responseDocs.length
      ? responseDocs.map((doc:any)=>`<li>${esc(doc.name || "Anexo enviado")}</li>`).join("")
      : "<li class='muted'>Nenhum anexo enviado ainda.</li>";
    const supplierAccountCard = inv.access_mode === "guest"
      ? `<div class="card" id="vendorAccount"><div class="muted">Opcional</div><h2>Quer usar o Vendor.ai como fornecedor?</h2>
          <p class="muted">Você pode responder esta cotação sem cadastro. Se quiser, crie sua conta e passe a ter seu próprio ambiente, histórico de cotações e recursos do sistema.</p>
          <div class="grid">
            <div><label>Empresa</label><input id="signupCompany" value="${esc(inv.supplier_name || "")}"></div>
            <div><label>Responsável</label><input id="signupName" value="${esc(inv.contact_name || inv.supplier_name || "")}"></div>
            <div><label>E-mail</label><input id="signupEmail" type="email" value="${esc(inv.supplier_email || "")}"></div>
            <div><label>Telefone</label><input id="signupPhone" value="${esc(inv.supplier_phone || "")}"></div>
            <div style="grid-column:1/-1"><label>Senha</label><input id="signupPassword" type="password" minlength="8" placeholder="Mínimo 8 caracteres"></div>
          </div>
          <p id="signupMsg" class="muted"></p>
          <button id="signupVendor" type="button" style="background:#4f46e5">Criar minha conta Vendor.ai</button>
        </div>`
      : inv.access_mode === "converted"
        ? `<div class="card"><div class="muted">Conta Vendor.ai vinculada</div><h2>Este fornecedor já possui acesso ao sistema</h2><p class="muted">O histórico desta cotação continua vinculado à conta. <a href="/login">Entrar no Vendor.ai</a>.</p></div>`
        : "";

    res.type("html").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(pkg.code)} — Cotação</title><style>
    body{font-family:Inter,Arial,sans-serif;background:#f6f7fb;color:#111827;margin:0}.wrap{max-width:1100px;margin:36px auto;padding:0 18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:24px;margin-bottom:18px}h1{margin:4px 0 8px;font-size:28px}small,.muted{color:#6b7280}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #eee;vertical-align:top}input,textarea{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d1d5db;border-radius:10px}label{display:block;font-size:12px;font-weight:700;margin:12px 0 6px}button{background:#111827;color:#fff;border:0;border-radius:12px;padding:13px 18px;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}@media(max-width:760px){.grid{grid-template-columns:1fr}table{font-size:12px}.wrap{margin:14px auto}}
    </style></head><body><div class="wrap"><div class="card"><div class="muted">ARQDOR • Solicitação de cotação</div><h1>${esc(pkg.title)}</h1>
    <p>${esc(obra?.nome || "Obra")} • ${esc(pkg.code)} • versão ${esc(pkg.version)}</p><p class="muted">Esta página contém somente os itens direcionados ao seu escopo: ${esc(pkg.category || pkg.discipline)}.</p></div>
    <div class="card"><table><thead><tr><th>Item</th><th>Quantidade</th><th>Valor unitário</th><th>Marca/modelo</th><th>Observação</th></tr></thead><tbody>${itemRows}</tbody></table></div>
    <div class="card"><h2>Arquivos técnicos</h2><p class="muted">Plantas, memoriais e detalhes liberados para esta cotação.</p><ul>${technicalDocRows}</ul></div>
    <div class="card"><h2>Anexar orçamento do fornecedor</h2><p class="muted">Você pode enviar PDF, imagem, planilha, CSV, DWG ou DXF. Até 5 arquivos por envio, 12 MB cada.</p>
      <input id="quoteFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,.txt,.xml,.dwg,.dxf">
      <button id="uploadFiles" type="button" style="margin-top:10px;background:#4f46e5">Enviar anexos</button>
      <p id="uploadMsg" class="muted"></p><ul id="uploadedDocs">${responseDocRows}</ul>
    </div>
    <div class="card"><div class="grid"><div><label>Frete</label><input id="freight" type="number" step="0.01" min="0" value="0"></div><div><label>Impostos/taxas</label><input id="taxes" type="number" step="0.01" min="0" value="0"></div>
    <div><label>Desconto</label><input id="discount" type="number" step="0.01" min="0" value="0"></div><div><label>Prazo de entrega (dias)</label><input id="leadTime" type="number" min="0"></div>
    <div><label>Validade</label><input id="validity" type="date"></div><div><label>Condição de pagamento</label><input id="payment" placeholder="Ex.: 30/60/90"></div></div>
    <label>Observações gerais</label><textarea id="supplierNotes" rows="4"></textarea><p id="msg" class="muted"></p><button id="send">Enviar cotação</button></div>
    ${supplierAccountCard}</div>
    <script>
    const META=${itemMeta};
    document.getElementById('uploadFiles').onclick=async()=>{
      const input=document.getElementById('quoteFiles');
      const files=[...(input.files||[])];
      const msg=document.getElementById('uploadMsg');
      if(!files.length){msg.textContent='Selecione ao menos um arquivo.';return}
      msg.textContent='Enviando...';
      for(const file of files){
        const fd=new FormData();fd.append('documento',file);
        const r=await fetch(location.pathname+'/documents',{method:'POST',body:fd});
        const d=await r.json().catch(()=>({}));
        if(!r.ok){msg.textContent=d.error||'Falha ao enviar anexo.';return}
      }
      msg.textContent='Anexos enviados com sucesso.';input.value='';
    };
    document.getElementById('send').onclick=async()=>{const rows=[...document.querySelectorAll('[data-id][data-field="unitValue"]')].map(el=>{const id=el.dataset.id;const q=META.find(x=>x.id===id);return{compraId:id,quantity:q?.quantity||0,unit:q?.unit||'un',unitValue:Number(el.value||0),brandModel:document.querySelector('[data-id="'+id+'"][data-field="brandModel"]').value,notes:document.querySelector('[data-id="'+id+'"][data-field="notes"]').value}});const body={items:rows,freight:Number(document.getElementById('freight').value||0),taxes:Number(document.getElementById('taxes').value||0),discount:Number(document.getElementById('discount').value||0),leadTimeDays:Number(document.getElementById('leadTime').value||0)||null,validityDate:document.getElementById('validity').value||null,paymentTerms:document.getElementById('payment').value||null,supplierNotes:document.getElementById('supplierNotes').value||null};const r=await fetch(location.pathname+'/respond',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));document.getElementById('msg').textContent=r.ok?'Cotação enviada com sucesso.':(d.error||'Não foi possível enviar.');if(r.ok)document.getElementById('send').disabled=true}
    const signupButton=document.getElementById('signupVendor');
    if(signupButton)signupButton.onclick=async()=>{
      const msg=document.getElementById('signupMsg');
      const company=document.getElementById('signupCompany').value.trim();
      const name=document.getElementById('signupName').value.trim();
      const email=document.getElementById('signupEmail').value.trim();
      const phone=document.getElementById('signupPhone').value.trim();
      const password=document.getElementById('signupPassword').value;
      if(!company||!name||!email||password.length<8){msg.textContent='Preencha empresa, responsável, e-mail e uma senha com pelo menos 8 caracteres.';return}
      signupButton.disabled=true;msg.textContent='Criando sua conta...';
      const rfqToken=location.pathname.split('/').filter(Boolean).pop();
      const r=await fetch('/api/auth/demo-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        nomeEmpresa:company,nomePessoa:name,email,telefone:phone||undefined,senha:password,segmento:'fornecedor',nicho:'fornecedor de arquitetura e construção',rfqToken
      })});
      const d=await r.json().catch(()=>({}));
      if(!r.ok){
        signupButton.disabled=false;
        if(d.code==='ACCOUNT_EXISTS'){
          msg.innerHTML='Este e-mail já possui conta Vendor.ai e o convite foi vinculado. <a href="/login">Entrar na conta</a>.';
          return;
        }
        msg.textContent=d.error||'Não foi possível criar a conta.';return
      }
      if(d.token)localStorage.setItem('vendorai_token',d.token);
      msg.textContent='Conta criada e vinculada a esta cotação. Abrindo o Vendor.ai...';
      setTimeout(()=>{location.href=d.demoUrl||'/app'},700);
    };
    </script></body></html>`);
  } catch (err) { logger.error({ err }, "public rfq page error"); next(err); }
});

archProcurementRfqPublicRouter.post("/public/arqdor/rfq/:token/documents", publicUpload.single("documento"), async (req, res, next) => {
  try {
    const token = String(req.params["token"] || "");
    const file = req.file;
    if (!file) return res.status(422).json({ error: "Selecione um arquivo." });
    if (!allowedSupplierFile(file)) return res.status(422).json({ error: "Formato não permitido para anexo de cotação." });

    const bundleResult = await pool.query(`SELECT public.arch_rfq_public_bundle($1::uuid) AS bundle`, [token]);
    const bundle = bundleResult.rows[0]?.bundle;
    if (!bundle) return res.status(404).json({ error: "Cotação não encontrada." });

    const inv = bundle.invitation;
    const pkg = bundle.package;
    if (["accepted","rejected","expired"].includes(String(inv.status))) {
      return res.status(409).json({ error: "Esta cotação já foi encerrada." });
    }
    const existingDocuments = Array.isArray(inv.response_documents) ? inv.response_documents : [];
    if (existingDocuments.length >= 10) {
      return res.status(422).json({ error: "Limite de 10 anexos por cotação atingido." });
    }

    const document = await saveSupplierDocument(String(inv.tenant_id), String(pkg.obra_id), file);
    await pool.query(`SELECT public.arch_rfq_public_add_document($1::uuid,$2::jsonb)`, [token, JSON.stringify(document)]);
    res.status(201).json({ document });
  } catch (err) {
    logger.error({ err }, "public rfq document upload error");
    next(err);
  }
});

archProcurementRfqPublicRouter.post("/public/arqdor/rfq/:token/respond", async (req, res, next) => {
  try {
    const token = String(req.params["token"] || "");
    const result = await pool.query(`SELECT public.arch_rfq_public_submit($1::uuid,$2::jsonb) AS result`, [token, JSON.stringify(req.body ?? {})]);
    res.json(result.rows[0]?.result ?? { ok: true });
  } catch (err) {
    logger.error({ err }, "public rfq response error");
    const message = err instanceof Error ? err.message : "Não foi possível registrar a cotação.";
    if (/Cotação não encontrada|Cotação encerrada|Informe os itens|Item fora do escopo|todos os itens do escopo|todos os itens precisam ter preço/i.test(message)) {
      return res.status(400).json({ error: message.replace(/^.*?:\s*/, "") });
    }
    next(err);
  }
});

