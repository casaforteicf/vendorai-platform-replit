from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected block not found in {path}: {old[:180]!r}")
    p.write_text(text.replace(old, new, 1))


# ──────────────────────────────────────────────────────────────────────────────
# Campaign backend: exact Revenue Scout audience + source context
# ──────────────────────────────────────────────────────────────────────────────
campaign_routes = "artifacts/api-server/src/routes/campaigns.ts"

replace_once(
    campaign_routes,
    '''  customerIntelligenceTable,\n  dealsTable,''',
    '''  customerIntelligenceTable,\n  leadsTable,\n  dealsTable,''',
)

replace_once(
    campaign_routes,
    '''  if (!filtro) return conditions;\n\n  if (filtro.churnRisk !== undefined) {''',
    '''  if (!filtro) return conditions;\n\n  if (filtro.leadIds?.length) {\n    conditions.push(inArray(customerIntelligenceTable.leadId, filtro.leadIds));\n  }\n\n  if (filtro.churnRisk !== undefined) {''',
)

replace_once(
    campaign_routes,
    '''  if (filtro.dealEtapas?.length) partes.push(`etapa(s) do funil: ${filtro.dealEtapas.join(", ")}`);\n\n  return partes.length > 0 ? partes.join("; ") : "público geral, sem filtro de segmento definido";''',
    '''  if (filtro.dealEtapas?.length) partes.push(`etapa(s) do funil: ${filtro.dealEtapas.join(", ")}`);\n  if (filtro.leadIds?.length) partes.push(`${filtro.leadIds.length} prospect(s) selecionado(s) pelo Revenue Scout`);\n  if (filtro.marketingContext?.audienceNiche) partes.push(`nicho: ${filtro.marketingContext.audienceNiche}`);\n\n  return partes.length > 0 ? partes.join("; ") : "público geral, sem filtro de segmento definido";''',
)

replace_once(
    campaign_routes,
    '''    const filtro = filtroResult.success ? filtroResult.data : undefined;\n\n    const conditions = buildAudienceConditions(String(tenantId), filtro);''',
    '''    const filtro = filtroResult.success ? filtroResult.data : undefined;\n\n    // Campanhas originadas no Revenue Scout preservam exatamente os prospects\n    // escolhidos. A prévia não depende de customer_intelligence existir para\n    // cada lead e nunca atravessa o tenant.\n    if (filtro?.leadIds?.length) {\n      const selectedLeads = await db\n        .select({ id: leadsTable.id, nome: leadsTable.nome })\n        .from(leadsTable)\n        .where(\n          and(\n            eq(leadsTable.tenantId, String(tenantId)),\n            inArray(leadsTable.id, filtro.leadIds),\n          ),\n        );\n      res.json({\n        count: selectedLeads.length,\n        filtersApplied: filtro,\n        sample: selectedLeads.slice(0, 10).map((lead) => ({\n          id: lead.id,\n          leadId: lead.id,\n          nome: lead.nome,\n          churnRisk: null,\n          journeyStage: null,\n          nextBestAction: null,\n          dealEtapa: null,\n        })),\n      });\n      return;\n    }\n\n    const conditions = buildAudienceConditions(String(tenantId), filtro);''',
)


# ──────────────────────────────────────────────────────────────────────────────
# Prospector backend: create tenant-owned marketing package from selected leads
# ──────────────────────────────────────────────────────────────────────────────
prospector = "artifacts/api-server/src/routes/prospector.ts"

replace_once(
    prospector,
    '''  prospectFeedbackTable,\n  insertProspectFeedbackSchema,''',
    '''  prospectFeedbackTable,\n  campaignsTable,\n  businessProfilesTable,\n  produtosCatalogoTable,\n  insertProspectFeedbackSchema,''',
)

replace_once(
    prospector,
    '''      priorityReason: leadsTable.priorityReason,\n      createdAt: leadsTable.createdAt,''',
    '''      priorityReason: leadsTable.priorityReason,\n      metadata: leadsTable.metadata,\n      createdAt: leadsTable.createdAt,''',
)

