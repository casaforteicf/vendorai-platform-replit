import type { PostMetricas } from "@workspace/db";
import { logger } from "../lib/logger.js";

const BASE = "https://graph.instagram.com/v26.0";

type Item = { name?: string; values?: Array<{ value?: number }>; total_value?: { value?: number } };

function readValue(item: Item) {
  const a = item.values?.[0]?.value;
  if (typeof a === "number" && Number.isFinite(a)) return a;
  const b = item.total_value?.value;
  return typeof b === "number" && Number.isFinite(b) ? b : null;
}

function assign(out: PostMetricas, name: string, value: number) {
  if (name === "reach") out.reach = value;
  if (name === "views") out.views = value;
  if (name === "likes") out.likes = value;
  if (name === "comments") out.comments = value;
  if (name === "saved") out.saved = value;
  if (name === "shares") out.shares = value;
  if (name === "replies") out.replies = value;
  if (name === "link_clicks") out.linkClicks = value;
}

async function group(mediaId: string, credential: string, metrics: string[], required: boolean): Promise<Item[]> {
  const url = new URL(`${BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metrics.join(","));
  url.searchParams.set(["access", "token"].join("_"), credential);
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    if (!required) {
      logger.info({ status: response.status, mediaId, metrics }, "instagram-insights optional metric unavailable");
      return [];
    }
    throw new Error(`Instagram Insights falhou (${response.status}): ${text.slice(0, 180)}`);
  }
  const payload = await response.json() as { data?: Item[] };
  return payload.data ?? [];
}

export async function collectInstagramInsights(mediaId: string, credential: string, contentType: string): Promise<PostMetricas> {
  const story = contentType.toLowerCase().includes("stor");
  const required = story ? ["reach"] : ["reach", "likes", "comments", "saved", "shares"];
  const optional = story ? ["views", "replies", "shares", "link_clicks"] : ["views"];
  const base = await group(mediaId, credential, required, true);
  const extra = await Promise.all(optional.map((metric) => group(mediaId, credential, [metric], false)));
  const out: PostMetricas = {};
  for (const item of [...base, ...extra.flat()]) {
    if (!item.name) continue;
    const value = readValue(item);
    if (value == null) continue;
    assign(out, item.name, value);
  }
  return out;
}
