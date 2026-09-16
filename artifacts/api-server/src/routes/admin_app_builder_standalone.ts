import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  appActionRegistryTable,
  appAiPoliciesTable,
  appComponentRegistryTable,
  appDataSourceRegistryTable,
  appFeatureRegistryTable,
  appInstancesTable,
  appTemplateVersionsTable,
  appTemplatesTable,
  appVerticalsTable,
  appWorkflowRegistryTable,
  db,
  tenantsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { callOpenAI } from "../lib/ai-gateway.js";

const router: IRouter = Router();
router.use(requireRole("super_admin"));

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use somente letras minúsculas, números e hífen");

const standaloneCreateSchema = z.object({
  ownerType: z.enum(["prospect", "internal"]),
  ownerName: z.string().trim().min(2).max(160),
  ownerEmail: z.string().trim().email().max(320).nullable().optional(),
  ownerCompany: z.string().trim().max(180).nullable().optional(),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
});

const linkTenantSchema = z.object({ tenantId: z.string().min(1) });
const jsonObjectSchema = z.record(z.string(), z.unknown());

const aiArchitectRequestSchema = z.object({
  mode: z.enum(["generate", "revise", "analyze"]).default("generate"),
  depth: z.enum(["fast", "deep"]).default("deep"),
  request: z.string().trim().min(8).max(12000),
  templateId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  appContext: z.object({
    id: z.string().optional(),
    name: z.string().optional(),
    slug: z.string().optional(),
    ownerType: z.enum(["tenant", "prospect", "internal"]).optional(),
    ownerName: z.string().nullable().optional(),
    ownerCompany: z.string().nullable().optional(),
    ownerEmail: z.string().nullable().optional(),
    status: z.string().optional(),
  }).optional(),
  currentDefinition: jsonObjectSchema.optional(),
  conversation: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().max(8000),
  })).max(12).default([]),
});

const aiProposalSchema = z.object({
  summary: z.string().default(""),
  assumptions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  architecture: z.object({
    pages: z.array(z.object({ id: z.string(), title: z.string(), purpose: z.string().optional() })).default([]),
    roles: z.array(z.object({ key: z.string(), name: z.string(), purpose: z.string().optional() })).default([]),
    dataModel: z.array(z.object({ entity: z.string(), purpose: z.string().optional(), source: z.string().optional() })).default([]),
    integrations: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
  }).default({ pages: [], roles: [], dataModel: [], integrations: [], risks: [] }),
  definition: jsonObjectSchema.default({}),
  gaps: z.array(z.object({
    type: z.enum(["action", "data_source", "integration", "permission", "component", "other"]),
    key: z.string().optional(),
    description: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  })).default([]),
  recommendedActions: z.array(z.string()).default([]),
  quality: z.object({
    completeness: z.number().min(0).max(100).default(0),
    ux: z.number().min(0).max(100).default(0),
    security: z.number().min(0).max(100).default(0),
    data: z.number().min(0).max(100).default(0),
    integration: z.number().min(0).max(100).default(0),
  }).default({ completeness: 0, ux: 0, security: 0, data: 0, integration: 0 }),
});

type AiProposal = z.infer<typeof aiProposalSchema>;
type JsonObject = Record<string, unknown>;

const ALLOWED_BLOCK_TYPES = new Set(["hero", "text", "callout", "metrics", "list", "cards", "divider", "action_form"]);
const MOBILE_PRESET_VARIANTS = new Set([
  "hero:promo_banner",
  "cards:quick_actions",
  "cards:product_grid",
  "cards:product_detail",
  "list:history",
  "list:notifications",
  "list:profile_fields",
  "list:menu",
  "list:stores",
  "callout:empty_state",
  "metrics:savings",
]);
const PROFILE_ACTION_KEY = "viewer.profile.update";
const PROFILE_SOURCE_KEY = "viewer.profile";
const PROFILE_PAGE_ID = "profile";
const ACTION_KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown, maxItems = 50, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function canonicalProfilePage(): JsonObject {
  return {
    id: PROFILE_PAGE_ID,
    title: "Meu perfil",
    icon: "user",
    blocks: [
      {
        id: "profile-summary",
        type: "list",
        dataSources: [PROFILE_SOURCE_KEY],
        props: {
          title: "Meus dados",
          items: [
            { title: "Nome", body: "{{data.viewer.profile.displayName}}" },
            { title: "Telefone", body: "{{data.viewer.profile.phone}}" },
            { title: "Idioma", body: "{{data.viewer.profile.locale}}" },
          ],
        },
      },
      {
        id: "profile-update",
        type: "action_form",
        props: {
          actionKey: PROFILE_ACTION_KEY,
          title: "Atualizar meus dados",
          body: "Atualize seu nome, telefone ou idioma. O e-mail e os dados sensíveis da conta não são alterados por esta ação.",
          fields: [
            { name: "displayName", label: "Nome" },
            { name: "phone", label: "Telefone" },
            { name: "locale", label: "Idioma" },
          ],
          submitLabel: "Salvar alterações",
          successMessage: "Perfil atualizado com sucesso.",
        },
      },
    ],
  };
}

