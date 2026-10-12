import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  tenantsTable,
  tenantNavModulesTable,
  usersTable,
  NAV_MODULE_CATALOG,
  type NavModuleKey,
} from "@workspace/db";
import { requireRole } from "./index.js";
import { getTenantCommercialAccess } from "../middlewares/commercialProductAccess.js";

const router: IRouter = Router();

function routeTenantId(req: any): string {
  // tenant-audit: reviewed route tenant is consumed only by handlers/middleware that enforce same-tenant or super-admin access before tenant-scoped data access.
  return String(req.params.tenantId ?? req.params["tenantId"]);
}
const ERP_MODULE_KEY: NavModuleKey = "financeiro";
const PRACA_AI_MODULE_KEY: NavModuleKey = "praca_ai";
const SUPERADMIN_ONLY_MODULE_KEYS = new Set<NavModuleKey>([
  ERP_MODULE_KEY,
  PRACA_AI_MODULE_KEY,
]);
const EFFECTIVE_DEFAULT_OFF_MODULE_KEYS = new Set<NavModuleKey>([
  ERP_MODULE_KEY,
  PRACA_AI_MODULE_KEY,
]);

function normalizeVertical(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isArqdorEligibleVertical(vertical: string | null | undefined) {
  const normalized = normalizeVertical(vertical);
  if (!normalized) return false;

  return (
    normalized === "construcao & reforma" ||
    normalized === "arquitetura" ||
    normalized === "arquitetura & design" ||
    normalized === "obras" ||
    normalized.includes("construtora") ||
    normalized.includes("construcao") ||
    normalized.includes("gestao de obras") ||
    normalized.includes("marcenaria") ||
    normalized.includes("fabrica de moveis") ||
    normalized.includes("moveis planejados") ||
    normalized.includes("moveis sob medida") ||
    normalized.includes("industria de moveis") ||
    normalized.includes("designer de interiores") ||
    normalized.includes("design de interiores")
  );
}

// As quatro listas abaixo espelham EXATAMENTE o VERTICAL_BUCKET de
// SidebarLayoutLegacy.tsx (buckets "varejo", "supermercado", "salao",
// "clinica") — fonte única de verdade é o frontend; mantemos essa cópia em
// sincronia manual até existir um pacote compartilhado de mapeamento de
// vertical. Alterar um lado sem o outro reintroduz a divergência que este
// alinhamento corrige.
const VAREJO_VERTICALS = new Set(
  [
    "Varejo de Roupas & Acessórios",
    "Varejo de Eletroeletrônicos",
    "Varejo de Decoração, Variedades & Utilidades",
    "Bebês e Crianças",
    "Esportes e Lazer",
    "Automotivo — Acessórios e Som",
    "Papelaria e Livraria",
    "Joias, Relógios e Óticas",
    "Calçados",
    "Móveis",
    "Cama, Mesa e Banho",
    "Brinquedos",
    "Instrumentos Musicais",
    "Perfumaria e Cosméticos",
    "Floricultura",
    "Adega e Bebidas",
    "Produtos Naturais e Suplementos",
    "Armarinho e Tecidos",
    "Papelaria Criativa e Artesanato",
    "Games e Informática",
    "Pet Shop (Varejo)",
    "Material de Construção — Varejo",
  ].map(normalizeVertical)
);
const SUPERMERCADO_VERTICALS = new Set(["Supermercado"].map(normalizeVertical));
const SALAO_VERTICALS = new Set(
  [
    "Salão de Beleza",
    "Barbearia",
    // Bloco 1 da proposta de agrupamento (17/09): nichos "core" com o
    // mesmo padrão de agenda + profissional + serviço de preço fixo, sem
    // visita técnica — encaixam no bucket "salao" já existente, sem
    // precisar de tela nova.
    "Academia / Personal Trainer",
    "Estúdio de Pilates / Yoga",
    "Escolinha Esportiva / Artes Marciais",
    "Nutricionista",
    "Escola de Idiomas",
    "Creche / Berçário",
    "Hospedagem/Creche Pet",
    "Adestramento",
  ].map(normalizeVertical)
);
const CLINICA_VERTICALS = new Set(
  [
    "Clínica",
    // Bloco 2 da proposta de agrupamento (17/09): agenda + profissional de
    // saúde, mais próximos de atendimento clínico do que de salão.
    "Odontologia",
    "Óptica",
  ].map(normalizeVertical)
);
// Pet Shop usa o catálogo de Varejo E as telas de Salão (banho & tosa) ao
// mesmo tempo — mesma exceção que já existe no frontend (isSalao).
const PET_SHOP_VERTICAL = normalizeVertical("Pet Shop (Varejo)");

function isVarejoEligibleVertical(vertical: string | null | undefined) {
  return VAREJO_VERTICALS.has(normalizeVertical(vertical));
}
function isSupermercadoEligibleVertical(vertical: string | null | undefined) {
  return SUPERMERCADO_VERTICALS.has(normalizeVertical(vertical));
}
function isSalaoEligibleVertical(vertical: string | null | undefined) {
  const normalized = normalizeVertical(vertical);
  return SALAO_VERTICALS.has(normalized) || normalized === PET_SHOP_VERTICAL;
}
function isClinicaEligibleVertical(vertical: string | null | undefined) {
  return CLINICA_VERTICALS.has(normalizeVertical(vertical));
}

function superAdminOnlyModuleMessage(moduleKey: string) {
  if (moduleKey === PRACA_AI_MODULE_KEY) {
    return "Os módulos do Praça.AI ficam ocultos por padrão e só podem ser liberados pelo Super Admin.";
  }
  return "A Gestão ERP é um add-on pago e só pode ser ativada pelo Super Admin.";
}

// ── POST /tenants/:tenantId/apply-light-plan-defaults ───────────────────────
// Aplica as restrições de tela do plano Light: sem Revenue Scout ("revenue",
// já é isDefault:false, não precisa de override), sem Agenda ("scheduler",
// que é isDefault:true — precisa de override explícito pra desligar).
// Chamado na provisão de um tenant no plano Light, ou manualmente por admin.
router.post("/tenants/:tenantId/apply-light-plan-defaults", requireRole("tenant_admin", "super_admin"), async (req, res) => {
  const tenantId = routeTenantId(req);
  const user = (req as any).user;

  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .insert(tenantNavModulesTable)
    .values({ tenantId, moduleKey: "scheduler", isEnabled: false } as any)
    .onConflictDoUpdate({
      target: [tenantNavModulesTable.tenantId, tenantNavModulesTable.moduleKey],
      set: { isEnabled: false, updatedAt: new Date() },
    });

  res.json({ applied: true, disabledModules: ["scheduler"], note: "'revenue' já vem desligado por padrão (isDefault: false)." });
});

// ── GET /tenants/:tenantId/nav-modules ──────────────────────────────────────
// Retorna o catálogo completo de módulos com o estado is_enabled do tenant.
// Módulos sem override usam o default do catálogo. Entitlements comerciais ou
// exclusivos do Super Admin (ERP e Praça.AI) têm o default false efetivo mesmo
// sem linha persistida, garantindo que tenants atuais e futuros não recebam
// acesso automaticamente. O Arqdor.ai usa um default segmentado: fica ligado
// automaticamente apenas para verticais de obras/construção, arquitetura,
// design de interiores e fabricação/marcenaria de móveis.
router.get("/tenants/:tenantId/nav-modules", async (req, res) => {
  const tenantId = routeTenantId(req);
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [tenant] = await db
    .select({ vertical: tenantsTable.vertical, verticalSecundaria: tenantsTable.verticalSecundaria })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  // Vertical secundária conta igual à principal pra elegibilidade de
  // módulo — um tenant "Padaria" com secundária "Confeitaria / Doceria"
  // deve ganhar os módulos de ambas, não só da primeira.
  const arqdorEligible = isArqdorEligibleVertical(tenant?.vertical) || isArqdorEligibleVertical(tenant?.verticalSecundaria);
  const obrasEligible = arqdorEligible;
  const varejoEligible = isVarejoEligibleVertical(tenant?.vertical) || isVarejoEligibleVertical(tenant?.verticalSecundaria);
  const supermercadoEligible = isSupermercadoEligibleVertical(tenant?.vertical) || isSupermercadoEligibleVertical(tenant?.verticalSecundaria);
  const salaoEligible = isSalaoEligibleVertical(tenant?.vertical) || isSalaoEligibleVertical(tenant?.verticalSecundaria);
  const clinicaEligible = isClinicaEligibleVertical(tenant?.vertical) || isClinicaEligibleVertical(tenant?.verticalSecundaria);
  const VERTICAL_GATED_ELIGIBILITY: Partial<Record<NavModuleKey, boolean>> = {
    arch: arqdorEligible,
    obras: obrasEligible,
    varejo: varejoEligible,
    supermercado: supermercadoEligible,
    beauty: salaoEligible,
    clinic: clinicaEligible,
  };

  const [overrides, commercialAccess] = await Promise.all([
    db
      .select({ moduleKey: tenantNavModulesTable.moduleKey, isEnabled: tenantNavModulesTable.isEnabled })
      .from(tenantNavModulesTable)
      .where(eq(tenantNavModulesTable.tenantId, tenantId)),
    getTenantCommercialAccess(tenantId),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o.moduleKey, o.isEnabled]));

  const modules = NAV_MODULE_CATALOG.map((entry) => {
    const hasPersistedOverride = overrideMap.has(entry.moduleKey);
    const hasEffectiveDefaultOff = EFFECTIVE_DEFAULT_OFF_MODULE_KEYS.has(entry.moduleKey);
    const persistedValue = hasPersistedOverride ? overrideMap.get(entry.moduleKey)! : undefined;
    const verticalEligible = VERTICAL_GATED_ELIGIBILITY[entry.moduleKey];
    const isVerticalGated = verticalEligible !== undefined;

    const legacyDefaultEnabled = isVerticalGated ? verticalEligible! : entry.isDefault;
    const commerciallyEntitled =
      commercialAccess.moduleKeys.has(entry.moduleKey) ||
      (commercialAccess.fullPackageActive && legacyDefaultEnabled);

    const isEnabled = commerciallyEntitled
      ? (hasPersistedOverride ? persistedValue! : true)
      : false;

    return {
      moduleKey:   entry.moduleKey,
      moduleName:  entry.moduleName,
      icon:        entry.icon,
      description: entry.description,
      isDefault:   legacyDefaultEnabled,
      commerciallyEntitled,
      accessSource: commercialAccess.fullPackageActive
        ? "full_package"
        : (commerciallyEntitled ? "individual_product" : "not_purchased"),
      // Escolha explícita do tenant sempre vence sobre o padrão da vertical
      // — a vertical só decide o que vem ligado/desligado quando ninguém
      // mexeu no toggle ainda. Um admin que ligou/desligou manualmente
      // (ex: Shopping da Piscina usando Varejo mesmo fora da lista de
      // verticais elegíveis) não pode ser silenciosamente sobrescrito.
      isEnabled,
      // Billing entitlement is authoritative. Persisted switches may further
      // restrict a purchased module, but can never unlock an unpurchased one.
      hasOverride: hasPersistedOverride || hasEffectiveDefaultOff || !commerciallyEntitled,
    };
  });

  res.json(modules);
});

