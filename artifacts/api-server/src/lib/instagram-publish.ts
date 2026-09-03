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

async function waitForVideoContainer(containerId: string, token: string, log: Logger): Promise<void> {
  for (let attempt = 1; attempt <= 20; attempt++) {
    const url = new URL(`${GRAPH}/${encodeURIComponent(containerId)}`);
    url.searchParams.set("fields", "status_code,status");
    url.searchParams.set("access_token", token);
    const status = (await gFetch(url.toString())) as { status_code?: string; status?: string };

    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR" || status.status_code === "EXPIRED") {
      throw new InstagramApiError(status.status || "O Instagram não conseguiu processar o vídeo do Reel.", 422);
    }

    log.info({ containerId, attempt, statusCode: status.status_code }, "instagram-publish: waiting for reel processing");
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }

  throw new InstagramApiError("O Instagram demorou demais para processar o vídeo do Reel. Tente novamente.", 504);
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

export async function publishFeedCarousel(
  instagramAccountId: string,
  token: string,
  caption: string,
  imageUrls: string[],
  log: Logger,
): Promise<string> {
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new InstagramApiError("O carrossel do Instagram precisa ter entre 2 e 10 imagens.", 422);
  }

  log.info({ instagramAccountId, imageCount: imageUrls.length }, "instagram-publish: creating carousel items");

  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const child = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        image_url: imageUrl,
        is_carousel_item: "true",
        access_token: token,
      }).toString(),
    })) as { id: string };
    childIds.push(child.id);
  }

  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption,
      access_token: token,
    }).toString(),
  })) as { id: string };

  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id, imageCount: imageUrls.length }, "instagram-publish: carousel published");
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

export async function publishReelPost(
  instagramAccountId: string,
  token: string,
  caption: string,
  videoUrl: string,
  log: Logger,
): Promise<string> {
  log.info({ instagramAccountId }, "instagram-publish: creating reel media container");

  const container = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: "true",
      access_token: token,
    }).toString(),
  })) as { id: string };

  await waitForVideoContainer(container.id, token, log);

  const published = (await gFetch(`${GRAPH}/${encodeURIComponent(instagramAccountId)}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString(),
  })) as { id: string };

  log.info({ postId: published.id }, "instagram-publish: reel published");
  return published.id;
}