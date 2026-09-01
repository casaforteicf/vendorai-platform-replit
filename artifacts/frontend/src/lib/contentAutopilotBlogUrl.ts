const APPVENDORAI_HOST = ".appvendorai.com";

export function getContentAutopilotBlogPostUrl(
  siteUrl: string | null | undefined,
  postSlug: string,
): string | null {
  if (!siteUrl || !postSlug) return null;

  try {
    const url = new URL(siteUrl);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(APPVENDORAI_HOST)) return null;

    const siteSlug = hostname.slice(0, -APPVENDORAI_HOST.length);
    if (!siteSlug || siteSlug.includes(".")) return null;

    return `/api/sites/${encodeURIComponent(siteSlug)}/blog/${encodeURIComponent(postSlug)}`;
  } catch {
    return null;
  }
}