// A TAD usa a autorização REAL do usuário além da habilitação comercial do tenant.
// Chaves sem equivalência validada com as permissões legadas não são liberadas.
const TAD_USER_PERMISSION_MAP: Record<string, readonly string[]> = {
  leads: ["leads", "deals"],
  campaigns: ["content"],
  content: ["content"],
  scheduler: ["agenda"],
  settings: ["team"],
  analytics: ["analytics"],
  financeiro: ["erp"],
};
router.get("/tenants/:tenantId/tad-effective-modules", async (req, res) => {
  const tenantId = routeTenantId(req);
  const current = req.user;
  if (!current) return res.status(401).json({ error: "Unauthorized" });
  if (current.platformRole !== "super_admin" && current.tenantId !== tenantId) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const [row] = await db.select({ permissions: usersTable.permissions })
    .from(usersTable)
    .where(and(eq(usersTable.id, current.sub), eq(usersTable.tenantId, tenantId)))
    .limit(1);
  if (!row && current.platformRole !== "super_admin") {
    return res.status(403).json({ error: "User not found in tenant" });
  }
  const admin = current.platformRole === "super_admin" ||
    current.platformRole === "tenant_admin" || current.userFunction === "administrador";
  const grants = row?.permissions;
  const keys = NAV_MODULE_CATALOG.map(m => m.moduleKey).filter(key => {
    if (admin) return true;
    const accepted = TAD_USER_PERMISSION_MAP[key];
    return !!accepted && Array.isArray(grants) && accepted.some(permission => grants.includes(permission));
  });
  return res.json({ permittedModuleKeys: keys });
});