campaign_package_endpoint = r'''// ── POST /prospector/campaign-package — Revenue Scout → Marketing ─────────────
const campaignPackageBodySchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(50),
  tenantId: z.string().optional(),
});

type RevenueScoutCampaignStrategy = {
  campaignName: string;
  audienceSegment: string;
  audienceNiche: string;
  campaignGoal: string;
  message: string;
  recommendedChannel: "whatsapp" | "email" | "instagram";
  recommendedPaidPlatform: "meta" | "google";
  offer: string;
  chosenProductIds: string[];
  opportunity: string;
  region: string;
  adsHeadline: string;
  adsDescription: string;
  lpHeadline: string;
  lpSubheadline: string;
};

function safeStrategyText(value: unknown, fallback: string, max = 500): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

router.post("/prospector/campaign-package", async (req, res) => {
  const parsed = campaignPackageBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Dados inválidos", details: parsed.error.flatten() });
  }

  const tenantId = resolveTenantId(req, parsed.data.tenantId);
  const leadIds = [...new Set(parsed.data.leadIds)];

  const selectedLeads = await db
    .select({
      id: leadsTable.id,
      nome: leadsTable.nome,
      empresa: leadsTable.empresa,
      telefone: leadsTable.telefone,
      endereco: leadsTable.endereco,
      mercadoSegmento: leadsTable.mercadoSegmento,
      propensityScore: leadsTable.propensityScore,
      priorityReason: leadsTable.priorityReason,
      roiEstimate: leadsTable.roiEstimate,
      enrichmentData: leadsTable.enrichmentData,
      metadata: leadsTable.metadata,
    })
    .from(leadsTable)
    .where(and(eq(leadsTable.tenantId, tenantId), inArray(leadsTable.id, leadIds)))
    .orderBy(desc(leadsTable.propensityScore), desc(leadsTable.createdAt));

  const foundIds = new Set(selectedLeads.map((lead) => lead.id));
  const missing = leadIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return res.status(404).json({
      error: "Um ou mais prospects não pertencem a este tenant",
      missingLeadIds: missing,
    });
  }

  const [tenantRows, profileRows, catalogRows] = await Promise.all([
    db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        nomeEmpresa: tenantsTable.nomeEmpresa,
        vertical: tenantsTable.vertical,
        segmento: tenantsTable.segmento,
        descricao: tenantsTable.descricao,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db
      .select({
        razaoSocial: businessProfilesTable.razaoSocial,
        nomeFantasia: businessProfilesTable.nomeFantasia,
        vertical: businessProfilesTable.vertical,
        diferenciais: businessProfilesTable.diferenciais,
        publicoAlvo: businessProfilesTable.publicoAlvo,
        produtos: businessProfilesTable.produtos,
        discoveryData: businessProfilesTable.discoveryData,
      })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
    db
      .select({
        id: produtosCatalogoTable.id,
        nome: produtosCatalogoTable.nome,
        descricao: produtosCatalogoTable.descricao,
        marca: produtosCatalogoTable.marca,
        ativo: produtosCatalogoTable.ativo,
      })
      .from(produtosCatalogoTable)
      .where(eq(produtosCatalogoTable.tenantId, tenantId)),
  ]);

  const tenant = tenantRows[0] ?? null;
  const profile = profileRows[0] ?? null;
  const tenantName =
    profile?.nomeFantasia ??
    tenant?.nomeEmpresa ??
    tenant?.name ??
    profile?.razaoSocial ??
    "Empresa";
  const businessVertical =
    profile?.vertical ?? tenant?.segmento ?? tenant?.vertical ?? "";

  const activeCatalog = catalogRows.filter((item) => item.ativo !== false).slice(0, 30);
  const profileProducts = Array.isArray(profile?.produtos) ? profile.produtos : [];
  const availableOffers = activeCatalog.length > 0
    ? activeCatalog.map((item) => ({
        id: item.id,
        nome: item.nome,
        descricao: item.descricao ?? "",
        marca: item.marca ?? "",
      }))
    : profileProducts.slice(0, 20).map((item, index) => ({
        id: `profile:${index}`,
        nome: item.nome,
        descricao: item.descricao ?? "",
        marca: "",
      }));

  const scores = selectedLeads
    .map((lead) => Number(lead.propensityScore))
    .filter((score) => Number.isFinite(score));
  const averageScore = scores.length > 0
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
    : 0;
  const segmentCandidates = selectedLeads
    .map((lead) => lead.mercadoSegmento?.trim())
    .filter((value): value is string => Boolean(value));
  const fallbackNiche = segmentCandidates[0] ?? "empresas qualificadas pelo Revenue Scout";
  const addressCandidates = selectedLeads
    .map((lead) => lead.endereco?.trim())
    .filter((value): value is string => Boolean(value))
    .slice(0, 3);
  const fallbackRegion = addressCandidates.length > 0 ? addressCandidates.join(" • ") : "região comercial do tenant";
  const defaultOffer = availableOffers[0] ?? null;
  const fallbackOpportunity = selectedLeads.find((lead) => lead.priorityReason)?.priorityReason
    ?? "oportunidade comercial identificada pelo Revenue Scout";

  let strategy: RevenueScoutCampaignStrategy = {
    campaignName: `${fallbackNiche} — Revenue Scout`.slice(0, 180),
    audienceSegment: "Empresas (B2B)",
    audienceNiche: fallbackNiche,
    campaignGoal: `Gerar oportunidades comerciais para ${tenantName} junto a ${selectedLeads.length} prospect(s) qualificado(s).`,
    message: `Olá! Somos da ${tenantName}. Identificamos uma oportunidade de parceria que pode fazer sentido para sua empresa. Posso te apresentar rapidamente?`,
    recommendedChannel: "whatsapp",
    recommendedPaidPlatform: "meta",
    offer: defaultOffer?.nome ?? "solução comercial do tenant",
    chosenProductIds: defaultOffer ? [defaultOffer.id] : [],
    opportunity: fallbackOpportunity,
    region: fallbackRegion,
    adsHeadline: `${tenantName}: uma solução para ${fallbackNiche}`.slice(0, 120),
    adsDescription: `Conheça a oferta da ${tenantName} pensada para ${fallbackNiche}.`.slice(0, 220),
    lpHeadline: `${tenantName} para ${fallbackNiche}`.slice(0, 160),
    lpSubheadline: `Uma proposta comercial preparada para empresas com o perfil identificado pelo Revenue Scout.`.slice(0, 260),
  };

  const leadsForAi = selectedLeads.map((lead) => ({
    nome: lead.nome,
    empresa: lead.empresa,
    segmento: lead.mercadoSegmento,
    endereco: lead.endereco,
    score: lead.propensityScore,
    motivo_prioridade: lead.priorityReason,
    roi: lead.roiEstimate,
    sinais: JSON.stringify(lead.enrichmentData ?? {}).slice(0, 700),
  }));

  try {
    const ai = await gatewayCallOpenAI(
      tenantId,
      "content_generator",
      [
        {
          role: "system",
          content:
            "Você é o Marketing Manager do CLIENTE/TENANT do VendorAI. A empresa anunciante é o tenant informado, " +
            "e os leads do Revenue Scout são o público/prospects. Nunca trate o VendorAI como o produto a vender, " +
            "a menos que isso esteja explicitamente no catálogo do tenant. Use somente produtos/ofertas fornecidos. " +
            "Crie uma estratégia prática que possa alimentar campanha orgânica, Meta/Google Ads e landing page. " +
            "Responda APENAS JSON válido.",
        },
        {
          role: "user",
          content: JSON.stringify({
            tenant: {
              nome: tenantName,
              vertical: businessVertical,
              descricao: tenant?.descricao ?? null,
              diferenciais: profile?.diferenciais ?? null,
              publico_alvo_atual: profile?.publicoAlvo ?? null,
              discovery: profile?.discoveryData ?? null,
            },
            ofertas_disponiveis: availableOffers,
            prospects: leadsForAi,
            score_medio: averageScore,
            regras: {
              selectedProductIdsMustExistInOffers: true,
              noInventedProducts: true,
              campaignMustBelongToTenant: true,
              paidMediaIsDraftOnly: true,
            },
            output: {
              campaignName: "string",
              audienceSegment: "string",
              audienceNiche: "string",
              campaignGoal: "string",
              message: "string de primeiro contato curto",
              recommendedChannel: "whatsapp|email|instagram",
              recommendedPaidPlatform: "meta|google",
              offer: "string",
              chosenProductIds: ["ids existentes em ofertas_disponiveis"],
              opportunity: "string",
              region: "string",
              adsHeadline: "string",
              adsDescription: "string",
              lpHeadline: "string",
              lpSubheadline: "string",
            },
          }),
        },
      ],
      { responseFormat: { type: "json_object" }, maxTokens: 1200, temperature: 0.5, log: req.log },
    );

    const parsedAi = JSON.parse(ai.content) as Partial<RevenueScoutCampaignStrategy>;
    const channel = ["whatsapp", "email", "instagram"].includes(String(parsedAi.recommendedChannel))
      ? parsedAi.recommendedChannel as RevenueScoutCampaignStrategy["recommendedChannel"]
      : strategy.recommendedChannel;
    const paid = ["meta", "google"].includes(String(parsedAi.recommendedPaidPlatform))
      ? parsedAi.recommendedPaidPlatform as RevenueScoutCampaignStrategy["recommendedPaidPlatform"]
      : strategy.recommendedPaidPlatform;
    const allowedIds = new Set(availableOffers.map((item) => item.id));
    const selectedIds = Array.isArray(parsedAi.chosenProductIds)
      ? parsedAi.chosenProductIds.filter((id): id is string => typeof id === "string" && allowedIds.has(id))
      : strategy.chosenProductIds;

    strategy = {
      campaignName: safeStrategyText(parsedAi.campaignName, strategy.campaignName, 180),
      audienceSegment: safeStrategyText(parsedAi.audienceSegment, strategy.audienceSegment, 120),
      audienceNiche: safeStrategyText(parsedAi.audienceNiche, strategy.audienceNiche, 180),
      campaignGoal: safeStrategyText(parsedAi.campaignGoal, strategy.campaignGoal, 500),
      message: safeStrategyText(parsedAi.message, strategy.message, 900),
      recommendedChannel: channel,
      recommendedPaidPlatform: paid,
      offer: safeStrategyText(parsedAi.offer, strategy.offer, 300),
      chosenProductIds: selectedIds,
      opportunity: safeStrategyText(parsedAi.opportunity, strategy.opportunity, 500),
      region: safeStrategyText(parsedAi.region, strategy.region, 300),
      adsHeadline: safeStrategyText(parsedAi.adsHeadline, strategy.adsHeadline, 120),
      adsDescription: safeStrategyText(parsedAi.adsDescription, strategy.adsDescription, 240),
      lpHeadline: safeStrategyText(parsedAi.lpHeadline, strategy.lpHeadline, 180),
      lpSubheadline: safeStrategyText(parsedAi.lpSubheadline, strategy.lpSubheadline, 320),
    };
  } catch (err) {
    req.log.warn({ err }, "prospector/campaign-package: strategy AI unavailable, using safe fallback");
  }

  const chosenOffers = availableOffers.filter((item) => strategy.chosenProductIds.includes(item.id));
  const productIds = chosenOffers.map((item) => item.id);
  const productNames = chosenOffers.map((item) => item.nome);
  const prospectorBatchId = crypto.randomUUID();
  const marketingContext = {
    nicheId: `revenue_scout:${prospectorBatchId}`,
    nicheName: [
      businessVertical ? `Negócio: ${businessVertical}` : `Negócio: ${tenantName}`,
      `Público: ${strategy.audienceSegment}`,
      `Nicho do público: ${strategy.audienceNiche}`,
      `Objetivo: ${strategy.campaignGoal}`,
    ].join(" | "),
    productIds,
    productNames,
    businessVertical: businessVertical || tenantName,
    audienceSegment: strategy.audienceSegment,
    audienceNiche: strategy.audienceNiche,
    campaignGoal: strategy.campaignGoal,
  };

  const campaignContext = {
    origin: "revenue_scout",
    prospectorBatchId,
    leadIds,
    tenantName,
    businessVertical: businessVertical || undefined,
    region: strategy.region,
    opportunity: strategy.opportunity,
    averageScore,
    offer: strategy.offer,
    productIds,
    productNames,
    audienceSegment: strategy.audienceSegment,
    audienceNiche: strategy.audienceNiche,
    campaignGoal: strategy.campaignGoal,
    recommendedChannel: strategy.recommendedChannel,
    recommendedPaidPlatform: strategy.recommendedPaidPlatform,
    adsHeadline: strategy.adsHeadline,
    adsDescription: strategy.adsDescription,
    lpHeadline: strategy.lpHeadline,
    lpSubheadline: strategy.lpSubheadline,
    marketingContext,
    createdFromRevenueScoutAt: new Date().toISOString(),
  };

  const [campaign] = await db
    .insert(campaignsTable)
    .values({
      tenantId,
      nome: strategy.campaignName,
      tipo: strategy.recommendedChannel,
      mensagem: strategy.message,
      status: "rascunho",
      totalDestinatarios: selectedLeads.length,
      segmentoFiltro: { leadIds, marketingContext },
      contexto: campaignContext,
    })
    .returning();

  if (!campaign) {
    return res.status(500).json({ error: "Falha ao criar campanha" });
  }

  await db.insert(activitiesTable).values(
    selectedLeads.map((lead) => ({
      tenantId,
      leadId: lead.id,
      tipo: "tarefa" as const,
      titulo: "Campanha criada pelo Revenue Scout",
      descricao: `Prospect vinculado à campanha "${campaign.nome}" (${campaign.id}).`,
      status: "concluida" as const,
    })),
  );

  await Promise.all(
    selectedLeads.map(async (lead) => {
      const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
      const current = Array.isArray(metadata["revenue_scout_campaign_ids"])
        ? metadata["revenue_scout_campaign_ids"].filter((id): id is string => typeof id === "string")
        : [];
      const nextIds = [...new Set([...current, campaign.id])];
      await db
        .update(leadsTable)
        .set({
          metadata: { ...metadata, revenue_scout_campaign_ids: nextIds },
          updatedAt: new Date(),
        })
        .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, tenantId)));
    }),
  );

  return res.status(201).json({
    campaignId: campaign.id,
    campaign,
    strategy: {
      ...strategy,
      productIds,
      productNames,
      marketingContext,
      averageScore,
    },
    marketingUrl: `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(campaign.id)}&from=revenue-scout`,
    adsUrl: `/ads?from=revenue-scout&campaignId=${encodeURIComponent(campaign.id)}`,
    lpUrl: `/content?tab=campanhas&view=lp&campaignId=${encodeURIComponent(campaign.id)}&from=revenue-scout`,
  });
});

'''