function normalizeRuntimeDefinition(
  definition: JsonObject,
  actionKeys: Set<string>,
  dataSourceKeys: Set<string>,
): JsonObject {
  const source = asObject(definition);
  const runtime = asObject(source.runtime);
  const rawPages = asObjects(runtime.pages);
  const canUseProfile = actionKeys.has(PROFILE_ACTION_KEY) && dataSourceKeys.has(PROFILE_SOURCE_KEY);

  const pages = rawPages
    .filter((page) => text(page.id) !== PROFILE_PAGE_ID)
    .map((page) => ({
      ...page,
      blocks: asObjects(page.blocks).flatMap((block) => {
        const props = asObject(block.props);
        if (text(block.type) === "action_form") {
          const actionKey = text(props.actionKey);
          if (!actionKey || !actionKeys.has(actionKey)) return [];
        }
        const requestedSources = stringArray(block.dataSources, 20, 100);
        const safeSources = requestedSources.filter((key) => dataSourceKeys.has(key));
        return [{
          ...block,
          ...(requestedSources.length > 0 ? { dataSources: safeSources } : {}),
        }];
      }),
    }));

  if (canUseProfile) pages.push(canonicalProfilePage());

  const requestedDefault = text(runtime.defaultPageId);
  const defaultPageId = requestedDefault && pages.some((page) => text(page.id) === requestedDefault)
    ? requestedDefault
    : text(pages[0]?.id) || "home";

  const referencedActions = new Set<string>();
  for (const page of pages) {
    for (const block of asObjects(page.blocks)) {
      if (text(block.type) !== "action_form") continue;
      const actionKey = text(asObject(block.props).actionKey);
      if (actionKey && actionKeys.has(actionKey)) referencedActions.add(actionKey);
    }
  }

  const settings = asObject(source.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const currentActions = asObject(runtimeAccess.actions);
  const existingAllowed = stringArray(currentActions.keys, 30, 100)
    .filter((key) => ACTION_KEY_PATTERN.test(key) && actionKeys.has(key));
  const allowedActionKeys = Array.from(new Set([...existingAllowed, ...referencedActions]));

  return {
    ...source,
    runtime: {
      ...runtime,
      version: 1,
      defaultPageId,
      pages,
    },
    settings: {
      ...settings,
      runtimeAccess: {
        ...runtimeAccess,
        actions: {
          ...currentActions,
          enabled: allowedActionKeys.length > 0,
          keys: allowedActionKeys,
        },
      },
    },
  };
}

function validateAiDefinition(definition: JsonObject, actionKeys: Set<string>, dataSourceKeys: Set<string>) {
  const findings: string[] = [];
  const runtime = asObject(definition.runtime);
  const pages = asObjects(runtime.pages);
  if (pages.length === 0) findings.push("A definição não possui páginas em runtime.pages.");
  const pageIds = pages.map((page) => text(page.id)).filter(Boolean);
  if (pageIds.length !== pages.length) findings.push("Todas as páginas precisam de id estável.");
  if (new Set(pageIds).size !== pageIds.length) findings.push("Existem IDs de página duplicados.");
  const defaultPageId = text(runtime.defaultPageId);
  if (defaultPageId && !pageIds.includes(defaultPageId)) findings.push("runtime.defaultPageId não aponta para uma página existente.");
  const emphasizedPages = pages.filter((page) => page.navigationEmphasis === true);
  if (emphasizedPages.length > 1) findings.push("A navegação mobile permite no máximo uma página com navigationEmphasis=true.");
  if (emphasizedPages.length > 0 && (pages.length < 3 || pages.length > 5)) findings.push("navigationEmphasis só pode ser usado quando a navegação principal tiver de 3 a 5 páginas.");

  for (const page of pages) {
    for (const block of asObjects(page.blocks)) {
      const type = text(block.type);
      if (!ALLOWED_BLOCK_TYPES.has(type)) findings.push(`Bloco não suportado: ${type || "sem tipo"}.`);
      const props = asObject(block.props);
      const variant = text(props.variant);
      if (variant && !MOBILE_PRESET_VARIANTS.has(`${type}:${variant}`)) findings.push(`Preset visual não suportado: ${type}:${variant}.`);
      if (type === "action_form") {
        const actionKey = text(props.actionKey);
        if (actionKey && !actionKeys.has(actionKey)) findings.push(`Action '${actionKey}' não existe no registry executável.`);
      }
      for (const sourceKey of stringArray(block.dataSources, 20, 100)) {
        if (!dataSourceKeys.has(sourceKey)) findings.push(`Data source '${sourceKey}' não existe no registry ativo.`);
      }
    }
  }

  const settings = asObject(definition.settings);
  const runtimeAccess = asObject(settings.runtimeAccess);
  const runtimeActions = asObject(runtimeAccess.actions);
  for (const actionKey of stringArray(runtimeActions.keys, 30, 100)) {
    if (!actionKeys.has(actionKey)) findings.push(`runtimeAccess contém Action indisponível: '${actionKey}'.`);
  }

  const hasProfilePage = pageIds.includes(PROFILE_PAGE_ID);
  const canUseProfile = actionKeys.has(PROFILE_ACTION_KEY) && dataSourceKeys.has(PROFILE_SOURCE_KEY);
  if (hasProfilePage && !canUseProfile) findings.push("A página Meu perfil exige viewer.profile e viewer.profile.update ativos.");
  if (canUseProfile && !hasProfilePage) findings.push("Os recursos reais de perfil estão ativos, mas a página Meu perfil não foi criada.");

  return findings;
}

function aiSystemPrompt() {
  return `Você é o ARQUITETO IA do VendorAI App Builder. Não é um assistente genérico. Atue simultaneamente como principal product architect, software architect, UX lead, data architect, security engineer e integration architect.

Projete ou revise apps empresariais operacionais prontos para produção. Pense em jornadas, exceções, papéis, dados, permissões, integrações, observabilidade, responsividade e evolução futura.

PADRÃO VISUAL OFICIAL — VENDORAI MOBILE V1
Todo app mobile deve seguir o Design System oficial sem copiar identidade de aplicativos usados como referência. Referências visuais servem apenas para extrair padrões de UX.
- Identidade do cliente: logo, cores, tipografia, imagens, conteúdo e tom são próprios de cada app. Nunca imponha uma paleta global fixa.
- Nunca reutilize nomes de empresas, pessoas, CPF, telefone, e-mail, endereço, fotos pessoais ou banners presentes em prints de referência. Em preview, use dados sintéticos e masque dados sensíveis.
- Respeite safe areas de iOS/Android. Header, status bar, bottom navigation e ações flutuantes jamais podem se sobrepor.
- Bottom navigation deve ter de 3 a 5 destinos. Uma ação central destacada é opcional e deve ter função semântica configurável para o segmento.
- Quando uma ação central fizer sentido, marque EXATAMENTE UMA página de runtime.pages com navigationEmphasis=true e use icon semântico. Não marque página central quando houver menos de 3 ou mais de 5 destinos principais.
- Exemplos de ação central: comprar, agendar, pedir orçamento, ofertas, QR, carteira ou outra ação principal do segmento. Não destaque uma página apenas por estética.
- Alvo de toque mínimo: 44x44 px. Use contraste adequado e nunca dependa apenas de cor para comunicar estado.
- Toda jornada crítica deve prever loading, empty, error, offline, success, unavailable, permission_denied e session_expired quando aplicáveis.
- Prefira skeleton a spinner solto para conteúdo estruturado.
- A IA organiza componentes oficiais do registry/runtime. Não invente componente visual executável; se faltar, registre como gap.
- Card, lista, busca, categoria, detalhe, perfil, notificações, histórico, ajuda, legal e localização devem seguir padrões reutilizáveis e consistentes.
- Não esconda a ação principal em menus de três pontos. Cada tela deve deixar claro o objetivo e o próximo passo.

CONTRATOS REAIS DOS BLOCOS
- hero: props.title obrigatório; use props.body para texto. Pode usar eyebrow, badge, imageUrl e align.
- text: use props.body obrigatório; title é opcional.
- callout: use props.body obrigatório; title e tone são opcionais.
- metrics: props.items deve ser lista de objetos {label,value,detail?}.
- list: props.items deve ser lista de objetos {title?,body?,label?}; nunca use strings soltas.
- cards: props.items deve ser lista de objetos {title,body?,badge?,imageUrl?}; nunca use description/content no lugar de body.
- action_form: só use actionKey realmente fornecida em registry.actions. Campos devem existir no inputSchema dessa Action.
- dataSources ficam no bloco como lista de chaves registradas, por exemplo dataSources:["viewer.profile"]. Bindings usam exatamente {{data.viewer.profile.campo}}.
- Nunca invente formulário, operation, endpoint, actionKey, data source ou permissão.

PERFIL REAL DO APP USER
- O contexto informa actions e dataSources ativos. Actions sem executorKey não são fornecidas e devem ser tratadas como inexistentes.
- Se, e somente se, registry.actions contiver viewer.profile.update E registry.dataSources contiver viewer.profile, o app deve ter a página id=profile, título "Meu perfil", com leitura por viewer.profile e edição por viewer.profile.update.
- viewer.profile.update altera somente displayName, phone e locale. Não ofereça alteração de e-mail, tenant, status, lead ou identidade de autenticação.
- Use bindings {{data.viewer.profile.displayName}}, {{data.viewer.profile.phone}} e {{data.viewer.profile.locale}}.
- Actions efetivamente usadas precisam estar em definition.settings.runtimeAccess.actions.keys; não coloque chaves fora do registry executável.
- Use somente requiredPermissions vindas do registry. Hoje os contratos reais incluem profile.write_self para viewer.profile.update e profile.crm.read_self para viewer.linked_contact.summary quando essa fonte CRM for usada.
- Se os recursos de perfil não existirem no registry, não crie a página, não crie action_form equivalente e não reporte um gap como se o recurso estivesse disponível.

Inclua em definition.designSystem uma declaração do padrão visual, no mínimo:
{
  "standard": "vendorai-mobile-v1",
  "principles": ["mobile-first", "safe-area", "accessible-touch", "brand-per-client", "privacy-by-default"],
  "theme": {
    "mode": "light|dark|system",
    "primary": "token configurável por cliente",
    "secondary": "token configurável por cliente",
    "background": "token semântico",
    "surface": "token semântico",
    "text": "token semântico",
    "mutedText": "token semântico",
    "border": "token semântico",
    "success": "token semântico",
    "warning": "token semântico",
    "danger": "token semântico"
  },
  "navigation": {
    "bottomItems": 3,
    "bottomItemsMax": 5,
    "centerAction": {"enabled": false, "purpose": "configurável conforme o app"}
  },
  "interaction": {"minTouchTarget": 44, "safeArea": true},
  "states": ["loading", "empty", "error", "offline", "success", "unavailable", "permission_denied", "session_expired"],
  "privacy": {"syntheticPreviewData": true, "maskSensitiveData": true}
}

PRESETS VISUAIS JÁ DISPONÍVEIS NO RUNTIME
Use props.variant somente nos pares abaixo. Eles são componentes oficiais do vendorai-mobile-v1 e funcionam dentro dos tipos de bloco existentes:
- hero + promo_banner: banner principal com imageUrl, eyebrow, title, body, ctaLabel e pageId opcional.
- metrics + savings: card de indicador principal com label, value e detail.
- cards + quick_actions: atalhos com items[{title,icon,pageId}].
- cards + product_grid: busca, categorias e grade responsiva com items[{title,brand,category,imageUrl,oldPrice,price,discount,expiry,pageId}]. Serve também para serviços/ofertas adaptando os rótulos.
- cards + product_detail: detalhe com imageUrl, brand, title, oldPrice, price, discount, expiry, body e actionLabel.
- list + history: histórico por período com items[{title,body,value,pageId}].
- list + notifications: central com items[{title,body,time,icon,unread}].
- list + profile_fields: perfil com avatarUrl, title, subtitle mascarado e items[{label,value,pageId}].
- list + menu: menu de conta/suporte/legal com items[{title,icon,pageId}] e version opcional.
- list + stores: unidades/localizações com busca e items[{title,address,status,distance,favorite,pageId}].
- callout + empty_state: estado vazio com icon,title,body,actionLabel,pageId.

COMPOSIÇÃO RECOMENDADA, NÃO OBRIGATÓRIA
- Home: promo_banner -> savings/metrics -> quick_actions -> conteúdo relevante.
- Catálogo/ofertas: product_grid.
- Detalhe: product_detail.
- Histórico/compras/agendamentos: history.
- Notificações: notifications.
- Perfil: profile_fields.
- Menu: menu.
- Unidades: stores.
- Sem resultados: empty_state.
Adapte nomes e conteúdo ao segmento. Não transforme todo app em e-commerce quando o negócio não for comércio.

REGRAS INEGOCIÁVEIS
1. Não invente capacidades executáveis. Actions, data sources, components e workflows disponíveis serão fornecidos no contexto. Se algo necessário não existir, registre em gaps; não finja que já existe.
2. Preserve tudo que estiver bom na definição atual quando o modo for revise/analyze. Nunca destrua customizações sem motivo explícito.
3. Gere definition compatível com runtime.version=1. Tipos de bloco permitidos: hero, text, callout, metrics, list, cards, divider, action_form.
4. action_form só pode usar actionKey existente no registry executável. Se a action necessária não existir, descreva-a em gaps.
5. Segurança por menor privilégio. Sempre pense em role, permission, dados sensíveis, ações críticas e separação de responsabilidades.
6. Mobile-first sem sacrificar desktop. Evite páginas gigantes; use navegação clara e fluxo por tarefa.
7. Diferencie dashboard, operação, consulta, configuração e administração.
8. Não publique. Sua saída sempre é uma proposta versionável para revisão humana.
9. Retorne SOMENTE JSON válido, sem markdown.
10. Para apps mobile, definition.designSystem.standard deve ser "vendorai-mobile-v1" e os dados de demonstração devem ser sintéticos.
11. Quando usar props.variant, use somente os presets oficiais listados acima; se outro componente for necessário, registre gap em vez de inventar variant.
12. Use navigationEmphasis=true em no máximo uma página e somente quando ela representar uma ação principal real do app.

FORMATO OBRIGATÓRIO
{"summary":"...","assumptions":[],"questions":[],"warnings":[],"architecture":{"pages":[{"id":"...","title":"...","purpose":"..."}],"roles":[{"key":"...","name":"...","purpose":"..."}],"dataModel":[{"entity":"...","purpose":"...","source":"registry|tenant|planned"}],"integrations":[],"risks":[]},"definition":{"designSystem":{"standard":"vendorai-mobile-v1","principles":[],"theme":{},"navigation":{},"interaction":{},"states":[],"privacy":{}},"settings":{"runtimeAccess":{"actions":{"enabled":false,"keys":[]}}},"runtime":{"version":1,"defaultPageId":"home","pages":[{"id":"home","title":"Início","icon":"home","navigationEmphasis":false,"blocks":[]}]}},"gaps":[{"type":"action|data_source|integration|permission|component|other","key":"opcional","description":"...","severity":"low|medium|high|critical"}],"recommendedActions":[],"quality":{"completeness":0,"ux":0,"security":0,"data":0,"integration":0}}

Os scores de quality devem ser rigorosos. Um app sem dados, permissões, integrações necessárias, estados de UX ou padrão visual consistente não merece nota alta.`;
}

function parseAiProposal(content: string): AiProposal {
  return aiProposalSchema.parse(JSON.parse(content) as unknown);
}

router.get("/admin/app-builder/portfolio", async (_req, res) => {
  const result = await db.execute(sql`
    SELECT a.id,
           a.tenant_id AS "tenantId",
           a.template_id AS "templateId",
           a.template_version_id AS "templateVersionId",
           a.name,
           a.slug,
           a.status,
           a.owner_type AS "ownerType",
           a.owner_name AS "ownerName",
           a.owner_email AS "ownerEmail",
           a.owner_company AS "ownerCompany",
           a.linked_tenant_at AS "linkedTenantAt",
           a.created_at AS "createdAt",
           a.updated_at AS "updatedAt",
           t.name AS "tenantName",
           t.tenant_code AS "tenantCode"
      FROM app_instances a
      LEFT JOIN tenants t ON t.id = a.tenant_id
     ORDER BY a.updated_at DESC
  `);
  res.json(result.rows);
});

router.get("/admin/app-builder/app-targets", async (_req, res) => {
  const tenants = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name, status: tenantsTable.status })
    .from(tenantsTable);
  const standalone = await db.execute(sql`
    SELECT id, owner_type AS "ownerType", owner_name AS "ownerName", owner_email AS "ownerEmail",
           owner_company AS "ownerCompany", name, slug, status, created_at AS "createdAt"
      FROM app_instances WHERE tenant_id IS NULL ORDER BY updated_at DESC
  `);
  res.json({ tenants, standalone: standalone.rows });
});

