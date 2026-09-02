from pathlib import Path

# FRONTEND
front = Path('artifacts/frontend/src/pages/SiteGenerator.tsx')
text = front.read_text()
text = text.replace(
    'import { getGetBusinessProfileByTenantQueryKey, useGetBusinessProfileByTenant, useRequestUploadUrl } from "@workspace/api-client-react";',
    'import { useRequestUploadUrl } from "@workspace/api-client-react";',
)
text = text.replace(
    'async function resilientFetch(url: string, init: RequestInit = {}, maxAttempts = 9): Promise<Response> {',
    'async function resilientFetch(url: string, init: RequestInit = {}, maxAttempts = 3): Promise<Response> {',
)
old = '  const { user, token } = useAuth(); const tenantId = user?.tenantId ?? ""; const { toast } = useToast(); const uploadHook = useRequestUploadUrl();'
new = '  const { user, token, tenantOverride } = useAuth(); const tenantId = user?.tenantId ?? ""; const { toast } = useToast(); const uploadHook = useRequestUploadUrl();'
assert old in text
text = text.replace(old, new, 1)
old = '  const [market, setMarket] = useState<{ tone?: string; keywords: Keyword[]; competitors: string[] } | null>(null); const [marketBusy, setMarketBusy] = useState(false); const [aiBusiness, setAiBusiness] = useState<AiBusinessSuggestions | null>(null); const [aiBusinessBusy, setAiBusinessBusy] = useState(false); const aiBusinessKey = useRef("");'
new = '  const [market, setMarket] = useState<{ tone?: string; keywords: Keyword[]; competitors: string[] } | null>(null); const [marketBusy, setMarketBusy] = useState(false); const [aiBusiness, setAiBusiness] = useState<AiBusinessSuggestions | null>(null); const [aiBusinessBusy, setAiBusinessBusy] = useState(false); const [bp, setBp] = useState<any>(null); const aiBusinessKey = useRef(""); const aiBusinessFailedUntil = useRef(0);'
assert old in text
text = text.replace(old, new, 1)
old = '''  const init = useRef(false); const defaults = useRef("");
  const { data: bp } = useGetBusinessProfileByTenant(tenantId, { query: { queryKey: getGetBusinessProfileByTenantQueryKey(tenantId), enabled: !!tenantId && !editor } });
  const rawProfile = (bp ?? {}) as any; const profileName = bp?.nomeFantasia ?? bp?.razaoSocial ?? rawProfile.nome ?? ""; const profileSector = bp?.vertical ?? rawProfile.segmento ?? rawProfile.setor ?? ""; const profileDesc = rawProfile.descricaoNegocio ?? rawProfile.descricao ?? rawProfile.sobreEmpresa ?? bp?.diferenciais ?? bp?.publicoAlvo ?? ""; const phone = bp?.telefone ?? rawProfile.whatsapp ?? ""; const logo = bp?.logoUrl ?? ""; const modeDef = MODES.find((m) => m.id === mode)!; const objective = OBJECTIVES.find((o) => o.id === objectiveId)!;
  useEffect(() => { if (!bp || init.current) return; init.current = true; setName(profileName); setSector(profileSector); setDesc(profileDesc); setAudience(bp?.publicoAlvo ?? ""); }, [bp, profileName, profileSector, profileDesc]);'''
new = '''  const init = useRef(false); const defaults = useRef("");
  useEffect(() => {
    if (!tenantId || editor) return;
    let cancelled = false;
    void resilientFetch(`/api/tenants/${tenantId}/site-generator/business-context`, { headers: headers(token), cache: "no-store" }, 2)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setBp(body.profile ?? null);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [tenantId, token, editor]);
  const rawProfile = (bp ?? {}) as any; const profileName = bp?.nomeFantasia ?? bp?.razaoSocial ?? rawProfile.nome ?? tenantOverride?.name ?? ""; const profileSector = bp?.vertical ?? rawProfile.segmento ?? rawProfile.setor ?? tenantOverride?.vertical ?? ""; const profileDesc = rawProfile.descricaoNegocio ?? rawProfile.descricao ?? rawProfile.sobreEmpresa ?? bp?.diferenciais ?? bp?.publicoAlvo ?? ""; const phone = bp?.telefone ?? rawProfile.whatsapp ?? rawProfile.displayPhoneNumber ?? ""; const logo = bp?.logoUrl ?? tenantOverride?.logoUrl ?? ""; const logoForSite = logo ? (logo.startsWith("http://") || logo.startsWith("https://") ? logo : logo.startsWith("/objects/") ? `${window.location.origin}/api/storage${logo}` : logo.startsWith("/") ? `${window.location.origin}${logo}` : logo) : ""; const modeDef = MODES.find((m) => m.id === mode)!; const objective = OBJECTIVES.find((o) => o.id === objectiveId)!;
  useEffect(() => { if (!bp || init.current) return; init.current = true; setName(profileName); setSector(profileSector); setDesc(profileDesc); setAudience(bp?.publicoAlvo ?? ""); }, [bp, profileName, profileSector, profileDesc]);'''