replace_once(
    prospector,
    '''// ── GET /prospector/fila — fila priorizada por score ─────────────────────────''',
    campaign_package_endpoint + '''// ── GET /prospector/fila — fila priorizada por score ─────────────────────────''',
)


# ──────────────────────────────────────────────────────────────────────────────
# Prospector frontend: create package from one or many scored prospects
# ──────────────────────────────────────────────────────────────────────────────
prospector_ui = "artifacts/frontend/src/pages/Prospector.tsx"

replace_once(prospector_ui, 'import { Link } from "wouter";', 'import { Link, useLocation } from "wouter";')

replace_once(
    prospector_ui,
    '''  const { toast } = useToast();\n  const isSuperAdmin = user?.platformRole === "super_admin";''',
    '''  const { toast } = useToast();\n  const [, setLocation] = useLocation();\n  const isSuperAdmin = user?.platformRole === "super_admin";''',
)

replace_once(
    prospector_ui,
    '''  const [adsDuplicadosPageIds, setAdsDuplicadosPageIds] = useState<Set<string>>(new Set());\n\n  // ── Fila Preditiva (Cmd 22)''',
    '''  const [adsDuplicadosPageIds, setAdsDuplicadosPageIds] = useState<Set<string>>(new Set());\n  const [selectedFilaLeadIds, setSelectedFilaLeadIds] = useState<Set<string>>(new Set());\n\n  // ── Fila Preditiva (Cmd 22)''',
)

