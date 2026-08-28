from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"pattern not found: {label} in {path}")
    p.write_text(text.replace(old, new, 1))


# 1) Fecha a permissão de insights e usa o host canônico no Instagram Login direto.
instagram_oauth = "artifacts/api-server/src/services/instagram-oauth.ts"
replace_once(
    instagram_oauth,
    'return `https://appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;',
    'return `https://app.appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;',
    "instagram redirect host branch",
)
replace_once(
    instagram_oauth,
    'return `https://appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;',
    'return `https://app.appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;',
    "instagram redirect production",
)
replace_once(
    instagram_oauth,
    'scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish",',
    'scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish,instagram_business_manage_insights",',
    "instagram insights scope",
)

# 2) Atualiza OAuth/Graph do Meta Ads e expõe as identidades Página + Instagram que a conta Meta realmente administra.
meta_oauth = "artifacts/api-server/src/services/meta-ads-oauth.ts"
replace_once(
    meta_oauth,
    'return "https://appvendorai.com/api/auth/meta-ads/callback";',
    'return "https://app.appvendorai.com/api/auth/meta-ads/callback";',
    "meta ads callback",
)
replace_once(
    meta_oauth,
    'const META_GRAPH_VERSION = "v21.0";\nconst META_OAUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";',
    'const META_GRAPH_VERSION = "v26.0";\nconst META_OAUTH_BASE = "https://www.facebook.com/v26.0/dialog/oauth";',
    "meta graph version",
)
replace_once(
    meta_oauth,
    'const META_ADS_SCOPE = "ads_management,ads_read,business_management";',
    'const META_ADS_SCOPE = "ads_management,ads_read,business_management,pages_show_list,pages_read_engagement,instagram_basic";',
    "meta ads scopes",
)

anchor = '''interface AdAccountsApiResponse {
  data: Array<{ id: string; name: string; currency: string; business?: { id: string } }>;
}
'''
addition = '''interface AdAccountsApiResponse {
  data: Array<{ id: string; name: string; currency: string; business?: { id: string } }>;
}

export interface AccessibleInstagramIdentity {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramUserId: string;
  instagramUsername: string | null;
}

interface PagesApiResponse {
  data: Array<{
    id: string;
    name: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
}

export function normalizeMetaAdAccountId(adAccountId: string): string {
  const normalized = adAccountId.trim();
  if (!normalized) throw new Error("Ad account ID ausente");
  return normalized.startsWith("act_") ? normalized : `act_${normalized}`;
}

export async function listAccessibleInstagramIdentities(accessToken: string): Promise<AccessibleInstagramIdentity[]> {
  const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao listar Páginas/Instagram acessíveis pela conexão Meta Ads");
    throw new Error(`Failed to list Meta Pages/Instagram identities: ${res.status}`);
  }

  const payload = (await res.json()) as PagesApiResponse;
  return payload.data.flatMap((page) => {
    const ig = page.instagram_business_account;
    if (!ig?.id || !page.access_token) return [];
    return [{
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      instagramUserId: ig.id,
      instagramUsername: ig.username ?? null,
    }];
  });
}
'''
replace_once(meta_oauth, anchor, addition, "meta identity helpers")

# 3) Corrige publicação real: act_ canônico, identidade da conexão Meta e Instagram post boost cross-login.
meta_publish = "artifacts/api-server/src/services/meta-ads-campaign-publish.ts"
replace_once(
    meta_publish,
    '''  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  META_GRAPH_BASE,
} from "./meta-ads-oauth.js";''',
    '''  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  listAccessibleInstagramIdentities,
  normalizeMetaAdAccountId,
  META_GRAPH_BASE,
} from "./meta-ads-oauth.js";''',
    "meta publish imports",
)

