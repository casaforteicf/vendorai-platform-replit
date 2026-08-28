from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"anchor not found: {label} in {path}")
    p.write_text(s.replace(old, new, 1))

content = "artifacts/frontend/src/pages/Content.tsx"
replace_once(content, '''      suggestedPlatform: imagens.length > 0 ? "meta" : "google",
      creativeDraft: { headlines, descriptions, imagens },''', '''      suggestedPlatform: "meta",
      sourceVariationIndex: index,
      creativeDraft: { headlines, descriptions, imagens },''', "content draft")
replace_once(content, '''            {contentId && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 h-7"
                onClick={sendToSponsoredAds}
                title="Leva este conteúdo para Anúncios Patrocinados como criativo de uma nova campanha"
              >
                <Megaphone className="h-3 w-3" />
                Ir para Anúncios Patrocinados
              </Button>
            )}''', '''            {contentId && type !== "reels" && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1 h-7"
                onClick={sendToSponsoredAds}
                title="Se esta variação já foi publicada no Instagram, impulsiona a publicação existente; se ainda não foi, cria um anúncio Meta usando este conteúdo."
              >
                <Megaphone className="h-3 w-3" />
                Patrocinar este conteúdo
              </Button>
            )}''', "content button")

schema = "lib/db/src/schema/ad_campaigns.ts"
replace_once(schema, '''    dadosProprios?: { remarketing: string[]; customerMatch: string[]; semelhantes: string[] };
  }>().notNull().default({}),''', '''    dadosProprios?: { remarketing: string[]; customerMatch: string[]; semelhantes: string[] };
    origemInstagram?: { mediaId: string; variationIndex: number; contentGenerationId: string };
  }>().notNull().default({}),''', "segmentacao source")

ads_route = "artifacts/api-server/src/routes/ads.ts"
replace_once(ads_route, '''  contentGenerationsTable,
} from "@workspace/db";''', '''  contentGenerationsTable,
  contentPublishedPostsTable,
} from "@workspace/db";''', "published import")
replace_once(ads_route, '''  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, utmCode }).returning();''', '''  let segmentacao = parsed.data.segmentacao ?? {};
  const sourceVariationIndex = Number(req.body?.sourceVariationIndex);
  if (parsed.data.contentGenerationId && Number.isInteger(sourceVariationIndex) && sourceVariationIndex >= 0) {
    const [publishedPost] = await db
      .select({ instagramMediaId: contentPublishedPostsTable.instagramMediaId })
      .from(contentPublishedPostsTable)
      .where(and(
        eq(contentPublishedPostsTable.tenantId, tenantId),
        eq(contentPublishedPostsTable.contentGenerationId, parsed.data.contentGenerationId),
        eq(contentPublishedPostsTable.variationIndex, sourceVariationIndex),
      ))
      .orderBy(desc(contentPublishedPostsTable.publishedAt))
      .limit(1);
    if (publishedPost?.instagramMediaId) {
      segmentacao = { ...segmentacao, origemInstagram: { mediaId: publishedPost.instagramMediaId, variationIndex: sourceVariationIndex, contentGenerationId: parsed.data.contentGenerationId } };
    }
  }

  // Código curto e único pra usar como utm_campaign em qualquer link de
  // divulgação dessa campanha (ver adAttribution.ts).
  const utmCode = `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;

  const [row] = await db.insert(adCampaignsTable).values({ ...parsed.data, segmentacao, utmCode }).returning();''', "resolve published")