replace_once(
    prospector_ui,
    '''          priorityReason?: string;\n          createdAt: string;''',
    '''          priorityReason?: string;\n          metadata?: { revenue_scout_campaign_ids?: string[] };\n          createdAt: string;''',
)

package_mutation = r'''  const createCampaignPackageMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const res = await fetch("/api/prospector/campaign-package", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ leadIds, tenantId: tenantId || undefined }),
      });
      const data = await res.json() as any;
      if (!res.ok) throw new Error(data.error ?? "Falha ao criar pacote comercial");
      return data;
    },
    onSuccess: (data) => {
      const strategy = data.strategy ?? {};
      sessionStorage.setItem("vendorai_ads_revenue_scout_draft_v1", JSON.stringify({
        campaignId: data.campaignId,
        campaignName: data.campaign?.nome ?? strategy.campaignName,
        suggestedPlatform: strategy.recommendedPaidPlatform ?? "meta",
        marketingContext: strategy.marketingContext,
        region: strategy.region,
        opportunity: strategy.opportunity,
        offer: strategy.offer,
        headline: strategy.adsHeadline,
        description: strategy.adsDescription,
      }));
      sessionStorage.setItem("vendorai_lp_revenue_scout_draft_v1", JSON.stringify({
        campaignId: data.campaignId,
        audience: strategy.audienceNiche,
        offer: strategy.offer,
        objective: strategy.campaignGoal,
        notes: [strategy.opportunity, strategy.lpHeadline, strategy.lpSubheadline].filter(Boolean).join("\n"),
        productIds: strategy.productIds ?? [],
        headline: strategy.lpHeadline,
        subheadline: strategy.lpSubheadline,
      }));
      setSelectedFilaLeadIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["prospector-fila"] });
      toast({
        title: "Pacote comercial criado",
        description: "A campanha já pertence a este tenant. LP e anúncios ficaram preparados para revisão.",
      });
      setLocation(data.marketingUrl ?? `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(data.campaignId)}`);
    },
    onError: (err) => toast({
      title: "Falha ao criar pacote comercial",
      description: err instanceof Error ? err.message : undefined,
      variant: "destructive",
    }),
  });

'''

replace_once(
    prospector_ui,
    '''  const dispatchSdrMutation = useMutation({''',
    package_mutation + '''  const dispatchSdrMutation = useMutation({''',
)

replace_once(
    prospector_ui,
    '''  function tenantIdField() {''',
    '''  const prospectorParams = new URLSearchParams(window.location.search);\n  const requestedProspectorTab = prospectorParams.get("tab");\n  const defaultProspectorTab = ["busca", "cnpj", "anunciantes", "fila", "aprovacoes"].includes(requestedProspectorTab ?? "")\n    ? requestedProspectorTab!\n    : "busca";\n  const campaignFilterId = prospectorParams.get("campaignId");\n  const filaLeads = (filaQuery.data?.leads ?? []).filter((lead) =>\n    !campaignFilterId || lead.metadata?.revenue_scout_campaign_ids?.includes(campaignFilterId),\n  );\n\n  function tenantIdField() {''',
)

