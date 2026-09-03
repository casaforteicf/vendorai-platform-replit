from pathlib import Path
import re

ADS = Path("artifacts/api-server/src/routes/ads.ts")
text = ADS.read_text()

# A autorização do Marketing vem da configuração oficial do Content Autopilot.
text = text.replace(
    "  contentPublishedPostsTable,\n  adCampaignEventsTable,\n",
    "  contentPublishedPostsTable,\n  contentAutopilotConfigTable,\n  adCampaignEventsTable,\n",
    1,
)

anchor = 'router.get("/tenants/:tenantId/ads/overview", async (req, res) => {'
if text.count(anchor) != 1:
    raise SystemExit("Não encontrei o ponto único antes do overview de Ads")

helpers = r'''
class AdAutomationError extends Error {
  constructor(message: string, readonly status = 422) {
    super(message);
    this.name = "AdAutomationError";
  }
}

async function isMarketingAutomatic(tenantId: string): Promise<boolean> {
  const [config] = await db
    .select({ ativo: contentAutopilotConfigTable.ativo, automationMode: contentAutopilotConfigTable.automationMode })
    .from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
    .limit(1);
  return Boolean(config?.ativo && config.automationMode === "automatic");
}

function validateAutonomousCampaignControl(campanha: AdCampaign) {
  const control = campanha.segmentacao?.campaignControl;
  const dailyBudget = Number(campanha.orcamentoDiario);
  const totalBudget = Number(control?.totalBudget);
  if (!control) throw new AdAutomationError("Campanha sem controle de orçamento/período. A IA não pode ativar mídia sem limites definidos.");
  if (!Number.isFinite(dailyBudget) || dailyBudget <= 0) throw new AdAutomationError("Limite diário inválido para patrocínio automático.");
  if (!Number.isFinite(totalBudget) || totalBudget < dailyBudget) throw new AdAutomationError("Orçamento total inválido para patrocínio automático.");
  const start = new Date(`${control.startDate}T00:00:00`);
  const end = new Date(`${control.endDate}T23:59:59`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw new AdAutomationError("Período inválido para patrocínio automático.");
  }
  if (control.automation?.allowBudgetIncrease !== false) {
    throw new AdAutomationError("A IA só pode patrocinar quando aumento automático de orçamento está bloqueado.");
  }
  if (control.conversionTracking?.mode === "platform" && !control.conversionTracking.confirmed) {
    throw new AdAutomationError("A conversão da plataforma precisa estar confirmada antes da ativação automática.");
  }
}

async function generateCreativeForCampaign(tenantId: string, campanha: AdCampaign) {
  if (campanha.tipoAnuncio !== "rsa_pmax" && campanha.tipoAnuncio !== "imagem") {
    throw new AdAutomationError("Geração de criativo por IA só se aplica a campanhas rsa_pmax ou imagem.", 400);
  }
  if (campanha.itemTipo !== "landing_page" && campanha.itemTipo !== "livre" && !campanha.itemId) {
    throw new AdAutomationError("Campanha sem item_id; geração por item único não se aplica.", 400);
  }

  const item = (campanha.itemTipo === "produto" || campanha.itemTipo === "veiculo" || campanha.itemTipo === "imovel")
    ? await buildResumoItem(campanha.itemTipo, campanha.itemId as string, tenantId)
    : { itemTipo: campanha.itemTipo, resumo: await buildResumoLivreOuLandingPage(campanha, tenantId), nomeCurto: campanha.itemLabel || campanha.vertical };
  if (!item) throw new AdAutomationError("Item de origem da campanha não encontrado.", 404);

  const previousRejectionReason = (campanha.segmentacao as any)?.previousRejectionReason;
  if (previousRejectionReason) {
    item.resumo += `\nCorreção obrigatória de política: a versão anterior foi recusada por: ${previousRejectionReason}. Crie uma formulação diferente, factual e compatível; não repita o trecho ou alegação problemática.`;
  }

  if (campanha.tipoAnuncio === "rsa_pmax") {
    const gerado = await gerarCriativoRSA(item as any, logger, tenantId);
    if (!gerado) throw new AdAutomationError("Falha ao gerar criativo RSA.", 502);
    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: gerado.headlines,
      descriptions: gerado.descriptions,
      imagens: [],
    }).returning();
    if (!creative) throw new AdAutomationError("Falha ao persistir criativo RSA.", 500);
    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo RSA gerado");
    return creative;
  }

  const [profile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  if (campanha.imagemEscolhidaUrl) {
    const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger, { pularGeracaoDeImagem: true });
    if (!gerado) throw new AdAutomationError("Falha ao gerar texto do criativo de imagem.", 502);
    const [creative] = await db.insert(adCreativesTable).values({
      campaignId: campanha.id,
      headlines: [gerado.headline, gerado.primaryText],
      descriptions: gerado.description ? [gerado.description] : [],
      imagens: [campanha.imagemEscolhidaUrl],
    }).returning();
    if (!creative) throw new AdAutomationError("Falha ao persistir criativo de imagem.", 500);
    logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo de imagem gerado com foto existente");
    return creative;
  }

  const gerado = await gerarCriativoImagem(item, tenantId, profile ?? {}, logger);
  if (!gerado) throw new AdAutomationError("Falha ao gerar criativo de imagem.", 502);
  const [creative] = await db.insert(adCreativesTable).values({
    campaignId: campanha.id,
    headlines: [gerado.headline, gerado.primaryText],
    descriptions: gerado.description ? [gerado.description] : [],
    imagens: [gerado.imageUrl],
  }).returning();
  if (!creative) throw new AdAutomationError("Falha ao persistir criativo de imagem.", 500);
  logger.info({ tenantId, campanhaId: campanha.id, creativeId: creative.id }, "ads: criativo de imagem gerado");
  return creative;
}

async function executeSponsoredContentAutonomously(tenantId: string, campanha: AdCampaign) {
  if (!campanha.contentGenerationId) {
    return { attempted: false, executed: false, reason: "Campanha não veio de uma publicação do Marketing." };
  }
  if (!(await isMarketingAutomatic(tenantId))) {
    return { attempted: false, executed: false, reason: "Marketing não está no modo Automático." };
  }
  if (campanha.plataforma !== "google" && campanha.plataforma !== "meta") {
    return { attempted: true, executed: false, reason: `Patrocínio automático ainda não disponível para ${campanha.plataforma}.` };
  }

  validateAutonomousCampaignControl(campanha);

  let [creative] = await db
    .select()
    .from(adCreativesTable)
    .where(eq(adCreativesTable.campaignId, campanha.id))
    .orderBy(desc(adCreativesTable.geradoEm))
    .limit(1);

  if (!creative) creative = await generateCreativeForCampaign(tenantId, campanha);

  if (creative.status !== "aprovado") {
    const [approved] = await db
      .update(adCreativesTable)
      .set({ status: "aprovado", aprovadoPorId: null, aprovadoEm: new Date() })
      .where(eq(adCreativesTable.id, creative.id))
      .returning();
    creative = approved ?? creative;
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "creative_auto_approved",
      severity: "success",
      message: "Criativo aprovado automaticamente pelo Marketing IA.",
      metadata: { actor: "marketing_ai", creativeId: creative.id },
    });
  }

  const published = campanha.plataforma === "google"
    ? await publishCampaignToGoogleAds(tenantId, campanha.id)
    : await publishCampaignToMetaAds(tenantId, campanha.id);

  await recordAdCampaignEvent({
    tenantId,
    campaignId: campanha.id,
    eventType: "auto_published",
    severity: "success",
    message: "Marketing IA publicou a campanha na plataforma usando os limites configurados.",
    metadata: { actor: "marketing_ai", plataforma: campanha.plataforma, creativeId: creative.id },
  });

  try {
    if (campanha.plataforma === "google") await setGoogleAdsCampaignStatus(tenantId, campanha.id, true);
    else await setMetaAdsCampaignStatus(tenantId, campanha.id, true);
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "auto_activated",
      severity: "success",
      message: "Marketing IA ativou o patrocínio dentro do orçamento e período configurados.",
      metadata: { actor: "marketing_ai", plataforma: campanha.plataforma, dailyBudget: campanha.orcamentoDiario, totalBudget: campanha.segmentacao?.campaignControl?.totalBudget },
    });
    return { attempted: true, executed: true, published: true, activated: true, creativeId: creative.id, platformResult: published };
  } catch (error) {
    const warning = error instanceof Error ? error.message : "A campanha foi publicada, mas a plataforma não aceitou a ativação imediata.";
    await recordAdCampaignEvent({
      tenantId,
      campaignId: campanha.id,
      eventType: "auto_activation_pending",
      severity: "warning",
      message: warning,
      metadata: { actor: "marketing_ai", plataforma: campanha.plataforma },
    }).catch(() => null);
    return { attempted: true, executed: true, published: true, activated: false, creativeId: creative.id, warning, platformResult: published };
  }
}

'''
text = text.replace(anchor, helpers + anchor, 1)