meta = "artifacts/api-server/src/services/meta-ads-campaign-publish.ts"
replace_once(meta, '''async function getPageIdFromInstagramConnection(tenantId: string): Promise<string> {
  const [conn] = await db
    .select({ pageId: instagramConnectionsTable.pageId })
    .from(instagramConnectionsTable)
    .where(and(eq(instagramConnectionsTable.tenantId, tenantId)));
  if (!conn?.pageId) {
    throw new MetaAdsPublishError(
      "Anúncio da Meta precisa de uma Página do Facebook pra rodar — conecte o Instagram (Configurações → Integrações) primeiro, o anúncio reaproveita a mesma Página vinculada lá.",
    );
  }
  return conn.pageId;
}''', '''async function getInstagramIdentity(tenantId: string): Promise<{ pageId: string; instagramUserId: string | null }> {
  const [conn] = await db
    .select({ pageId: instagramConnectionsTable.pageId, accountId: instagramConnectionsTable.accountId })
    .from(instagramConnectionsTable)
    .where(and(eq(instagramConnectionsTable.tenantId, tenantId)));
  if (!conn?.pageId) {
    throw new MetaAdsPublishError(
      "Anúncio da Meta precisa de uma Página do Facebook pra rodar — conecte o Instagram (Configurações → Integrações) primeiro, o anúncio reaproveita a mesma Página vinculada lá.",
    );
  }
  return { pageId: conn.pageId, instagramUserId: conn.accountId ?? null };
}''', "identity helper")
replace_once(meta, '''  const finalUrl = await resolveFinalUrl(tenantId, campanha);
  const { accessToken, adAccountId } = await getValidAccessToken(tenantId);
  const pageId = await getPageIdFromInstagramConnection(tenantId);

  const campaignName = `Vendor.ai — ${headline} — ${new Date().toISOString().slice(0, 10)}`;''', '''  const origemInstagram = campanha.segmentacao?.origemInstagram;
  const finalUrl = origemInstagram ? null : await resolveFinalUrl(tenantId, campanha);
  const { accessToken, adAccountId } = await getValidAccessToken(tenantId);
  const { pageId, instagramUserId } = await getInstagramIdentity(tenantId);
  if (origemInstagram && !instagramUserId) {
    throw new MetaAdsPublishError("A publicação existe, mas a conexão do Instagram está sem o ID da conta profissional. Reconecte Instagram em Configurações → Integrações.");
  }

  const campaignName = `Vendor.ai — ${headline} — ${new Date().toISOString().slice(0, 10)}`;''', "source setup")
replace_once(meta, '''    objective: "OUTCOME_TRAFFIC",
    status: "PAUSED",''', '''    objective: origemInstagram ? "OUTCOME_ENGAGEMENT" : "OUTCOME_TRAFFIC",
    status: "PAUSED",''', "objective")
replace_once(meta, '''    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: JSON.stringify({ geo_locations: { countries: ["BR"] } }),
  });

  // 3) Ad Creative — link ad de imagem única, roda como a Página do
  // Facebook vinculada ao Instagram do tenant.
  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      message: primaryText,
      link: finalUrl,
      name: headline,
      description,
      picture: creative.imagens[0],
      call_to_action: { type: "LEARN_MORE", value: { link: finalUrl } },
    },
  };
  const creativeRes = await metaApi<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, "POST", {
    name: `${campaignName} — criativo`,
    object_story_spec: JSON.stringify(objectStorySpec),
  });''', '''    optimization_goal: origemInstagram ? "POST_ENGAGEMENT" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    status: "PAUSED",
    targeting: JSON.stringify(origemInstagram ? { geo_locations: { countries: ["BR"] }, publisher_platforms: ["instagram"] } : { geo_locations: { countries: ["BR"] } }),
  });

  let creativeRes: { id: string };
  if (origemInstagram) {
    creativeRes = await metaApi<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, "POST", {
      name: `${campaignName} — publicação Instagram`,
      object_id: pageId,
      instagram_user_id: instagramUserId!,
      source_instagram_media_id: origemInstagram.mediaId,
    });
  } else {
    const objectStorySpec = {
      page_id: pageId,
      instagram_actor_id: instagramUserId ?? undefined,
      link_data: {
        message: primaryText,
        link: finalUrl!,
        name: headline,
        description,
        picture: creative.imagens[0],
        call_to_action: { type: "LEARN_MORE", value: { link: finalUrl! } },
      },
    };
    creativeRes = await metaApi<{ id: string }>(`act_${adAccountId}/adcreatives`, accessToken, "POST", {
      name: `${campaignName} — criativo`,
      object_story_spec: JSON.stringify(objectStorySpec),
    });
  }''', "creative branch")

ads = "artifacts/frontend/src/pages/Ads.tsx"
replace_once(ads, '''  latestCreative: AdCreative | null;
}''', '''  latestCreative: AdCreative | null;
  segmentacao?: { origemInstagram?: { mediaId: string; variationIndex: number; contentGenerationId: string } };
}''', "campaign type")
replace_once(ads, '''  sourceType: string;
  suggestedPlatform: "google" | "meta";
  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };''', '''  sourceType: string;
  suggestedPlatform: "google" | "meta";
  sourceVariationIndex?: number;
  creativeDraft: { headlines: string[]; descriptions: string[]; imagens: string[] };''', "draft type")
