from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"anchor not found: {label} in {path}")
    p.write_text(text.replace(old, new, 1))

# OAuth: pedir a permissão de publicação usada pelo Gerador de Conteúdo.
replace_once(
    "artifacts/api-server/src/services/instagram-oauth.ts",
    '    scope: "instagram_business_basic,instagram_business_manage_messages",',
    '    scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish",',
    "instagram content publish scope",
)

# Persistência defensiva no agent_configs: direct login precisa funcionar mesmo para tenant sem linha prévia.
replace_once(
    "artifacts/api-server/src/services/instagram-oauth.ts",
    '''  await db.update(agentConfigsTable).set({
    instagramPageAccessToken: token.access_token,
    instagramPageId: account.id,
    instagramUsername: account.username,
    updatedAt: new Date(),
  }).where(eq(agentConfigsTable.tenantId, tenantId));''',
    '''  await db
    .insert(agentConfigsTable)
    .values({
      tenantId,
      instagramPageAccessToken: token.access_token,
      instagramPageId: account.id,
      instagramUsername: account.username,
    })
    .onConflictDoUpdate({
      target: agentConfigsTable.tenantId,
      set: {
        instagramPageAccessToken: token.access_token,
        instagramPageId: account.id,
        instagramUsername: account.username,
        updatedAt: new Date(),
      },
    });''',
    "agent config upsert",
)

# Publicador: o login atual é Instagram Login direto. Usa IG professional account id + Instagram User token.
publish = Path("artifacts/api-server/src/lib/instagram-publish.ts")
publish.write_text('''import type { Logger } from "pino";\n\n// Instagram API with Instagram Login (Business Login).\n// Esse fluxo usa Instagram User access token e o ID da conta profissional\n// diretamente; não depende de uma Facebook Page vinculada.\nconst GRAPH = "https://graph.instagram.com/v26.0";\n\nasync function gFetch(url: string, init?: RequestInit): Promise<unknown> {\n  const res = await fetch(url, init);\n  const json = (await res.json()) as { error?: unknown };\n  if (!res.ok) throw new Error(JSON.stringify(json.error ?? json));\n  return json;\n}\n\nexport async function publishFeedPost(\n  instagramAccountId: string,\n  token: string,\n  caption: string,\n  imageUrl: string,\n  log: Logger\n): Promise<string> {\n  log.info({ instagramAccountId }, "instagram-publish: creating feed media container");\n\n  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {\n    method: "POST",\n    headers: { "Content-Type": "application/x-www-form-urlencoded" },\n    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }).toString(),\n  })) as { id: string };\n\n  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {\n    method: "POST",\n    headers: { "Content-Type": "application/x-www-form-urlencoded" },\n    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),\n  })) as { id: string };\n\n  log.info({ postId: published.id }, "instagram-publish: feed post published");\n  return published.id;\n}\n\nexport async function publishStoriesPost(\n  instagramAccountId: string,\n  token: string,\n  imageUrl: string,\n  log: Logger\n): Promise<string> {\n  log.info({ instagramAccountId }, "instagram-publish: creating stories media container");\n\n  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {\n    method: "POST",\n    headers: { "Content-Type": "application/x-www-form-urlencoded" },\n    body: new URLSearchParams({\n      image_url: imageUrl,\n      media_type: "STORIES",\n      access_token: token,\n    }).toString(),\n  })) as { id: string };\n\n  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {\n    method: "POST",\n    headers: { "Content-Type": "application/x-www-form-urlencoded" },\n    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),\n  })) as { id: string };\n\n  log.info({ postId: published.id }, "instagram-publish: stories post published");\n  return published.id;\n}\n''')

# Insights da própria conta também devem usar o host do Instagram Login direto.
replace_once(
    "artifacts/api-server/src/services/content-performance.ts",
    'const GRAPH_BASE = "https://graph.facebook.com/v21.0";',
    'const GRAPH_BASE = "https://graph.instagram.com/v26.0";',
    "insights graph host",
)

print("ok")