# Reutiliza o mesmo gerador tanto no fluxo manual quanto no automático.
route_pattern = re.compile(
    r'router\.post\("/tenants/:tenantId/ads/campaigns/:id/gerar-criativo", async \(req, res\) => \{.*?\n\}\);\n\nrouter\.post\("/tenants/:tenantId/ads/creatives/:id/aprovar",',
    re.S,
)
route_replacement = '''router.post("/tenants/:tenantId/ads/campaigns/:id/gerar-criativo", async (req, res) => {
  const tenantId = req.params.tenantId as string;
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const [campanha] = await db.select().from(adCampaignsTable)
    .where(and(eq(adCampaignsTable.id, req.params.id as string), eq(adCampaignsTable.tenantId, tenantId)));
  if (!campanha) return res.status(404).json({ error: "Campanha not found" });

  try {
    const creative = await generateCreativeForCampaign(tenantId, campanha);
    return res.status(201).json(creative);
  } catch (error) {
    if (error instanceof AdAutomationError) return res.status(error.status).json({ error: error.message });
    req.log.error({ error, tenantId, campaignId: campanha.id }, "ads: falha inesperada ao gerar criativo");
    return res.status(500).json({ error: "Falha inesperada ao gerar criativo." });
  }
});

router.post("/tenants/:tenantId/ads/creatives/:id/aprovar",'''
text, count = route_pattern.subn(route_replacement, text, count=1)
if count != 1:
    raise SystemExit(f"Não consegui substituir a rota de geração de criativo: {count}")