// ── PATCH /tenants/:tenantId/nav-modules/:moduleKey ─────────────────────────
// Liga/desliga um módulo específico. Gestão ERP e Praça.AI são controles
// exclusivos do Super Admin.
router.patch("/tenants/:tenantId/nav-modules/:moduleKey", requireRole("tenant_admin", "super_admin"), async (req, res) => {
  const tenantId = routeTenantId(req);
  const moduleKey = req.params.moduleKey as string;
  const user = (req as any).user;

  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (SUPERADMIN_ONLY_MODULE_KEYS.has(moduleKey as NavModuleKey) && user.platformRole !== "super_admin") {
    res.status(403).json({
      error: moduleKey === PRACA_AI_MODULE_KEY ? "PRACA_AI_SUPERADMIN_REQUIRED" : "ERP_ADDON_ADMIN_REQUIRED",
      message: superAdminOnlyModuleMessage(moduleKey),
    });
    return;
  }

  const { isEnabled } = req.body;
  if (typeof isEnabled !== "boolean") {
    res.status(400).json({ error: "isEnabled deve ser boolean" });
    return;
  }

  const validKey = NAV_MODULE_CATALOG.find((m) => m.moduleKey === moduleKey);
  if (!validKey) {
    res.status(400).json({ error: `moduleKey inválido: ${moduleKey}` });
    return;
  }

  await db
    .insert(tenantNavModulesTable)
    .values({ tenantId, moduleKey: moduleKey as NavModuleKey, isEnabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [tenantNavModulesTable.tenantId, tenantNavModulesTable.moduleKey],
      set: { isEnabled, updatedAt: new Date() },
    });

  req.log.info({ tenantId, moduleKey, isEnabled }, "nav-module toggled");
  res.json({ success: true });
});