replace_once(prospector_ui, '<Tabs defaultValue="busca">', '<Tabs defaultValue={defaultProspectorTab}>')
replace_once(prospector_ui, '          ) : (filaQuery.data?.leads ?? []).length === 0 ? (', '          ) : filaLeads.length === 0 ? (')
replace_once(prospector_ui, '              {(filaQuery.data?.leads ?? []).map((lead) => {', '              {filaLeads.map((lead) => {')

replace_once(
    prospector_ui,
    '''                <div className="flex items-center gap-2">\n                  <Button\n                    size="sm"\n                    variant="outline"\n                    onClick={() => filaQuery.refetch()''',
    '''                <div className="flex flex-wrap items-center gap-2">\n                  <Button\n                    size="sm"\n                    variant="outline"\n                    onClick={() => filaQuery.refetch()''',
)

replace_once(
    prospector_ui,
    '''                  <Button\n                    size="sm"\n                    onClick={() => dispatchTopMutation.mutate(10)}''',
    '''                  {selectedFilaLeadIds.size > 0 && (\n                    <Button\n                      size="sm"\n                      variant="secondary"\n                      onClick={() => createCampaignPackageMutation.mutate([...selectedFilaLeadIds])}\n                      disabled={createCampaignPackageMutation.isPending}\n                    >\n                      {createCampaignPackageMutation.isPending ? (\n                        <><Spinner className="h-3.5 w-3.5 mr-1" /> Preparando...</>\n                      ) : (\n                        <><Megaphone className="h-3.5 w-3.5 mr-1" /> Criar pacote completo ({selectedFilaLeadIds.size})</>\n                      )}\n                    </Button>\n                  )}\n                  <Button\n                    size="sm"\n                    onClick={() => dispatchTopMutation.mutate(10)}''',
)

replace_once(
    prospector_ui,
    '''                      <div className="flex items-start gap-4">\n                        {/* Score badge */}''',
    '''                      <div className="flex items-start gap-4">\n                        <input\n                          type="checkbox"\n                          className="mt-3 h-4 w-4 rounded border-input accent-primary"\n                          aria-label={`Selecionar ${lead.nome} para campanha`}\n                          checked={selectedFilaLeadIds.has(lead.id)}\n                          disabled={isPending}\n                          onChange={() => setSelectedFilaLeadIds((prev) => {\n                            const next = new Set(prev);\n                            if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id);\n                            return next;\n                          })}\n                        />\n                        {/* Score badge */}''',
)

replace_once(
    prospector_ui,
    '''                          <div className="flex gap-2 pt-1">''',
    '''                          <div className="flex flex-wrap gap-2 pt-1">''',
)

replace_once(
    prospector_ui,
    '''                            <Button\n                              size="sm"\n                              variant="outline"\n                              className="text-destructive hover:text-destructive"''',
    '''                            {lead.metadata?.revenue_scout_campaign_ids?.[0] && (\n                              <Link href={`/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(lead.metadata.revenue_scout_campaign_ids[0])}&from=revenue-scout`}>\n                                <Button size="sm" variant="outline">\n                                  <Megaphone className="h-3.5 w-3.5 mr-1" /> Abrir campanha\n                                </Button>\n                              </Link>\n                            )}\n                            <Button\n                              size="sm"\n                              variant="outline"\n                              disabled={createCampaignPackageMutation.isPending || isPending}\n                              onClick={() => createCampaignPackageMutation.mutate([lead.id])}\n                            >\n                              <Sparkles className="h-3.5 w-3.5 mr-1" /> Criar pacote\n                            </Button>\n                            <Button\n                              size="sm"\n                              variant="outline"\n                              className="text-destructive hover:text-destructive"''',
)


# ──────────────────────────────────────────────────────────────────────────────
# Marketing hub: mount the existing SiteGenerator as campaign-LP view
# ──────────────────────────────────────────────────────────────────────────────
content_hub = "artifacts/frontend/src/pages/ContentHub.tsx"
replace_once(
    content_hub,
    '''import CampanhasHub from "@/pages/CampanhasHub";\nimport { Images, Megaphone, Sparkles } from "lucide-react";''',
    '''import CampanhasHub from "@/pages/CampanhasHub";\nimport SiteGenerator from "@/pages/SiteGenerator";\nimport { Button } from "@/components/ui/button";\nimport { ArrowLeft, Images, Megaphone, Sparkles } from "lucide-react";''',
)

replace_once(
    content_hub,
    '''            {campaignView === "organicas" ? <Campanhas /> : <CampanhasHub />}''',
    '''            {campaignView === "organicas" ? (\n              <Campanhas />\n            ) : campaignView === "lp" ? (\n              <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">\n                <Button\n                  variant="ghost"\n                  size="sm"\n                  className="gap-1.5"\n                  onClick={() => {\n                    const campaignId = params.get("campaignId");\n                    setLocation(campaignId\n                      ? `/content?tab=campanhas&view=organicas&campaignId=${encodeURIComponent(campaignId)}&from=revenue-scout`\n                      : "/content?tab=campanhas");\n                  }}\n                >\n                  <ArrowLeft className="h-4 w-4" /> Voltar para Campanha\n                </Button>\n                <SiteGenerator />\n              </div>\n            ) : (\n              <CampanhasHub />\n            )}''',
)


# ──────────────────────────────────────────────────────────────────────────────
# SiteGenerator: accept Revenue Scout LP handoff without losing tenant profile
# ──────────────────────────────────────────────────────────────────────────────
site_generator = "artifacts/frontend/src/pages/SiteGenerator.tsx"

replace_once(
    site_generator,
    '''type AiBusinessSuggestions = { audiences: Array<{ value: string; reason?: string }>; offers: Array<{ value: string; productId?: string; reason?: string }> };''',
    '''type AiBusinessSuggestions = { audiences: Array<{ value: string; reason?: string }>; offers: Array<{ value: string; productId?: string; reason?: string }> };\ntype RevenueScoutLpDraft = {\n  campaignId: string;\n  audience?: string;\n  offer?: string;\n  objective?: string;\n  notes?: string;\n  productIds?: string[];\n  headline?: string;\n  subheadline?: string;\n};''',
)