old_identity = '''async function getInstagramIdentity(tenantId: string): Promise<{ pageId: string; instagramUserId: string | null }> {
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
}
'''
new_identity = '''async function getInstagramIdentity(
  tenantId: string,
  accessToken: string,
): Promise<{ pageId: string; pageAccessToken: string; instagramUserId: string }> {
  const [directInstagram] = await db
    .select({ username: instagramConnectionsTable.username })
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId));

  const identities = await listAccessibleInstagramIdentities(accessToken);
  if (identities.length === 0) {
    throw new MetaAdsPublishError(
      "A conexão Meta Ads não encontrou nenhuma Página do Facebook com Instagram profissional vinculado. Vincule a conta profissional a uma Página e reconecte Meta Ads.",
    );
  }

  const expectedUsername = directInstagram?.username?.trim().toLowerCase();
  if (expectedUsername) {
    const matching = identities.find(
      (identity) => identity.instagramUsername?.trim().toLowerCase() === expectedUsername,
    );
    if (matching) {
      return {
        pageId: matching.pageId,
        pageAccessToken: matching.pageAccessToken,
        instagramUserId: matching.instagramUserId,
      };
    }
  }

  if (identities.length === 1 && identities[0]) {
    const identity = identities[0];
    return {
      pageId: identity.pageId,
      pageAccessToken: identity.pageAccessToken,
      instagramUserId: identity.instagramUserId,
    };
  }

  throw new MetaAdsPublishError(
    "A conexão Meta Ads administra mais de uma Página com Instagram e não foi possível identificar automaticamente qual corresponde ao Instagram conectado no VendorAI. Confirme que as duas integrações usam a mesma conta profissional.",
  );
}

async function fetchDirectInstagramPermalink(tenantId: string, mediaId: string): Promise<string | null> {
  const [direct] = await db
    .select({ token: instagramConnectionsTable.pageAccessToken })
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId));
  if (!direct?.token) return null;

  const url = new URL(`https://graph.instagram.com/v26.0/${encodeURIComponent(mediaId)}`);
  url.searchParams.set("fields", "id,permalink");
  url.searchParams.set("access_token", direct.token);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const payload = (await res.json()) as { permalink?: string };
    return payload.permalink ?? null;
  } catch {
    return null;
  }
}

async function resolveBoostableInstagramMediaId(
  tenantId: string,
  sourceMediaId: string,
  instagramUserId: string,
  pageAccessToken: string,
): Promise<string> {
  const directPermalink = await fetchDirectInstagramPermalink(tenantId, sourceMediaId);

  let nextUrl: string | null = `${META_GRAPH_BASE}/${encodeURIComponent(instagramUserId)}/media`;
  for (let page = 0; page < 5 && nextUrl; page += 1) {
    const url = new URL(nextUrl);
    if (page === 0) {
      url.searchParams.set("fields", "id,permalink");
      url.searchParams.set("limit", "100");
      url.searchParams.set("access_token", pageAccessToken);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const raw = await res.text();
      throw new MetaAdsPublishError(traduzirErroMetaAds(`${instagramUserId}/media`, res.status, raw));
    }
    const payload = (await res.json()) as {
      data?: Array<{ id: string; permalink?: string }>;
      paging?: { next?: string };
    };

    const match = (payload.data ?? []).find(
      (media) => media.id === sourceMediaId || (!!directPermalink && media.permalink === directPermalink),
    );
    if (match) return match.id;
    nextUrl = payload.paging?.next ?? null;
  }

  throw new MetaAdsPublishError(
    "A publicação do Instagram existe no VendorAI, mas não apareceu na identidade Instagram vinculada ao Meta Ads. Confirme que Instagram e Meta Ads usam a mesma conta profissional/Página e tente novamente.",
  );
}
'''
replace_once(meta_publish, old_identity, new_identity, "meta identity resolver")

replace_once(
    meta_publish,
    '''  const { accessToken, adAccountId } = await getValidAccessToken(tenantId);
  const { pageId, instagramUserId } = await getInstagramIdentity(tenantId);
  if (origemInstagram && !instagramUserId) {
    throw new MetaAdsPublishError("A publicação existe, mas a conexão do Instagram está sem o ID da conta profissional. Reconecte Instagram em Configurações → Integrações.");
  }

  const campaignName''',
    '''  const { accessToken, adAccountId } = await getValidAccessToken(tenantId);
  const adAccountPath = normalizeMetaAdAccountId(adAccountId);
  const { pageId, pageAccessToken, instagramUserId } = await getInstagramIdentity(tenantId, accessToken);
  const boostableInstagramMediaId = origemInstagram
    ? await resolveBoostableInstagramMediaId(tenantId, origemInstagram.mediaId, instagramUserId, pageAccessToken)
    : null;

  const campaignName''',
    "meta publish identity call",
)

for resource in ("campaigns", "adsets", "adcreatives", "ads"):
    replace_once(
        meta_publish,
        f'`act_${{adAccountId}}/{resource}`',
        f'`${{adAccountPath}}/{resource}`',
        f"normalize act path {resource}",
    )

replace_once(
    meta_publish,
    'source_instagram_media_id: origemInstagram.mediaId,',
    'source_instagram_media_id: boostableInstagramMediaId!,',
    "boost source media",
)
replace_once(
    meta_publish,
    'instagram_actor_id: instagramUserId ?? undefined,',
    'instagram_user_id: instagramUserId,',
    "instagram user id field",
)

print("Meta Ads production patch applied")