// ── PUT /tenants/:tenantId/nav-modules ──────────────────────────────────────
// Atualização em lote: body = Array<{ moduleKey, isEnabled }>
router.put("/tenants/:tenantId/nav-modules", requireRole("tenant_admin", "super_admin"), async (req, res) => {
  const tenantId = routeTenantId(req);
  const user = (req as any).user;

  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { modules } = req.body;
  if (!Array.isArray(modules)) {
    res.status(400).json({ error: "modules deve ser um array" });
    return;
  }

  const restrictedModule = modules.find((mod: any) => SUPERADMIN_ONLY_MODULE_KEYS.has(mod?.moduleKey));
  if (user.platformRole !== "super_admin" && restrictedModule) {
    const moduleKey = restrictedModule.moduleKey as string;
    res.status(403).json({
      error: moduleKey === PRACA_AI_MODULE_KEY ? "PRACA_AI_SUPERADMIN_REQUIRED" : "ERP_ADDON_ADMIN_REQUIRED",
      message: superAdminOnlyModuleMessage(moduleKey),
    });
    return;
  }

  const validKeys = new Set(NAV_MODULE_CATALOG.map((m) => m.moduleKey));

  for (const mod of modules) {
    const { moduleKey, isEnabled } = mod as { moduleKey: string; isEnabled: boolean };
    if (!validKeys.has(moduleKey as NavModuleKey) || typeof isEnabled !== "boolean") continue;

    await db
      .insert(tenantNavModulesTable)
      .values({ tenantId, moduleKey: moduleKey as NavModuleKey, isEnabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [tenantNavModulesTable.tenantId, tenantNavModulesTable.moduleKey],
        set: { isEnabled, updatedAt: new Date() },
      });
  }

  req.log.info({ tenantId, count: modules.length }, "nav-modules bulk updated");
  res.json({ success: true });
});

// ── GET /nav-modules/catalog ─────────────────────────────────────────────────
// Catálogo global de módulos (sem autenticação de tenant específico).
router.get("/nav-modules/catalog", async (req, res) => {
  res.json(NAV_MODULE_CATALOG);
});


// Experimental Arqdor CPU laboratory: fail closed for every tenant by default.
// A server-side environment opt-in AND super-admin identity are both mandatory.
// Tenant-admin and regular users cannot enable access through client-side flags.
router.get("/tenants/:tenantId/arqdor-cpu-render-access", async (req, res) => {
  const tenantId = routeTenantId(req);
  const user = (req as any).user;
  if (!user) { res.status(401).json({ enabled: false }); return; }
  if (user.platformRole !== "super_admin" && user.tenantId !== tenantId) {
    res.status(403).json({ enabled: false }); return;
  }
  const enabled = user.platformRole === "super_admin" &&
    process.env.ARQDOR_EXPERIMENTAL_CPU_RENDER === "true";
  res.setHeader("Cache-Control", "no-store");
  res.json({ enabled });
});

export default router;
