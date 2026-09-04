import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, ImageOff, Search } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const HOST_ATTR = "data-vendorai-ads-creative-preview";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type AdCreative = {
  id: string;
  headlines: string[];
  descriptions: string[];
  imagens: string[];
  status: "rascunho" | "aprovado";
};

type AdCampaign = {
  id: string;
  plataforma: string;
  tipoAnuncio: string;
  itemLabel?: string | null;
  status: string;
  latestCreative?: AdCreative | null;
};

function currentTenantId() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CachedOverride;
      if (parsed?.id) return parsed.id;
    }
  } catch {}
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return "";
    return (JSON.parse(raw) as CachedUser)?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function installCopyClarifier(enabled: boolean) {
  if (!enabled) return () => undefined;
  const replacements = new Map([
    ["Aprovar criativo", "Aprovar anúncio"],
    ["Gerar criativo", "Gerar anúncio"],
    ["Criativo aprovado", "Anúncio aprovado"],
  ]);
  const rewrite = () => {
    const elements = document.querySelectorAll<HTMLElement>("button, [role='status'], [data-radix-toast-title]");
    for (const element of elements) {
      const text = (element.textContent ?? "").trim();
      const next = replacements.get(text);
      if (!next) continue;
      for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes(text)) node.textContent = node.textContent.replace(text, next);
      }
      if (element.childNodes.length === 1 && element.textContent?.trim() === text) element.textContent = next;
    }
  };
  rewrite();
  const observer = new MutationObserver(rewrite);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}

export function AdsCreativePreviewBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [search, setSearch] = useState(() => window.location.search);
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const campaignId = useMemo(() => new URLSearchParams(search).get("campaignId") ?? "", [search]);
  const isAds = pathname === "/ads";
  const isSearchAd = campaign?.plataforma === "google" && campaign?.tipoAnuncio === "rsa_pmax";

  useEffect(() => {
    const update = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
    };
    window.addEventListener("popstate", update);
    const timer = window.setInterval(update, 400);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => installCopyClarifier(isAds), [isAds]);

  useEffect(() => {
    if (!isAds || !campaignId) {
      setCampaign(null);
      return;
    }
    const tenantId = currentTenantId();
    if (!tenantId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/ads/campaigns`, { headers: authHeaders(), cache: "no-store" });
        if (!response.ok) return;
        const rows = await response.json() as AdCampaign[];
        if (!cancelled) setCampaign(rows.find((row) => row.id === campaignId) ?? null);
      } catch {}
    };
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [campaignId, isAds]);

  useEffect(() => {
    if (!isAds || !campaignId) {
      setHost(null);
      return;
    }
    let portalHost = document.querySelector<HTMLElement>(`[${HOST_ATTR}]`);
    if (!portalHost) {
      portalHost = document.createElement("div");
      portalHost.setAttribute(HOST_ATTR, "true");
    }
    const attach = () => {
      const heading = Array.from(document.querySelectorAll<HTMLHeadingElement>("h1")).find((node) => (node.textContent ?? "").trim() === "Anúncios");
      const page = heading?.closest<HTMLElement>(".max-w-5xl");
      if (!page || !portalHost) return;
      const header = heading?.parentElement?.parentElement ?? heading?.parentElement;
      if (header && portalHost.parentElement !== page) header.after(portalHost);
      setHost((current) => current === portalHost ? current : portalHost);
    };
    attach();
    const timer = window.setInterval(attach, 450);
    return () => {
      window.clearInterval(timer);
      portalHost?.remove();
    };
  }, [campaignId, isAds]);

  if (!host || !campaign) return null;
  const creative = campaign.latestCreative ?? null;
  const headline = creative?.headlines?.filter(Boolean).slice(0, 3).join(" | ") ?? "";
  const descriptions = creative?.descriptions?.filter(Boolean).slice(0, 2) ?? [];
  const image = creative?.imagens?.find(Boolean) ?? "";

  return createPortal(
    <div className="mb-4 rounded-xl border bg-background p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold">Prévia do anúncio</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isSearchAd
              ? "Google Search é um anúncio textual: o criativo é formado por títulos e descrições. Não existe imagem obrigatória neste formato."
              : "Revise a peça completa abaixo antes de aprovar e publicar."}
          </p>
        </div>
        {creative?.status === "aprovado" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> Anúncio aprovado
          </span>
        )}
      </div>

      {!creative ? (
        <div className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          O anúncio ainda não possui uma peça gerada. Gere o anúncio antes de aprovar.
        </div>
      ) : isSearchAd ? (
        <div className="mt-3 rounded-lg border bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Search className="h-3.5 w-3.5" />
            <span className="font-medium">Patrocinado · Google Search</span>
          </div>
          <p className="mt-2 text-lg font-medium leading-snug text-blue-700">
            {headline || "Título do anúncio ainda não disponível"}
          </p>
          {descriptions.length > 0 ? (
            <div className="mt-1 space-y-0.5 text-sm leading-relaxed text-slate-700">
              {descriptions.map((description, index) => <p key={index}>{description}</p>)}
            </div>
          ) : (
            <p className="mt-1 text-sm text-amber-700">Descrição ausente — gere uma nova versão antes de publicar.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border px-2 py-1">{creative.headlines.length} título(s)</span>
            <span className="rounded-full border px-2 py-1">{creative.descriptions.length} descrição(ões)</span>
            <span className="rounded-full border px-2 py-1">Sem imagem por definição do Search</span>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
          {image ? (
            <img src={image} alt="Prévia do anúncio" className="max-h-72 w-full rounded-lg border object-cover" />
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
              <span><ImageOff className="mx-auto mb-2 h-5 w-5" />Imagem ausente. Um anúncio de imagem não deve ser aprovado sem a peça visual.</span>
            </div>
          )}
          <div>
            <p className="font-medium">{creative.headlines[0] || campaign.itemLabel || "Anúncio"}</p>
            {descriptions.map((description, index) => <p key={index} className="mt-1 text-sm text-muted-foreground">{description}</p>)}
          </div>
        </div>
      )}
    </div>,
    host,
  );
}