assert old in text
text = text.replace(old, new, 1)
old = '''  async function loadAiBusinessSuggestions(force = false) {
    if (!tenantId || editor || aiBusinessBusy) return;
    const contextKey = `${tenantId}:${mode}:${profileName}:${profileSector}:${profileDesc}:${catalog.length}`;
    if (!force && aiBusinessKey.current === contextKey) return;
    aiBusinessKey.current = contextKey;
    setAiBusinessBusy(true);
    try {
      const response = await resilientFetch(`/api/tenants/${tenantId}/site-generator/briefing-suggestions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ creationMode: mode }),
      }, 4);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Não foi possível analisar o perfil (${response.status})`);
      setAiBusiness({ audiences: Array.isArray(body.audiences) ? body.audiences : [], offers: Array.isArray(body.offers) ? body.offers : [] });
    } catch (error) {
      if (force) toast({ title: "Não foi possível atualizar as sugestões", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setAiBusinessBusy(false);
    }
  }

  useEffect(() => {
    if (editor || !tenantId || (!bp && !catalog.length)) return;
    const timer = window.setTimeout(() => { void loadAiBusinessSuggestions(false); }, 700);
    return () => window.clearTimeout(timer);
  }, [tenantId, mode, bp, catalog.length, editor]);'''
new = '''  async function loadAiBusinessSuggestions(force = false) {
    if (!tenantId || editor || aiBusinessBusy) return;
    const contextKey = `${tenantId}:${mode}:${profileName}:${profileSector}:${profileDesc}:${catalog.length}`;
    if (!force && (aiBusinessKey.current === contextKey || Date.now() < aiBusinessFailedUntil.current)) return;
    aiBusinessKey.current = contextKey;
    setAiBusinessBusy(true);
    try {
      const response = await resilientFetch(`/api/tenants/${tenantId}/site-generator/briefing-suggestions`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({ creationMode: mode }),
      }, 1);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Não foi possível analisar o perfil (${response.status})`);
      aiBusinessFailedUntil.current = 0;
      setAiBusiness({ audiences: Array.isArray(body.audiences) ? body.audiences : [], offers: Array.isArray(body.offers) ? body.offers : [] });
    } catch (error) {
      aiBusinessFailedUntil.current = Date.now() + 60_000;
      if (force) toast({ title: "Sugestões de IA temporariamente indisponíveis", description: "As sugestões do perfil e do catálogo continuam disponíveis e não bloqueiam a geração." });
    } finally {
      setAiBusinessBusy(false);
    }
  }

  useEffect(() => {
    if (editor || !tenantId || (!profileName && !profileSector && !catalog.length)) return;
    const timer = window.setTimeout(() => { void loadAiBusinessSuggestions(false); }, 900);
    return () => window.clearTimeout(timer);
  }, [tenantId, mode, profileName, profileSector, profileDesc, catalog.length, editor]);'''
assert old in text
text = text.replace(old, new, 1)
old = 'tone, cta: objective.cta, color: "#6366F1", products: productData, whatsapp: phone, images:'
new = 'tone, cta: objective.cta, color: "#6366F1", logoUrl: logoForSite, products: productData, whatsapp: phone, images:'
assert old in text
text = text.replace(old, new, 1)
old = 'src={logo.startsWith("/objects/") ? `/api/storage${logo}` : logo}'
new = 'src={logoForSite || logo}'
assert old in text
text = text.replace(old, new, 1)
front.write_text(text)