replace_once(
    site_generator,
    '''  const init = useRef(false); const defaults = useRef("");\n  useEffect(() => {''',
    '''  const init = useRef(false); const defaults = useRef("");\n  const revenueScoutHandoff = useRef<RevenueScoutLpDraft | null>(null);\n  const revenueScoutProductsApplied = useRef(false);\n\n  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    if (params.get("from") !== "revenue-scout") return;\n    try {\n      const raw = sessionStorage.getItem("vendorai_lp_revenue_scout_draft_v1");\n      if (!raw) return;\n      const draft = JSON.parse(raw) as RevenueScoutLpDraft;\n      if (!draft.campaignId) return;\n      revenueScoutHandoff.current = draft;\n      setMode("campaign");\n      setChoosing(false);\n      setEditor(false);\n      setAudience(draft.audience ?? "");\n      setOffer(draft.offer ?? "");\n      setNotes([\n        draft.objective ? `Objetivo da campanha: ${draft.objective}` : "",\n        draft.headline ? `Headline sugerida: ${draft.headline}` : "",\n        draft.subheadline ? `Subheadline sugerida: ${draft.subheadline}` : "",\n        draft.notes ?? "",\n        `Campanha de origem: ${draft.campaignId}`,\n      ].filter(Boolean).join("\\n"));\n      setObjectiveId("leads");\n      sessionStorage.setItem("vendorai_site_creation_mode", "campaign");\n      sessionStorage.removeItem("vendorai_lp_revenue_scout_draft_v1");\n      toast({ title: "LP preparada pelo Revenue Scout", description: "Público, oferta e objetivo já foram carregados com o contexto deste tenant." });\n    } catch {\n      sessionStorage.removeItem("vendorai_lp_revenue_scout_draft_v1");\n    }\n  }, []);\n\n  useEffect(() => {''',
)

replace_once(
    site_generator,
    '''setDesc(profileDesc); setAudience(bp?.publicoAlvo ?? ""); if (bp?.site)''',
    '''setDesc(profileDesc); setAudience((current) => current.trim() ? current : (bp?.publicoAlvo ?? "")); if (bp?.site)''',
)

replace_once(
    site_generator,
    '''  useEffect(() => { if (!tenantId || editor) return; fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => setCatalog(Array.isArray(rows) ? rows.filter((p: CatalogItem) => p.ativo !== false) : [])).catch(() => setCatalog([])); }, [tenantId, token, editor]);\n  useEffect(() => { if (!catalog.length) return; const key = `${mode}:${catalog.length}`;''',
    '''  useEffect(() => { if (!tenantId || editor) return; fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: headers(token), cache: "no-store" }).then((r) => r.ok ? r.json() : []).then((rows) => setCatalog(Array.isArray(rows) ? rows.filter((p: CatalogItem) => p.ativo !== false) : [])).catch(() => setCatalog([])); }, [tenantId, token, editor]);\n  useEffect(() => {\n    if (!catalog.length || revenueScoutProductsApplied.current || !revenueScoutHandoff.current) return;\n    const requested = revenueScoutHandoff.current.productIds ?? [];\n    const valid = requested.filter((id) => catalog.some((product) => product.id === id));\n    if (valid.length > 0) setSelected(valid);\n    revenueScoutProductsApplied.current = true;\n  }, [catalog]);\n  useEffect(() => { if (!catalog.length) return; const key = `${mode}:${catalog.length}`;''',
)


# ──────────────────────────────────────────────────────────────────────────────
# Ads: accept Revenue Scout campaign plan as a tenant-owned ad draft
# ──────────────────────────────────────────────────────────────────────────────
ads = "artifacts/frontend/src/pages/Ads.tsx"

replace_once(
    ads,
    '''interface ImportedContentDraft {\n  contentGenerationId: string;\n  variationIndex: number;\n  theme: string;\n  sourceType: string;\n  suggestedPlatform: "google" | "meta";\n  sourceVariationIndex?: number;\n  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };\n}\n''',
    '''interface ImportedContentDraft {\n  contentGenerationId: string;\n  variationIndex: number;\n  theme: string;\n  sourceType: string;\n  suggestedPlatform: "google" | "meta";\n  sourceVariationIndex?: number;\n  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };\n}\n\ninterface RevenueScoutAdsDraft {\n  campaignId: string;\n  campaignName?: string;\n  suggestedPlatform?: "google" | "meta";\n  marketingContext?: MarketingContextValue;\n  region?: string;\n  opportunity?: string;\n  offer?: string;\n  headline?: string;\n  description?: string;\n}\n''',
)

replace_once(
    ads,
    '''  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    if (params.get("from") !== "content") return;\n    try {''',
    '''  useEffect(() => {\n    const params = new URLSearchParams(window.location.search);\n    const source = params.get("from");\n\n    if (source === "revenue-scout") {\n      try {\n        const raw = sessionStorage.getItem("vendorai_ads_revenue_scout_draft_v1");\n        if (!raw) return;\n        const draft = JSON.parse(raw) as RevenueScoutAdsDraft;\n        if (!draft.campaignId) return;\n        const context = draft.marketingContext ?? { nicheId: "", nicheName: "", productIds: [], productNames: [] };\n        setMarketingContext({\n          ...context,\n          campaignGoal: [context.campaignGoal, draft.description, draft.opportunity].filter(Boolean).join(" | "),\n        });\n        const platform = draft.suggestedPlatform ?? "meta";\n        setSourceDraft(null);\n        setAutoGenerateAfterCreate(false);\n        setForm({\n          ...EMPTY_FORM,\n          plataforma: platform,\n          tipoAnuncio: platform === "meta" ? "imagem" : "rsa_pmax",\n          itemTipo: "livre",\n          itemLabel: draft.offer || draft.campaignName || "Campanha do Revenue Scout",\n          destinoClique: "whatsapp",\n          vertical: context.businessVertical || context.audienceNiche || "",\n          locais: draft.region ?? "",\n          termosPesquisa: [context.audienceNiche, draft.opportunity].filter((value): value is string => Boolean(value)),\n          objective: "lead",\n        });\n        setOpen(true);\n        sessionStorage.removeItem("vendorai_ads_revenue_scout_draft_v1");\n        toast({ title: "Plano do Revenue Scout carregado", description: "O anúncio continua em rascunho até você revisar orçamento, público e ativação." });\n      } catch {\n        sessionStorage.removeItem("vendorai_ads_revenue_scout_draft_v1");\n      }\n      return;\n    }\n\n    if (source !== "content") return;\n    try {''',
)

