type EditorialContext = {
  editorialId?: string;
  title?: string;
  thesis?: string;
  series?: string;
  channel?: string;
  landingPage?: string;
  trackedDestination?: string;
  savedAt?: string;
};

let installed = false;

function readContext(): EditorialContext | null {
  try {
    const parsed = JSON.parse(localStorage.getItem("vendorai_editorial_brief_v1") || "null") as EditorialContext | null;
    if (!parsed?.editorialId && !parsed?.title && !parsed?.thesis) return null;
    if (parsed.savedAt) {
      const age = Date.now() - new Date(parsed.savedAt).getTime();
      if (!Number.isFinite(age) || age > 12 * 60 * 60 * 1000) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function extractTenantId(url: string) {
  return url.match(/\/api\/tenants\/([^/]+)\/social-publications\//)?.[1] ?? null;
}

export function installEditorialPublicationAttribution() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const tenantId = extractTenantId(url);
      if (!tenantId || method !== "POST" || !response.ok || /\/retry(?:\?|$)/.test(url)) return response;

      const context = readContext();
      if (!context) return response;
      const cloned = response.clone();
      const payload = await cloned.json().catch(() => null) as { publication?: { id?: string } } | null;
      const publicationId = payload?.publication?.id;
      if (!publicationId) return response;

      const thesis = context.thesis || context.title || context.editorialId;
      if (!context.editorialId || !thesis) return response;
      await originalFetch(`/api/tenants/${tenantId}/marketing/editorial/publications/${publicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editorialId: context.editorialId,
          thesis,
          series: context.series || "Onde seu negócio está perdendo dinheiro?",
          channel: context.channel,
          landingPage: context.landingPage,
          trackedDestination: context.trackedDestination,
        }),
      });
      localStorage.removeItem("vendorai_editorial_brief_v1");
    } catch {
      // A publicação continua válida mesmo se a atribuição editorial falhar.
    }
    return response;
  };
}