router.post("/admin/app-builder/standalone-apps", async (req, res) => {
  const parsed = standaloneCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const data = parsed.data;
  const [templateVersion] = await db
    .select({ id: appTemplateVersionsTable.id, templateId: appTemplateVersionsTable.templateId, status: appTemplateVersionsTable.status })
    .from(appTemplateVersionsTable)
    .where(eq(appTemplateVersionsTable.id, data.templateVersionId));
  if (!templateVersion || templateVersion.templateId !== data.templateId) return res.status(422).json({ error: "A versão informada não pertence ao template" });
  if (templateVersion.status !== "published") return res.status(422).json({ error: "Somente versões publicadas podem originar um app" });
  try {
    const result = await db.execute(sql`
      INSERT INTO app_instances (
        tenant_id, template_id, template_version_id, name, slug, status,
        theme, navigation, settings, white_label,
        owner_type, owner_name, owner_email, owner_company
      ) VALUES (
        NULL, ${data.templateId}, ${data.templateVersionId}, ${data.name}, ${data.slug}, 'draft',
        '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb,
        ${data.ownerType}, ${data.ownerName}, ${data.ownerEmail ?? null}, ${data.ownerCompany ?? null}
      )
      RETURNING id, tenant_id AS "tenantId", template_id AS "templateId",
                template_version_id AS "templateVersionId", name, slug, status,
                owner_type AS "ownerType", owner_name AS "ownerName",
                owner_email AS "ownerEmail", owner_company AS "ownerCompany",
                created_at AS "createdAt", updated_at AS "updatedAt"
    `);
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "23505") return res.status(409).json({ error: "Já existe um app com esse identificador" });
    throw error;
  }
});