replace_once(ads, '''  const [sourceDraft, setSourceDraft] = useState<ImportedContentDraft | null>(null);''', '''  const [sourceDraft, setSourceDraft] = useState<ImportedContentDraft | null>(null);
  const [autoGenerateAfterCreate, setAutoGenerateAfterCreate] = useState(false);''', "auto state")
replace_once(ads, '''      setSourceDraft(draft);
      setForm({''', '''      setSourceDraft(draft);
      setAutoGenerateAfterCreate(false);
      setForm({''', "source state")
replace_once(ads, '''        creativeDraft: sourceDraft?.creativeDraft ?? null,
      };''', '''        creativeDraft: sourceDraft?.creativeDraft ?? null,
        sourceVariationIndex: sourceDraft?.sourceVariationIndex ?? sourceDraft?.variationIndex ?? null,
      };''', "source body")
replace_once(ads, '''    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({
        title: "Campanha criada",
        description: sourceDraft ? "O conteúdo do Marketing foi anexado como criativo. Revise e aprove antes de publicar." : "Agora gere o criativo antes de aprovar.",
      });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      setSourceDraft(null);
    },''', '''    onSuccess: (campaign: AdCampaign) => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      const shouldAutoGenerate = autoGenerateAfterCreate && campaign.tipoAnuncio === "imagem" && !(campaign as any).latestCreative;
      toast({
        title: sourceDraft ? "Campanha de patrocínio criada" : "Campanha criada",
        description: sourceDraft
          ? (campaign.segmentacao?.origemInstagram ? "A publicação existente do Instagram foi vinculada. Revise e aprove antes de publicar." : "O conteúdo do Marketing foi anexado como novo criativo Meta. Revise e aprove antes de publicar.")
          : shouldAutoGenerate ? "Rascunho criado. A IA está gerando texto e imagem do anúncio." : "Agora gere o criativo antes de aprovar.",
      });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
      setSourceDraft(null);
      setAutoGenerateAfterCreate(false);
      if (shouldAutoGenerate) gerarCriativo.mutate(campaign.id);
    },''', "create success")
replace_once(ads, '''        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>''', '''        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            setSourceDraft(null);
            setAutoGenerateAfterCreate(true);
            setForm({ ...EMPTY_FORM, plataforma: "meta", tipoAnuncio: "imagem", itemTipo: "livre", destinoClique: "whatsapp", itemLabel: "" });
            setOpen(true);
          }}>
            <Sparkles className="h-4 w-4 mr-1" /> Gerar anúncio com IA
          </Button>
          <Button onClick={() => { setAutoGenerateAfterCreate(false); setSourceDraft(null); setForm({ ...EMPTY_FORM }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
        </div>''', "header button")
replace_once(ads, '''            {form.itemTipo === "livre" ? (
              <p className="text-xs text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">Campanha institucional/de marca, sem vínculo com um item específico do estoque ou catálogo.</p>
            ) : form.modo === "unico" ? (''', '''            {form.itemTipo === "livre" ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <LabelTip tip="Explique em uma frase o produto, serviço, oferta ou mensagem que a IA deve transformar em anúncio.">O que você quer anunciar?</LabelTip>
                <Input placeholder="Ex: orçamento gratuito de esquadrias de PVC para casas de alto padrão" value={form.itemLabel} onChange={(e) => setForm((f) => ({ ...f, itemLabel: e.target.value }))} />
                <p className="text-xs text-muted-foreground">A IA combina esta orientação com o perfil real do negócio para gerar texto e imagem.</p>
              </div>
            ) : form.modo === "unico" ? (''', "free brief")
replace_once(ads, '''                        <Badge variant="outline" className="capitalize">{c.modo === "unico" ? "Item único" : "Carrossel"}</Badge>
                      </div>''', '''                        <Badge variant="outline" className="capitalize">{c.modo === "unico" ? "Item único" : "Carrossel"}</Badge>
                        {c.segmentacao?.origemInstagram && <Badge className="bg-pink-100 text-pink-800">Publicação do Instagram</Badge>}
                      </div>''', "source badge")
replace_once(ads, '''    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Campanha publicada no Google Ads", description: "Criada pausada — revise no Google Ads e ative quando quiser começar a gastar." });
    },''', '''    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Campanha publicada", description: "Criada pausada na plataforma — revise e ative somente quando quiser começar a gastar." });
    },''', "publish toast")

print("patch applied")
