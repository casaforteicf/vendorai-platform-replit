import React, { useEffect } from "react";
import { SidebarLayout as SidebarLayoutLegacy } from "./SidebarLayoutLegacy";

/**
 * Navigation migration shim.
 *
 * The existing sidebar is intentionally preserved intact in SidebarLayoutLegacy
 * while Marketing → Content Autopilot becomes the unified Sites workspace.
 * This avoids duplicating role/module visibility rules during the migration.
 */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const relabelSitesEntry = () => {
      const links = document.querySelectorAll<HTMLAnchorElement>('a[href="/content-autopilot"]');
      links.forEach((link) => {
        const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.nodeValue?.trim() === "Content Autopilot") {
            node.nodeValue = node.nodeValue.replace("Content Autopilot", "Sites");
          }
          node = walker.nextNode();
        }
        link.setAttribute("aria-label", "Sites — Gerador de Sites e Content Autopilot");
        link.setAttribute("title", "Sites — Gerador de Sites e Content Autopilot");
      });
    };

    relabelSitesEntry();
    const observer = new MutationObserver(relabelSitesEntry);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <SidebarLayoutLegacy>{children}</SidebarLayoutLegacy>;
}