replace_once(
    ads,
    '''  }, []); // Executa só ao entrar em Anúncios vindo do gerador.''',
    '''  }, []); // Executa só ao entrar em Anúncios por um handoff de Marketing/Revenue Scout.''',
)


# ──────────────────────────────────────────────────────────────────────────────
# Campaign UI: deep-link, provenance, bidirectional handoffs
# ──────────────────────────────────────────────────────────────────────────────
campaign_ui = "artifacts/frontend/src/pages/Campanhas.tsx"

replace_once(campaign_ui, 'import { useRef, useState } from "react";', 'import { useEffect, useRef, useState } from "react";')

replace_once(
    campaign_ui,
    '''type FormValues = z.infer<typeof formSchema>;\n\n// ── Helpers''',
    '''type FormValues = z.infer<typeof formSchema>;\n\ntype RevenueScoutCampaignContext = {\n  origin?: string;\n  prospectorBatchId?: string;\n  leadIds?: string[];\n  tenantName?: string;\n  businessVertical?: string;\n  region?: string;\n  opportunity?: string;\n  averageScore?: number;\n  offer?: string;\n  productIds?: string[];\n  productNames?: string[];\n  audienceSegment?: string;\n  audienceNiche?: string;\n  campaignGoal?: string;\n  recommendedChannel?: "whatsapp" | "email" | "instagram";\n  recommendedPaidPlatform?: "meta" | "google";\n  adsHeadline?: string;\n  adsDescription?: string;\n  lpHeadline?: string;\n  lpSubheadline?: string;\n  marketingContext?: MarketingContextValue;\n};\n\nfunction getRevenueScoutContext(campaign: Campaign | null | undefined): RevenueScoutCampaignContext | null {\n  const context = (campaign as any)?.contexto as RevenueScoutCampaignContext | null | undefined;\n  return context?.origin === "revenue_scout" ? context : null;\n}\n\n// ── Helpers''',
)

replace_once(
    campaign_ui,
    '''  const isEdit = !!editingCampaign;\n\n  // "form"''',
    '''  const isEdit = !!editingCampaign;\n  const revenueScoutContext = getRevenueScoutContext(editingCampaign);\n\n  // "form"''',
)

# Insert hydration effect right after useForm block / before mutations.
replace_once(
    campaign_ui,
    '''  const createMutation = useCreateCampaign();''',
    '''  useEffect(() => {\n    if (!open) return;\n    if (!editingCampaign) {\n      form.reset({\n        nome: "",\n        tipo: "whatsapp",\n        mensagem: "",\n        churnRiskMin: undefined,\n        journeyStage: "",\n        dealEtapas: [],\n        mensagensEtapa: {},\n        agendadaPara: "",\n      });\n      setMarketingContext({ nicheId: "", nicheName: "", productIds: [], productNames: [] });\n      return;\n    }\n    const filtro = (editingCampaign.segmentoFiltro ?? {}) as any;\n    form.reset({\n      nome: editingCampaign.nome ?? "",\n      tipo: editingCampaign.tipo ?? "whatsapp",\n      mensagem: editingCampaign.mensagem ?? "",\n      churnRiskMin: typeof filtro.churnRisk === "object" && filtro.churnRisk !== null ? filtro.churnRisk.gte : undefined,\n      journeyStage: filtro.journeyStage ?? "",\n      dealEtapas: filtro.dealEtapas ?? [],\n      mensagensEtapa: (editingCampaign.mensagensEtapa as Record<string, string>) ?? {},\n      agendadaPara: editingCampaign.agendadaPara ? editingCampaign.agendadaPara.slice(0, 16) : "",\n    });\n    const context = revenueScoutContext?.marketingContext ?? filtro.marketingContext;\n    if (context) {\n      setMarketingContext({\n        nicheId: context.nicheId ?? "",\n        nicheName: context.nicheName ?? "",\n        productIds: context.productIds ?? [],\n        productNames: context.productNames ?? [],\n        businessVertical: context.businessVertical,\n        businessVerticalSlug: context.businessVerticalSlug,\n        audienceSegment: context.audienceSegment,\n        audienceNiche: context.audienceNiche,\n        campaignGoal: context.campaignGoal,\n      });\n    }\n  }, [open, editingCampaign?.id]);\n\n  const createMutation = useCreateCampaign();''',
)

replace_once(
    campaign_ui,
    '''          segmentoFiltro: { ...buildSegmentoFiltro(values), marketingContext } as any,''',
    '''          segmentoFiltro: {\n            ...buildSegmentoFiltro(values),\n            ...(((editingCampaign.segmentoFiltro as any)?.leadIds?.length ?? 0) > 0\n              ? { leadIds: (editingCampaign.segmentoFiltro as any).leadIds }\n              : {}),\n            marketingContext,\n          } as any,''',
)

