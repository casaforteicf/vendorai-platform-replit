import { useEffect } from "react";

const MEDIA_HREF = "/midias";
const MEDIA_PLAN_HREF = "/marketing/plano-de-midia";
const GUIDE_ATTR = "data-marketing-flow-guide";

const MARKETING_MENU_COPY: Record<string, { label: string; title: string }> = {
  "/marketing/plano-de-midia": {
    label: "Planejamento de Marketing",
    title: "Planejamento de Marketing — estratégia, período, orçamento, canais, público e KPIs",
  },
  "/content": {
    label: "Produção de Conteúdo",
    title: "Produção de Conteúdo — transforma o planejamento aprovado em peças e briefings",
  },
  "/marketing/instagram": {
    label: "Operação do Instagram",
    title: "Operação do Instagram — grade, fila, publicação e desempenho do canal",
  },
  "/content-studio/video": {
    label: "Produção de Vídeo",
    title: "Produção de Vídeo — cria, edita, legenda e padroniza vídeos",
  },
  "/midias": {
    label: "Biblioteca de Mídias",
    title: "Biblioteca de Mídias — fotos, vídeos, áudios e arquivos reutilizáveis do negócio",
  },
  "/content-autopilot": {
    label: "Sites & LPs",
    title: "Sites & LPs — criar, publicar e otimizar sites e landing pages",
  },
  "/content?tab=campanhas": {
    label: "Gestão de Campanhas",
    title: "Gestão de Campanhas — organiza campanha, período, peças, canais e status em um único lugar",
  },
  "/ads": {
    label: "Mídia Paga",
    title: "Mídia Paga — executar, publicar, ativar e medir Google Ads e Meta Ads",
  },
};

const AUTONOMY_LABELS: Record<number, string> = {
  0: "Sugestão",
  1: "Assistido",
  2: "Publicação autorizada",
  3: "Otimização automática",
  4: "Automático",
};