# SITE GENERATOR BACKEND
server = Path('artifacts/api-server/src/routes/site_generator.ts')
text = server.read_text()
old = '''  produtosCatalogoTable,
  webBehaviorEventsTable,'''
new = '''  produtosCatalogoTable,
  tenantsTable,
  whatsappConnectionsTable,
  webBehaviorEventsTable,'''
assert old in text
text = text.replace(old, new, 1)
old = '''  return true;
}

function cleanText'''
new = r'''  return true;
}

async function loadSiteGeneratorBusinessContext(tenantId: string) {
  const [tenantResult, profileResult, whatsappResult] = await Promise.allSettled([
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      nomeEmpresa: tenantsTable.nomeEmpresa,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      logoUrl: tenantsTable.logoUrl,
      site: tenantsTable.site,
      descricao: tenantsTable.descricao,
      updatedAt: tenantsTable.updatedAt,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
      businessName: whatsappConnectionsTable.businessName,
      isDefault: whatsappConnectionsTable.isDefault,
      status: whatsappConnectionsTable.status,
      updatedAt: whatsappConnectionsTable.updatedAt,
    }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
      .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
      .limit(1),
  ]);
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;
  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    telefone: profile?.telefone || whatsapp?.displayPhoneNumber || null,
    descricao: tenant?.descricao || null,
    site: tenant?.site || null,
    displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
  } : null;
  return {
    profile: mergedProfile,
    sources: {
      tenant: tenantResult.status === "fulfilled" && Boolean(tenant),
      businessProfile: profileResult.status === "fulfilled" && Boolean(profile),
      whatsapp: whatsappResult.status === "fulfilled" && Boolean(whatsapp),
    },
    degraded: [tenantResult, profileResult, whatsappResult].some((result) => result.status === "rejected"),
  };
}

function cleanText'''
assert old in text
text = text.replace(old, new, 1)
marker = 'const briefingSuggestionsSchema = z.object({ creationMode: z.string().trim().max(40).optional() });'
route = r'''router.get("/tenants/:tenantId/site-generator/business-context", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!hasAccess(req, res, tenantId)) return;
  try {
    const context = await loadSiteGeneratorBusinessContext(tenantId);
    res.setHeader("Cache-Control", "no-store");
    res.json(context);
  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/business-context: contexto degradado");
    res.status(200).json({ profile: null, sources: { tenant: false, businessProfile: false, whatsapp: false }, degraded: true });
  }
});

'''
assert marker in text
text = text.replace(marker, route + marker, 1)
old = '''    const [[profile], products] = await Promise.all([
      db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
      db.select().from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)).limit(40),
    ]);
    if (!profile && products.length === 0) {
      res.json({ audiences: [], offers: [], source: "empty" });
      return;
    }

    const safeProfile = profile
      ? Object.fromEntries(Object.entries(profile as Record<string, unknown>).filter(([key, value]) => {'''
new = '''    const [contextResult, productsResult] = await Promise.allSettled([
      loadSiteGeneratorBusinessContext(tenantId),
      db.select().from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId)).limit(40),
    ]);
    const context = contextResult.status === "fulfilled" ? contextResult.value : { profile: null, sources: { tenant: false, businessProfile: false, whatsapp: false }, degraded: true };
    const profile = context.profile as Record<string, unknown> | null;
    const products = productsResult.status === "fulfilled" ? productsResult.value : [];
    if (!profile && products.length === 0) {
      res.json({ audiences: [], offers: [], source: "empty", degraded: true });
      return;
    }

    const safeProfile = profile
      ? Object.fromEntries(Object.entries(profile as Record<string, unknown>).filter(([key, value]) => {'''
