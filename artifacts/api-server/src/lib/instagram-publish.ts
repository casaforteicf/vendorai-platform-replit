import type { Logger } from "pino";

const GRAPH = "https://graph.facebook.com/v19.0";

async function gFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: unknown };
  if (!res.ok) throw new Error(JSON.stringify(json.error ?? json));
  return json;
}

async function getIgUserId(pageId: string, token: string): Promise<string> {
  const data = (await gFetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=instagram_business_account&access_token=${encodeURIComponent(token)}`
  )) as { instagram_business_account?: { id: string } };

  const igId = data.instagram_business_account?.id;
  if (!igId) {
    throw new Error(
      "Página do Facebook não tem uma Conta Business do Instagram conectada. Vá nas configurações do Facebook e conecte a conta do Instagram à sua Página."
    );
  }
  return igId;
}

export async function publishFeedPost(
  pageId: string,
  token: string,
  caption: string,
  imageUrl: string,
  log: Logger
): Promise<string> {
  const igUserId = await getIgUserId(pageId, token);
  log.info({ igUserId }, "instagram-publish: creating feed media container");

  const container = (await gFetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }).toString(),
  })) as { id: string };

  const published = (await gFetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id }, "instagram-publish: feed post published");
  return published.id;
}

export async function publishStoriesPost(
  pageId: string,
  token: string,
  imageUrl: string,
  log: Logger
): Promise<string> {
  const igUserId = await getIgUserId(pageId, token);
  log.info({ igUserId }, "instagram-publish: creating stories media container");

  const container = (await gFetch(`${GRAPH}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: token,
    }).toString(),
  })) as { id: string };

  const published = (await gFetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id }, "instagram-publish: stories post published");
  return published.id;
}
