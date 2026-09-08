import { useEffect } from "react";

const MEDIA_HREF = "/midias";
const MEDIA_PLAN_HREF = "/marketing/plano-de-midia";

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

const MARKETING_ORDER = [
  "/marketing/plano-de-midia",
  "/content",
  "/marketing/instagram",
  "/content-studio/video",
  "/midias",
  "/content-autopilot",
  "/content?tab=campanhas",
  "/ads",
] as const;

function normalizeMarketingLink(link: HTMLAnchorElement) {
  const href = link.getAttribute("href") ?? "";
  const copy = MARKETING_MENU_COPY[href];
  if (!copy) return;

  link.setAttribute("aria-label", copy.title);
  link.setAttribute("title", copy.title);
  link.dataset.marketingRole = href;

  let label = link.querySelector<HTMLSpanElement>(":scope > span");
  if (!label) {
    label = document.createElement("span");
    link.appendChild(label);
  }
  label.textContent = copy.label;
}

export function MediaMenuInjector() {
  useEffect(() => {
    const ensureMarketingOrder = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        let mediaLink = container.querySelector<HTMLAnchorElement>(`a[href="${MEDIA_HREF}"]`);
        const isActive = window.location.pathname === MEDIA_HREF;

        if (!mediaLink) {
          mediaLink = document.createElement("a");
          mediaLink.href = MEDIA_HREF;
          mediaLink.dataset.mediaCenterMenuEntry = "true";

          const icon = contentLink.querySelector("svg")?.cloneNode(true);
          if (icon) mediaLink.appendChild(icon);
          const label = document.createElement("span");
          mediaLink.appendChild(label);

          // Navegação completa evita chunks obsoletos em sessões longas durante deploy.
          mediaLink.addEventListener("click", (event) => {
            event.preventDefault();
            window.location.assign(MEDIA_HREF);
          });
        }

        mediaLink.className = [
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ");

        // Um nome = uma responsabilidade. Mantém as rotas existentes, mas deixa
        // explícito para o usuário o papel de cada área do ciclo de Marketing.
        MARKETING_ORDER.forEach((href) => {
          const link = href === MEDIA_HREF
            ? mediaLink
            : container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
          if (!link) return;
          normalizeMarketingLink(link);
          container.appendChild(link);
        });
      });
    };

    ensureMarketingOrder();
    const observer = new MutationObserver(ensureMarketingOrder);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLAnchorElement>('[data-media-center-menu-entry="true"]').forEach((link) => link.remove());
    };
  }, []);

  return null;
}