# Depois de criar a campanha, o modo Automático pode executar toda a mídia sem aprovação manual.
old_create_tail = '''  if (row) await recordAdCampaignEvent({ tenantId, campaignId: row.id, userId: (req as any).user?.sub, eventType: "created", message: "Campanha criada como rascunho." });
  return res.status(201).json({ ...row, latestCreative: importedCreative });
});'''
new_create_tail = '''  let autonomousExecution: Awaited<ReturnType<typeof executeSponsoredContentAutonomously>> | null = null;
  if (row) {
    await recordAdCampaignEvent({ tenantId, campaignId: row.id, userId: (req as any).user?.sub, eventType: "created", message: "Campanha criada como rascunho." });
    try {
      autonomousExecution = await executeSponsoredContentAutonomously(tenantId, row);
    } catch (error) {
      const warning = error instanceof Error ? error.message : "A IA não conseguiu concluir o patrocínio automático.";
      autonomousExecution = { attempted: true, executed: false, reason: warning };
      await recordAdCampaignEvent({
        tenantId,
        campaignId: row.id,
        eventType: "autopilot_error",
        severity: "warning",
        message: warning,
        metadata: { actor: "marketing_ai" },
      }).catch(() => null);
      req.log.warn({ error, tenantId, campaignId: row.id }, "ads: patrocínio automático não concluído; campanha preservada");
    }
  }
  return res.status(201).json({ ...row, latestCreative: importedCreative, autonomousExecution });
});'''
if text.count(old_create_tail) != 1:
    raise SystemExit(f"Esperava um único final da criação de campanha, encontrei {text.count(old_create_tail)}")
