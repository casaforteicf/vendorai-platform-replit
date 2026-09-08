import { useEffect } from "react";

const MEDIA_HREF = "/midias";

/**
 * Mantém somente a entrada de Mídias no submenu de Marketing.
 *
 * O restante do submenu é declarativo no SidebarLayoutLegacy. Evitamos
 * reescrever labels, inserir cards de status ou mover links controlados pelo
 * React, porque isso polui o mobile e pode causar conflitos de interação.
 */
export function MediaMenuInjector() {
  useEffect(() => {
    const ensureMediaLink = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/content"]').forEach((contentLink) => {
        const container = contentLink.parentElement;
        if (!container) return;

        let mediaLink = container.querySelector<HTMLAnchorElement>(`:scope > a[href="${MEDIA_HREF}"]`);
        const isActive = window.location.pathname === MEDIA_HREF;

        if (!mediaLink) {
          mediaLink = document.createElement("a");
          mediaLink.href = MEDIA_HREF;
          mediaLink.dataset.mediaCenterMenuEntry = "true";
          mediaLink.setAttribute("aria-label", "Mídias — biblioteca de fotos, vídeos e áudios");
          mediaLink.setAttribute("title", "Mídias — biblioteca de fotos, vídeos e áudios");

          const icon = contentLink.querySelector("svg")?.cloneNode(true);
          if (icon) mediaLink.appendChild(icon);

          const label = document.createElement("span");
          label.textContent = "Mídias";
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
      });
    };

    ensureMediaLink();
    const observer = new MutationObserver(ensureMediaLink);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLAnchorElement>('[data-media-center-menu-entry="true"]').forEach((link) => link.remove());
    };
  }, []);

  return null;
}