router.post("/admin/app-builder/apps/:id/link-tenant", async (req, res) => {
  const parsed = linkTenantSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const appId = String(req.params.id);
  const tenantId = parsed.data.tenantId;
  const [tenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) return res.status(422).json({ error: "Tenant inválido" });
  const result = await db.execute(sql`
    UPDATE app_instances SET tenant_id = ${tenantId}, owner_type = 'tenant', linked_tenant_at = now(), updated_at = now()
     WHERE id = ${appId} AND tenant_id IS NULL
    RETURNING id, tenant_id AS "tenantId", name, slug, status,
              owner_type AS "ownerType", owner_name AS "ownerName",
              owner_company AS "ownerCompany", linked_tenant_at AS "linkedTenantAt"
  `);
  if (!result.rows[0]) return res.status(409).json({ error: "App não encontrado ou já vinculado a um tenant" });
  await db.execute(sql`UPDATE app_instance_versions SET tenant_id = ${tenantId} WHERE app_instance_id = ${appId} AND tenant_id IS NULL`);
  return res.json({ ...result.rows[0], tenantName: tenant.name });
});

router.post("/admin/app-builder/ai/architect", async (req, res) => {
  const parsed = aiArchitectRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const billingTenantId = typeof (req as any).user?.tenantId === "string" ? (req as any).user.tenantId : parsed.data.tenantId;
  if (!billingTenantId) return res.status(422).json({ error: "O SuperAdmin precisa estar associado a um tenant de cobrança para usar a IA." });

  const { mode, depth, request, templateId, tenantId, appContext, conversation } = parsed.data;
  let template: { id: string; name: string; slug: string; description: string | null; verticalId: string } | null = null;
  let vertical: { id: string; key: string; name: string } | null = null;
  let baseDefinition = parsed.data.currentDefinition ?? {};

  if (templateId) {
    [template] = await db.select({ id: appTemplatesTable.id, name: appTemplatesTable.name, slug: appTemplatesTable.slug, description: appTemplatesTable.description, verticalId: appTemplatesTable.verticalId })
      .from(appTemplatesTable).where(eq(appTemplatesTable.id, templateId)).limit(1);
    if (!template) return res.status(404).json({ error: "Template não encontrado" });
    [vertical] = await db.select({ id: appVerticalsTable.id, key: appVerticalsTable.key, name: appVerticalsTable.name })
      .from(appVerticalsTable).where(eq(appVerticalsTable.id, template.verticalId)).limit(1);
    if (!parsed.data.currentDefinition) {
      const [latest] = await db.select({ definition: appTemplateVersionsTable.definition })
        .from(appTemplateVersionsTable).where(eq(appTemplateVersionsTable.templateId, template.id))
        .orderBy(desc(appTemplateVersionsTable.version)).limit(1);
      baseDefinition = latest?.definition ?? {};
    }
  }

  let targetTenant: { id: string; name: string; vertical: string | null } | null = null;
  if (tenantId) {
    [targetTenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name, vertical: tenantsTable.vertical })
      .from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
    if (!targetTenant) return res.status(404).json({ error: "Tenant de contexto não encontrado" });
  }

  const [components, features, registeredActions, registeredDataSources, workflows, policies] = await Promise.all([
    db.select({ key: appComponentRegistryTable.key, name: appComponentRegistryTable.name, category: appComponentRegistryTable.category }).from(appComponentRegistryTable).where(eq(appComponentRegistryTable.status, "active")),
    db.select({ key: appFeatureRegistryTable.key, name: appFeatureRegistryTable.name, category: appFeatureRegistryTable.category }).from(appFeatureRegistryTable).where(eq(appFeatureRegistryTable.status, "active")),
    db.select({
      key: appActionRegistryTable.key,
      name: appActionRegistryTable.name,
      description: appActionRegistryTable.description,
      category: appActionRegistryTable.category,
      riskLevel: appActionRegistryTable.riskLevel,
      inputSchema: appActionRegistryTable.inputSchema,
      outputSchema: appActionRegistryTable.outputSchema,
      executorKey: appActionRegistryTable.executorKey,
      requiredPermissions: appActionRegistryTable.requiredPermissions,
      metadata: appActionRegistryTable.metadata,
    }).from(appActionRegistryTable).where(eq(appActionRegistryTable.status, "active")),
    db.select({
      key: appDataSourceRegistryTable.key,
      name: appDataSourceRegistryTable.name,
      description: appDataSourceRegistryTable.description,
      category: appDataSourceRegistryTable.category,
      executorKey: appDataSourceRegistryTable.executorKey,
      outputSchema: appDataSourceRegistryTable.outputSchema,
      requiredPermissions: appDataSourceRegistryTable.requiredPermissions,
      metadata: appDataSourceRegistryTable.metadata,
    }).from(appDataSourceRegistryTable).where(eq(appDataSourceRegistryTable.status, "active")),
    db.select({ key: appWorkflowRegistryTable.key, name: appWorkflowRegistryTable.name }).from(appWorkflowRegistryTable).where(eq(appWorkflowRegistryTable.status, "active")),
    template?.verticalId
      ? db.select({ key: appAiPoliciesTable.key, name: appAiPoliciesTable.name, riskLevel: appAiPoliciesTable.riskLevel, rules: appAiPoliciesTable.rules }).from(appAiPoliciesTable).where(and(eq(appAiPoliciesTable.status, "active"), eq(appAiPoliciesTable.verticalId, template.verticalId)))
      : db.select({ key: appAiPoliciesTable.key, name: appAiPoliciesTable.name, riskLevel: appAiPoliciesTable.riskLevel, rules: appAiPoliciesTable.rules }).from(appAiPoliciesTable).where(eq(appAiPoliciesTable.status, "active")),
  ]);

  const actions = registeredActions.filter((item) => Boolean(text(item.executorKey)));
  const dataSources = registeredDataSources.filter((item) => Boolean(text(item.executorKey)));
  const registry = { components, features, actions, dataSources, workflows, aiPolicies: policies };
  const compactContext = { mode, target: targetTenant ?? appContext ?? { ownerType: "internal" }, template, vertical, currentDefinition: baseDefinition, registry };
  const historyText = conversation.length ? `\nHISTÓRICO:\n${conversation.map((item) => `${item.role.toUpperCase()}: ${item.content}`).join("\n")}` : "";

  const first = await callOpenAI(billingTenantId, "intelligence_analysis", [
    { role: "system", content: aiSystemPrompt() },
    { role: "user", content: `CONTEXTO DO APP BUILDER:\n${JSON.stringify(compactContext)}${historyText}\n\nSOLICITAÇÃO ATUAL:\n${request}` },
  ], { model: "gpt-4.1", temperature: 0.2, maxTokens: depth === "deep" ? 10000 : 6500, responseFormat: { type: "json_object" } });

  let proposal: AiProposal;
  try { proposal = parseAiProposal(first.content); }
  catch { return res.status(502).json({ error: "A IA retornou uma arquitetura inválida. Tente novamente." }); }

  const actionKeys = new Set(actions.map((item) => item.key));
  const dataSourceKeys = new Set(dataSources.map((item) => item.key));
  proposal.definition = normalizeRuntimeDefinition(proposal.definition, actionKeys, dataSourceKeys);
  let findings = validateAiDefinition(proposal.definition, actionKeys, dataSourceKeys);
  let usage = { inputTokens: first.inputTokens, outputTokens: first.outputTokens, costUsd: first.costUsd, passes: 1 };

  if (depth === "deep") {
    const second = await callOpenAI(billingTenantId, "intelligence_analysis", [
      { role: "system", content: `${aiSystemPrompt()}\n\nSEGUNDA PASSAGEM: aja como revisor crítico independente. Procure falhas de produto, UX, segurança, dados, permissões, integrações, IDs, navegação, safe area, estados de tela, privacidade e compatibilidade com registries. Corrija o projeto e devolva a proposta FINAL, não apenas comentários.` },
      { role: "user", content: `CONTEXTO ORIGINAL:\n${JSON.stringify(compactContext)}\n\nSOLICITAÇÃO:\n${request}\n\nCANDIDATO:\n${JSON.stringify(proposal)}\n\nACHADOS DO VALIDADOR:\n${JSON.stringify(findings)}` },
    ], { model: "gpt-4.1", temperature: 0.1, maxTokens: 10000, responseFormat: { type: "json_object" } });
    try {
      proposal = parseAiProposal(second.content);
      proposal.definition = normalizeRuntimeDefinition(proposal.definition, actionKeys, dataSourceKeys);
      findings = validateAiDefinition(proposal.definition, actionKeys, dataSourceKeys);
      usage = { inputTokens: first.inputTokens + second.inputTokens, outputTokens: first.outputTokens + second.outputTokens, costUsd: first.costUsd + second.costUsd, passes: 2 };
    } catch {
      proposal.warnings.push("A segunda passagem não pôde ser validada; foi mantida a proposta da primeira passagem.");
    }
  }

  if (findings.length) proposal.warnings.push(...findings.map((item) => `Validador: ${item}`));
  return res.json({ proposal, validation: { ok: findings.length === 0, findings }, usage, context: { templateId: template?.id ?? null, tenantId: targetTenant?.id ?? null, vertical: vertical?.name ?? targetTenant?.vertical ?? null, depth, mode } });
});

export default router;