assert old in text
text = text.replace(old, new, 1)
old = '''  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/briefing-suggestions: falhou");
    res.status(502).json({ error: "Não foi possível gerar sugestões agora. O briefing manual e as sugestões locais continuam disponíveis." });
  }
});'''
new = '''  } catch (err) {
    req.log?.warn({ err, tenantId }, "site-generator/briefing-suggestions: usando fallback local");
    try {
      const context = await loadSiteGeneratorBusinessContext(tenantId);
      const profile = (context.profile ?? {}) as Record<string, any>;
      const audiences = [profile.publicoAlvo, profile.discoveryData?.publicoAlvo, profile.discoveryData?.clienteIdeal]
        .flatMap((value) => typeof value === "string" ? value.split(/\\n|;|\\||•/g) : [])
        .map((value) => ({ value: value.trim().slice(0, 180), reason: "Perfil do negócio" }))
        .filter((item) => item.value)
        .slice(0, 8);
      const offers = Array.isArray(profile.produtos)
        ? profile.produtos.map((item: any) => ({ value: String(item?.nome ?? "").trim().slice(0, 180), reason: "Perfil do negócio" })).filter((item: any) => item.value).slice(0, 8)
        : [];
      res.status(200).json({ audiences, offers, source: "local_fallback", degraded: true });
    } catch {
      res.status(200).json({ audiences: [], offers: [], source: "degraded", degraded: true });
    }
  }
});'''
assert old in text
text = text.replace(old, new, 1)
server.write_text(text)

# BUSINESS PROFILE GET: preserve raw response shape, but merge tenant + WhatsApp fallbacks
profiles = Path('artifacts/api-server/src/routes/business_profiles.ts')
text = profiles.read_text()
text = text.replace('import { eq } from "drizzle-orm";', 'import { and, desc, eq } from "drizzle-orm";', 1)
old = '''  businessProfilesTable,
  tenantsTable,
  insertBusinessProfileSchema,'''
new = '''  businessProfilesTable,
  tenantsTable,
  whatsappConnectionsTable,
  insertBusinessProfileSchema,'''
assert old in text
text = text.replace(old, new, 1)
old = '''router.get("/tenants/:tenantId/business-profile", async (req, res) => {
  const [profile] = await db
    .select()
    .from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, String(req.params.tenantId)));

  if (!profile) {
    res.status(404).json({ error: "Business profile not found" });
    return;
  }

  res.json(profile);
});'''
new = '''router.get("/tenants/:tenantId/business-profile", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const [profileResult, tenantResult, whatsappResult] = await Promise.allSettled([
    db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId)).limit(1),
    db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      nomeEmpresa: tenantsTable.nomeEmpresa,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
      logoUrl: tenantsTable.logoUrl,
      site: tenantsTable.site,
      descricao: tenantsTable.descricao,
    }).from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1),
    db.select({
      displayPhoneNumber: whatsappConnectionsTable.displayPhoneNumber,
      businessName: whatsappConnectionsTable.businessName,
      isDefault: whatsappConnectionsTable.isDefault,
      updatedAt: whatsappConnectionsTable.updatedAt,
    }).from(whatsappConnectionsTable)
      .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.status, "active")))
      .orderBy(desc(whatsappConnectionsTable.isDefault), desc(whatsappConnectionsTable.updatedAt))
      .limit(1),
  ]);
  const profile = profileResult.status === "fulfilled" ? profileResult.value[0] ?? null : null;
  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value[0] ?? null : null;
  const whatsapp = whatsappResult.status === "fulfilled" ? whatsappResult.value[0] ?? null : null;
  const mergedProfile = tenant || profile || whatsapp ? {
    ...(profile ?? {}),
    tenantId,
    razaoSocial: profile?.razaoSocial || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || "",
    nomeFantasia: profile?.nomeFantasia || tenant?.nomeEmpresa || tenant?.name || whatsapp?.businessName || null,
    vertical: profile?.vertical || tenant?.segmento || tenant?.vertical || null,
    logoUrl: profile?.logoUrl || tenant?.logoUrl || null,
    telefone: profile?.telefone || whatsapp?.displayPhoneNumber || null,
    descricao: tenant?.descricao || null,
    site: tenant?.site || null,
    displayPhoneNumber: whatsapp?.displayPhoneNumber || null,
  } : null;
  const degraded = [profileResult, tenantResult, whatsappResult].some((result) => result.status === "rejected");
  if (degraded) req.log?.warn({ tenantId }, "business-profile: served with fallback sources");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(mergedProfile);
});'''
assert old in text
text = text.replace(old, new, 1)
profiles.write_text(text)
