from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found: {label} in {path}")
    p.write_text(text.replace(old, new, 1))

ads_route = "artifacts/api-server/src/routes/ads.ts"
replace_once(
    ads_route,
    '''  let importedCreative = null;
  if (row && creativeDraft?.success) {
    const draft = creativeDraft.data;
    if (draft.headlines.length || draft.descriptions.length || draft.imagens.length) {
      [importedCreative] = await db.insert(adCreativesTable).values({''',
    '''  let importedCreative = null;
  if (row && creativeDraft?.success) {
    const draft = creativeDraft.data;
    const hasExistingInstagramPost = Boolean((segmentacao as any)?.origemInstagram?.mediaId);
    const canImportDraft =
      (draft.headlines.length || draft.descriptions.length || draft.imagens.length) &&
      (row.tipoAnuncio !== "imagem" || draft.imagens.length > 0 || hasExistingInstagramPost);
    if (canImportDraft) {
      [importedCreative] = await db.insert(adCreativesTable).values({''',
    "skip invalid image draft",
)

ads_front = "artifacts/frontend/src/pages/Ads.tsx"
replace_once(
    ads_front,
    '''      setSourceDraft(draft);
      setAutoGenerateAfterCreate(false);
      setForm({''',
    '''      setSourceDraft(draft);
      setAutoGenerateAfterCreate(
        draft.suggestedPlatform === "meta" && draft.creativeDraft.imagens.length === 0,
      );
      setForm({''',
    "auto generate missing source media",
)
replace_once(
    ads_front,
    '''            <li>Anúncio na Meta precisa do Instagram conectado primeiro (Configurações → Integrações) — o anúncio roda na mesma Página do Facebook vinculada lá.</li>''',
    '''            <li>Anúncio na Meta exige Meta Ads conectado. Para veicular no Instagram, a conta profissional precisa estar vinculada à Página do Facebook acessível pela mesma conexão Meta.</li>''',
    "meta help text",
)

meta_publish = "artifacts/api-server/src/services/meta-ads-campaign-publish.ts"
replace_once(
    meta_publish,
    '''  if (!creative) {
    throw new MetaAdsPublishError("Nenhum criativo aprovado pra essa campanha — gere e aprove o criativo antes de publicar.");
  }
  if (!creative.imagens[0]) {
    throw new MetaAdsPublishError("Criativo aprovado está sem imagem.");
  }
  const headline = creative.headlines[0] ?? campanha.vertical;''',
    '''  if (!creative) {
    throw new MetaAdsPublishError("Nenhum criativo aprovado pra essa campanha — gere e aprove o criativo antes de publicar.");
  }
  const origemInstagram = campanha.segmentacao?.origemInstagram;
  if (!origemInstagram && !creative.imagens[0]) {
    throw new MetaAdsPublishError("Criativo aprovado está sem imagem.");
  }
  const headline = creative.headlines[0] ?? campanha.vertical;''',
    "allow existing Instagram media without image draft",
)
replace_once(
    meta_publish,
    '''  const origemInstagram = campanha.segmentacao?.origemInstagram;
  const finalUrl = origemInstagram ? null : await resolveFinalUrl(tenantId, campanha);''',
    '''  const finalUrl = origemInstagram ? null : await resolveFinalUrl(tenantId, campanha);''',
    "remove duplicate origin",
)

print("AI sponsored ads patch applied")
