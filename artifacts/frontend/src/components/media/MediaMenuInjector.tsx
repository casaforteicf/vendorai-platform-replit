import { useEffect } from "react";

const MEDIA_HREF = "/midias";
const MEDIA_PLAN_HREF = "/marketing/plano-de-midia";

export function MediaMenuInjector() {
  useEffect(() => {
    const ensureMarketingOrder = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        // O Planejador é a entrada oficial do Marketing: primeiro vem a direção,
        // depois o Gerador e as ferramentas executoras.
        const mediaPlanLink = container.querySelector<HTMLAnchorElement>(`a[href="${MEDIA_PLAN_HREF}"]`);
        if (mediaPlanLink && container.firstElementChild !== mediaPlanLink) {
          container.insertBefore(mediaPlanLink, contentLink);
        }

        let mediaLink = container.querySelector<HTMLAnchorElement>(`a[href="${MEDIA_HREF}"]`);
        const isActive = window.location.pathname === MEDIA_HREF;

        if (!mediaLink) {
          mediaLink = document.createElement("a");
          mediaLink.href = MEDIA_HREF;
          mediaLink.dataset.mediaCenterMenuEntry = "true";
          mediaLink.setAttribute("aria-label", "Mídias — Biblioteca e Studio de Mídia");
          mediaLink.setAttribute("title", "Mídias — Biblioteca e Studio de Mídia");

          const icon = contentLink.querySelector("svg")?.cloneNode(true);
          if (icon) mediaLink.appendChild(icon);
          const label = document.createElement("span");
          label.textContent = "Mídias";
          mediaLink.appendChild(label);

          // Navegação completa evita chunks obsoletos em sessões longas durante deploy.
          mediaLink.addEventListener("click", (event) => {
            event.preventDefault();
            window.location.assign(MEDIA_HREF);
          });

          // Mantém Mídias junto das ferramentas executoras de Marketing.
          const videoLink = container.querySelector<HTMLAnchorElement>('a[href="/content-studio/video"]');
          if (videoLink) videoLink.insertAdjacentElement("afterend", mediaLink);
          else contentLink.insertAdjacentElement("afterend", mediaLink);
        }

        mediaLink.className = [
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        ].join(" ");
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