text = text.replace(old_create_tail, new_create_tail, 1)

text = text.replace(
    '// Ambas exigem clique explícito do lojista — nada aqui roda sozinho.\n',
    '// As rotas manuais continuam disponíveis; no modo Automático o Marketing IA pode usar os mesmos motores sem aprovação por etapa, sempre dentro dos limites já configurados.\n',
    1,
)

ADS.write_text(text)

# Atualiza a UX para não mandar o usuário revisar algo que a IA já executou.
FRONT = Path("artifacts/frontend/src/pages/Ads.tsx")
front = FRONT.read_text()
front = front.replace(
    '      return r.json();\n    },\n    onSuccess: (campaign: AdCampaign) => {\n      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });\n      const shouldAutoGenerate =\n        autoGenerateAfterCreate &&\n        (campaign.tipoAnuncio === "imagem" || campaign.tipoAnuncio === "rsa_pmax") &&\n        !(campaign as any).latestCreative;\n      toast({\n        title: sourceDraft ? "Campanha de patrocínio criada" : "Campanha criada",\n        description: sourceDraft\n          ? (campaign.segmentacao?.origemInstagram ? "A publicação existente do Instagram foi vinculada. Revise e aprove antes de publicar." : "O conteúdo do Marketing foi anexado como novo criativo Meta. Revise e aprove antes de publicar.")\n          : shouldAutoGenerate ? "Rascunho criado. A IA está gerando texto e imagem do anúncio." : "Agora gere o criativo antes de aprovar.",\n      });',
    '      return r.json();\n    },\n    onSuccess: (campaign: AdCampaign & { autonomousExecution?: { attempted: boolean; executed: boolean; published?: boolean; activated?: boolean; reason?: string; warning?: string } | null }) => {\n      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });\n      const automation = campaign.autonomousExecution;\n      const shouldAutoGenerate =\n        !automation?.attempted &&\n        autoGenerateAfterCreate &&\n        (campaign.tipoAnuncio === "imagem" || campaign.tipoAnuncio === "rsa_pmax") &&\n        !(campaign as any).latestCreative;\n      toast({\n        title: automation?.activated ? "IA publicou e ativou o patrocínio" : sourceDraft ? "Campanha de patrocínio criada" : "Campanha criada",\n        description: automation?.activated\n          ? "Criativo aprovado, campanha publicada e mídia ativada automaticamente dentro do orçamento e período definidos."\n          : automation?.published\n            ? `A IA publicou a campanha, mas a ativação ficou pendente: ${automation.warning ?? "aguardando a plataforma"}`\n            : automation?.attempted && !automation.executed\n              ? `Campanha preservada como rascunho. A automação não concluiu: ${automation.reason ?? "verifique a conexão da plataforma"}`\n              : sourceDraft\n                ? "O conteúdo do Marketing foi anexado. No modo Automático, a IA executa assim que todos os limites e conexões estiverem válidos."\n                : shouldAutoGenerate ? "Rascunho criado. A IA está gerando texto e imagem do anúncio." : "Campanha criada com os limites definidos.",\n      });',
    1,
)
if front == FRONT.read_text():
    raise SystemExit("Patch do feedback de criação em Ads.tsx não foi aplicado")
FRONT.write_text(front)
