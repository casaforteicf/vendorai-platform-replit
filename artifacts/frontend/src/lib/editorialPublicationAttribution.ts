type EditorialContext = {
  editorialId?: string;
  selectedId?: string;
  title?: string;
  thesis?: string;
  brief?: string;
  series?: string;
  channel?: string;
  landingPage?: string;
  trackedDestination?: string;
  savedAt?: string;
};

let installed = false;

function lineValue(brief: string | undefined, label: string) {
  if (!brief) return null;
  const line = brief.split("\n").find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return line ? line.slice(line.indexOf(":") + 1).trim() : null;
}

function readContext(): EditorialContext | null {
  try {
    const parsed = JSON.parse(localStorage.getItem("vendorai_editorial_brief_v1") || "null") as EditorialContext | null;
    if (!parsed?.editorialId && !parsed?.selectedId && !parsed?.title && !parsed?.thesis) return null;
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

      const editorialId = context.editorialId || context.selectedId;
      const thesis = context.thesis || context.title || lineValue(context.brief, "Tema") || editorialId;
      const trackedDestination = context.trackedDestination || lineValue(context.brief, "Destino rastreável") || undefined;
      const landingPage = context.landingPage || (trackedDestination ? new URL(trackedDestination).pathname : undefined);
      if (!editorialId || !thesis) return response;

      await originalFetch(`/api/tenants/${tenantId}/marketing/editorial/publications/${publicationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editorialId,
          thesis,
          series: context.series || "Onde seu negócio está perdendo dinheiro?",
          channel: context.channel,
          landingPage,
          trackedDestination,
        }),
      });
      localStorage.removeItem("vendorai_editorial_brief_v1");
    } catch {
      // A publicação continua válida mesmo se a atribuição editorial falhar.
    }
    return response;
  };
}
