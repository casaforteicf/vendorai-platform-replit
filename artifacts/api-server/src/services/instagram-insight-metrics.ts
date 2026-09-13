import type { PostMetricas } from "@workspace/db";

export type InstagramInsightItem = {
  name?: string;
  values?: Array<{ value?: number }>;
  total_value?: { value?: number };
};

export function insightValue(item: InstagramInsightItem): number | null {
  const direct = item.values?.[0]?.value;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const total = item.total_value?.value;
  return typeof total === "number" && Number.isFinite(total) ? total : null;
}

export function assignInstagramMetric(target: PostMetricas, name: string, value: number) {
  if (name === "reach") target.reach = value;
  if (name === "views") target.views = value;
  if (name === "likes") target.likes = value;
  if (name === "comments") target.comments = value;
  if (name === "saved") target.saved = value;
  if (name === "shares") target.shares = value;
  if (name === "replies") target.replies = value;
  if (name === "link_clicks") target.linkClicks = value;
}