type MarketingGuideState = {
  mode: string;
  reviewCount: number;
  nextLabel: string;
  nextHref: string;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function sessionInfo() {
  const override = readJson<{ id?: string }>("vendorai_sa_tenant_override");
  const user = readJson<{ tenantId?: string | null }>("vendorai_user_cache");
  return {
    tenantId: override?.id ?? user?.tenantId ?? "",
    token: localStorage.getItem("vendorai_token") ?? "",
  };
}

function normalizeMarketingLink(link: HTMLAnchorElement) {
  const href = link.getAttribute("href") ?? "";
  const copy = MARKETING_MENU_COPY[href];
  if (!copy) return;

  if (link.getAttribute("aria-label") !== copy.title) link.setAttribute("aria-label", copy.title);
  if (link.getAttribute("title") !== copy.title) link.setAttribute("title", copy.title);
  if (link.dataset.marketingRole !== href) link.dataset.marketingRole = href;

  let label = link.querySelector<HTMLSpanElement>(":scope > span");
  if (!label) {
    label = document.createElement("span");
    link.appendChild(label);
  }
  if (label.textContent !== copy.label) label.textContent = copy.label;
}

function ensureGuide(container: HTMLElement) {
  let guide = container.querySelector<HTMLElement>(`:scope > [${GUIDE_ATTR}]`);
  if (!guide) {
    guide = document.createElement("div");
    guide.setAttribute(GUIDE_ATTR, "true");
    guide.className = "mx-1 mb-2 rounded-xl border border-primary/15 bg-primary/[0.035] p-2.5";
    guide.innerHTML = `
      <div class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Fluxo do Marketing</div>
      <div class="mt-1 text-[11px] font-medium text-foreground">Planejar → Produzir → Aprovar → Publicar → Medir</div>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <span data-guide-mode class="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium">Modo: carregando…</span>
        <span data-guide-review class="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium">Em revisão: —</span>
      </div>
      <a data-guide-next href="${MEDIA_PLAN_HREF}" class="mt-2 flex min-h-[34px] items-center justify-between rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground">
        <span>Próxima ação</span><span aria-hidden="true">→</span>
      </a>
    `;
    container.insertBefore(guide, container.firstElementChild);
  }
  return guide;
}

function applyGuideState(guide: HTMLElement, state: MarketingGuideState) {
  const mode = guide.querySelector<HTMLElement>("[data-guide-mode]");
  const review = guide.querySelector<HTMLElement>("[data-guide-review]");
  const next = guide.querySelector<HTMLAnchorElement>("[data-guide-next]");
  const modeText = `Modo: ${state.mode}`;
  const reviewText = `Em revisão: ${state.reviewCount}`;
  if (mode && mode.textContent !== modeText) mode.textContent = modeText;
  if (review && review.textContent !== reviewText) review.textContent = reviewText;
  if (next) {
    if (next.getAttribute("href") !== state.nextHref) next.setAttribute("href", state.nextHref);
    const label = next.querySelector("span");
    if (label && label.textContent !== state.nextLabel) label.textContent = state.nextLabel;
  }
}

async function loadGuideState(): Promise<MarketingGuideState | null> {
  const { tenantId, token } = sessionInfo();
  if (!tenantId || !token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    const [planResponse, calendarResponse, autonomyResponse] = await Promise.all([
      fetch(`/api/tenants/${tenantId}/media-plan`, { headers, cache: "no-store" }),
      fetch(`/api/tenants/${tenantId}/content-calendar`, { headers, cache: "no-store" }),
      fetch(`/api/tenants/${tenantId}/marketing/autonomy`, { headers, cache: "no-store" }),
    ]);
    const plan = planResponse.ok ? await planResponse.json() as { conteudo?: { statusPlanejamento?: string } } | null : null;
    const calendar = calendarResponse.ok ? await calendarResponse.json() as Array<{ status?: string; contentGenerationId?: string | null }> : [];
    const autonomy = autonomyResponse.ok ? await autonomyResponse.json() as { level?: number } : null;
    const reviewCount = calendar.filter((item) => item.status === "gerado" && !!item.contentGenerationId).length;
    const level = Number(autonomy?.level ?? 0);
    const mode = AUTONOMY_LABELS[level] ?? `Nível ${level}`;

    if (!plan || plan.conteudo?.statusPlanejamento !== "aprovado") {
      return { mode, reviewCount, nextLabel: "Planejar e aprovar", nextHref: MEDIA_PLAN_HREF };
    }
    if (reviewCount > 0) {
      return { mode, reviewCount, nextLabel: `Revisar ${reviewCount} conteúdo${reviewCount === 1 ? "" : "s"}`, nextHref: "/content" };
    }
    return { mode, reviewCount, nextLabel: "Acompanhar execução", nextHref: "/content" };
  } catch {
    return null;
  }
}

export function MediaMenuInjector() {
  useEffect(() => {
    let lastGuideLoad = 0;
    const refreshGuides = async () => {
      const state = await loadGuideState();
      if (!state) return;
      document.querySelectorAll<HTMLElement>(`[${GUIDE_ATTR}]`).forEach((guide) => applyGuideState(guide, state));
    };

    const ensureMarketingUi = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        // Só atua quando o submenu realmente está aberto. Não move elementos
        // gerenciados pelo React; isso evita o loop de MutationObserver que
        // impedia o toque em Marketing no menu mobile.
        Object.keys(MARKETING_MENU_COPY).forEach((href) => {
          const link = container.querySelector<HTMLAnchorElement>(`:scope > a[href="${href}"]`);
          if (link) normalizeMarketingLink(link);
        });

        let mediaLink = container.querySelector<HTMLAnchorElement>(`:scope > a[href="${MEDIA_HREF}"]`);
        const isActive = window.location.pathname === MEDIA_HREF;
        if (!mediaLink) {
          mediaLink = document.createElement("a");
          mediaLink.href = MEDIA_HREF;
          mediaLink.dataset.mediaCenterMenuEntry = "true";
          const icon = contentLink.querySelector("svg")?.cloneNode(true);
          if (icon) mediaLink.appendChild(icon);
          const label = document.createElement("span");
          label.textContent = MARKETING_MENU_COPY[MEDIA_HREF].label;
          mediaLink.appendChild(label);
          mediaLink.addEventListener("click", (event) => {
            event.preventDefault();
            window.location.assign(MEDIA_HREF);
          });
          const videoLink = container.querySelector<HTMLAnchorElement>(':scope > a[href="/content-studio/video"]');
          if (videoLink) videoLink.insertAdjacentElement("afterend", mediaLink);
          else contentLink.insertAdjacentElement("afterend", mediaLink);
        }

        mediaLink.className = [
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ");
        normalizeMarketingLink(mediaLink);
        ensureGuide(container);
      });

      const now = Date.now();
      if (now - lastGuideLoad > 15000) {
        lastGuideLoad = now;
        void refreshGuides();
      }
    };

    ensureMarketingUi();
    const observer = new MutationObserver(ensureMarketingUi);
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(() => void refreshGuides(), 60000);
    const autonomyListener = () => void refreshGuides();
    window.addEventListener("vendorai:marketing-autonomy-changed", autonomyListener);

    return () => {
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("vendorai:marketing-autonomy-changed", autonomyListener);
      document.querySelectorAll<HTMLAnchorElement>('[data-media-center-menu-entry="true"]').forEach((link) => link.remove());
      document.querySelectorAll<HTMLElement>(`[${GUIDE_ATTR}]`).forEach((guide) => guide.remove());
    };
  }, []);

  return null;
}
