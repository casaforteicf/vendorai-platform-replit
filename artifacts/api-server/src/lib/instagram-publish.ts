import type { Logger } from "pino";

// Instagram API with Instagram Login (Business Login).
// Esse fluxo usa Instagram User access token e o ID da conta profissional
// diretamente; não depende de uma Facebook Page vinculada.
const GRAPH = "https://graph.instagram.com/v26.0";

type InstagramGraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
};

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly graph?: InstagramGraphError,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }
}

async function gFetch(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const json = (await res.json()) as { error?: InstagramGraphError };
  if (!res.ok) {
    const graph = json.error;
    const message = graph?.error_user_msg || graph?.message || "A Meta recusou a operação.";
    throw new InstagramApiError(message, res.status, graph);
  }
  return json;
}

export async function publishFeedPost(
  instagramAccountId: string,
  token: string,
  caption: string,
  imageUrl: string,
  log: Logger
): Promise<string> {
  log.info({ instagramAccountId }, "instagram-publish: creating feed media container");

  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }).toString(),
  })) as { id: string };

  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id }, "instagram-publish: feed post published");
  return published.id;
}

export async function publishStoriesPost(
  instagramAccountId: string,
  token: string,
  imageUrl: string,
  log: Logger
): Promise<string> {
  log.info({ instagramAccountId }, "instagram-publish: creating stories media container");

  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      image_url: imageUrl,
      media_type: "STORIES",
      access_token: token,
    }).toString(),
  })) as { id: string };

  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id }, "instagram-publish: stories post published");
  return published.id;
}