# Add Revenue Scout handoff helpers before isSaving.
replace_once(
    campaign_ui,
    '''  const isSaving = createMutation.isPending || updateMutation.isPending;''',
    '''  function prepareRevenueScoutAds() {\n    if (!editingCampaign || !revenueScoutContext) return;\n    sessionStorage.setItem("vendorai_ads_revenue_scout_draft_v1", JSON.stringify({\n      campaignId: editingCampaign.id,\n      campaignName: editingCampaign.nome,\n      suggestedPlatform: revenueScoutContext.recommendedPaidPlatform ?? "meta",\n      marketingContext: revenueScoutContext.marketingContext ?? marketingContext,\n      region: revenueScoutContext.region,\n      opportunity: revenueScoutContext.opportunity,\n      offer: revenueScoutContext.offer,\n      headline: revenueScoutContext.adsHeadline,\n      description: revenueScoutContext.adsDescription,\n    }));\n    window.location.assign(`/ads?from=revenue-scout&campaignId=${encodeURIComponent(editingCampaign.id)}`);\n  }\n\n  function prepareRevenueScoutLp() {\n    if (!editingCampaign || !revenueScoutContext) return;\n    sessionStorage.setItem("vendorai_lp_revenue_scout_draft_v1", JSON.stringify({\n      campaignId: editingCampaign.id,\n      audience: revenueScoutContext.audienceNiche,\n      offer: revenueScoutContext.offer,\n      objective: revenueScoutContext.campaignGoal,\n      notes: [revenueScoutContext.opportunity, revenueScoutContext.lpHeadline, revenueScoutContext.lpSubheadline].filter(Boolean).join("\\n"),\n      productIds: revenueScoutContext.productIds ?? [],\n      headline: revenueScoutContext.lpHeadline,\n      subheadline: revenueScoutContext.lpSubheadline,\n    }));\n    window.location.assign(`/content?tab=campanhas&view=lp&campaignId=${encodeURIComponent(editingCampaign.id)}&from=revenue-scout`);\n  }\n\n  const isSaving = createMutation.isPending || updateMutation.isPending;''',
)

replace_once(
    campaign_ui,
    '''              <MarketingContextSelector tenantId={tenantId} value={marketingContext} onChange={setMarketingContext} />\n\n              <FormField''',
    '''              <MarketingContextSelector tenantId={tenantId} value={marketingContext} onChange={setMarketingContext} />\n\n              {revenueScoutContext && editingCampaign && (\n                <Card className="border-emerald-200 bg-emerald-50/50">\n                  <CardContent className="pt-4 pb-4 space-y-3">\n                    <div className="flex flex-wrap items-start justify-between gap-2">\n                      <div>\n                        <div className="flex items-center gap-2">\n                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">Revenue Scout</Badge>\n                          <span className="text-xs text-muted-foreground">{revenueScoutContext.leadIds?.length ?? 0} prospect(s)</span>\n                          {typeof revenueScoutContext.averageScore === "number" && (\n                            <span className="text-xs font-medium text-emerald-700">Score médio {revenueScoutContext.averageScore}</span>\n                          )}\n                        </div>\n                        {revenueScoutContext.opportunity && (\n                          <p className="text-sm mt-2">{revenueScoutContext.opportunity}</p>\n                        )}\n                        {revenueScoutContext.region && (\n                          <p className="text-xs text-muted-foreground mt-1">Região: {revenueScoutContext.region}</p>\n                        )}\n                      </div>\n                    </div>\n                    <div className="flex flex-wrap gap-2">\n                      <Button type="button" size="sm" variant="outline" onClick={() => window.location.assign(`/prospector?tab=fila&campaignId=${encodeURIComponent(editingCampaign.id)}`)}>\n                        <Users className="h-3.5 w-3.5 mr-1" /> Ver prospects\n                      </Button>\n                      <Button type="button" size="sm" variant="outline" onClick={prepareRevenueScoutLp}>\n                        <Sparkles className="h-3.5 w-3.5 mr-1" /> Preparar LP\n                      </Button>\n                      <Button type="button" size="sm" onClick={prepareRevenueScoutAds}>\n                        <Megaphone className="h-3.5 w-3.5 mr-1" /> Preparar anúncio\n                      </Button>\n                    </div>\n                  </CardContent>\n                </Card>\n              )}\n\n              <FormField''',
)

# Deep-link selected campaign after list loads.
replace_once(
    campaign_ui,
    '''  function openEdit(c: Campaign) {\n    setEditingCampaign(c);\n    setModalOpen(true);\n  }\n\n  function handlePauseResume''',
    '''  function openEdit(c: Campaign) {\n    setEditingCampaign(c);\n    setModalOpen(true);\n  }\n\n  const [deepLinkHandled, setDeepLinkHandled] = useState(false);\n  useEffect(() => {\n    if (deepLinkHandled || campaigns.length === 0) return;\n    const campaignId = new URLSearchParams(window.location.search).get("campaignId");\n    if (!campaignId) return;\n    const campaign = campaigns.find((item) => item.id === campaignId);\n    if (!campaign) return;\n    setDeepLinkHandled(true);\n    openEdit(campaign);\n  }, [campaigns, deepLinkHandled]);\n\n  function handlePauseResume''',
)

# Revenue Scout badges in mobile and desktop list.
replace_once(
    campaign_ui,
    '''                      <Badge variant="outline" className={`text-xs ${tipoCfg.className}`}>{tipoCfg.label}</Badge>\n                      <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>''',
    '''                      <Badge variant="outline" className={`text-xs ${tipoCfg.className}`}>{tipoCfg.label}</Badge>\n                      <Badge variant="outline" className={`text-xs ${statusCfg.className}`}>{statusCfg.label}</Badge>\n                      {getRevenueScoutContext(c) && (\n                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">Revenue Scout</Badge>\n                      )}''',
)

replace_once(
    campaign_ui,
    '''                      <TableCell className="font-medium max-w-[200px] truncate">\n                        {c.nome}\n                      </TableCell>''',
    '''                      <TableCell className="font-medium max-w-[240px]">\n                        <div className="flex items-center gap-2 min-w-0">\n                          <span className="truncate">{c.nome}</span>\n                          {getRevenueScoutContext(c) && (\n                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-[10px] shrink-0">Scout</Badge>\n                          )}\n                        </div>\n                      </TableCell>''',
)

print("Revenue Scout campaign package applied")
