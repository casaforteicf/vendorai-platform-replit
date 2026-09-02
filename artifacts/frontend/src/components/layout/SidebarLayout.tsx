import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout as SidebarLayoutLegacy } from "./SidebarLayoutLegacy";

type TenantNavModule = {
  moduleKey: string;
  isEnabled: boolean;
};

/**
 * Navigation migration shim.
 *
 * The existing sidebar is intentionally preserved intact in SidebarLayoutLegacy
 * while Marketing → Content Autopilot becomes the unified Sites workspace.
 * This avoids duplicating role/module visibility rules during the migration.
 *
 * Branding policy:
 * - regular tenant sessions show only the tenant/client logo;
 * - Super Admin keeps the VendorAI brand in its own environment;
 * - when Super Admin opens a tenant/vertical preview, the preview follows the
 *   tenant-only branding rule;
 * - a missing/broken tenant logo falls back to the company name, never VendorAI.
 */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, tenantOverride, token } = useAuth();
  const effectiveTenantId = tenantOverride?.id ?? user?.tenantId ?? "";

  // Gestão ERP é add-on pago e deve falhar FECHADO: sem confirmação positiva
  // do entitlement, o menu não aparece. Isso evita que uma indisponibilidade
  // temporária de /nav-modules (ex.: 502) exponha o ERP novamente.
  const { data: tenantNavModules = [] } = useQuery<TenantNavModule[]>({
    queryKey: ["tenant-nav-modules", effectiveTenantId],
    enabled: !!effectiveTenantId && !!token,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${effectiveTenantId}/nav-modules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const erpEntitled = tenantNavModules.some(
    (module) => module.moduleKey === "financeiro" && module.isEnabled === true,
  );

  useEffect(() => {
    const enforceErpEntitlement = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/erp"]').forEach((link) => {
        const nextDisplay = erpEntitled ? "" : "none";
        if (link.style.display !== nextDisplay) link.style.display = nextDisplay;
        if (erpEntitled) {
          link.removeAttribute("aria-hidden");
          if (link.dataset.erpLocked === "true") {
            link.removeAttribute("tabindex");
            delete link.dataset.erpLocked;
          }
        } else {
          link.setAttribute("aria-hidden", "true");
          link.setAttribute("tabindex", "-1");
          link.dataset.erpLocked = "true";
        }
      });
    };

    enforceErpEntitlement();
    const observer = new MutationObserver(enforceErpEntitlement);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [erpEntitled]);

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

  useEffect(() => {
    if (!user) return;

    const isPureSuperAdmin = user.platformRole === "super_admin" && !tenantOverride;
    if (isPureSuperAdmin) return;

    const tenantName =
      tenantOverride?.name ||
      (user as typeof user & { tenantName?: string | null }).tenantName?.trim() ||
      "Sua empresa";

    const ensureFallback = (anchor: HTMLElement) => {
      const parent = anchor.parentElement;
      if (!parent) return null;

      let fallback = parent.querySelector<HTMLElement>("[data-tenant-brand-fallback]");
      if (!fallback) {
        fallback = document.createElement("span");
        fallback.dataset.tenantBrandFallback = "true";
        fallback.className = "max-w-[160px] truncate text-sm font-semibold text-foreground";
        anchor.insertAdjacentElement("afterend", fallback);
      }
      if (fallback.textContent !== tenantName) fallback.textContent = tenantName;
      return fallback;
    };

    const setVisible = (element: HTMLElement, visible: boolean) => {
      const display = visible ? "" : "none";
      if (element.style.display !== display) element.style.display = display;
    };

    const isBrandingClientLogo = (image: HTMLImageElement) => {
      if (image.alt !== "Logo") return false;
      const classes = image.className;
      return typeof classes === "string" && (classes.includes("max-w-[100px]") || classes.includes("max-w-[160px]"));
    };

    const isVendorFallbackSource = (image: HTMLImageElement) => {
      const src = image.getAttribute("src") || "";
      return src.includes("logo-full-light.svg") || src.includes("logo-full-dark.svg");
    };

    const enforceTenantLogoOnly = () => {
      // Legacy co-branding renders "VendorAI × cliente". In tenant mode, remove
      // VendorAI and the separator while preserving the client's own logo.
      document.querySelectorAll<HTMLImageElement>('img[alt="Vendor.ai"]').forEach((vendorLogo) => {
        const parent = vendorLogo.parentElement;
        if (!parent) return;

        const clientLogo = Array.from(parent.querySelectorAll<HTMLImageElement>('img[alt="Logo"]')).find(isBrandingClientLogo);
        setVisible(vendorLogo, false);

        parent.querySelectorAll("span").forEach((span) => {
          if (span.textContent?.trim() === "×") setVisible(span, false);
        });

        if (clientLogo && clientLogo.style.display !== "none" && !isVendorFallbackSource(clientLogo)) {
          if (clientLogo.style.maxWidth !== "160px") clientLogo.style.maxWidth = "160px";
          const fallback = parent.querySelector<HTMLElement>("[data-tenant-brand-fallback]");
          if (fallback) setVisible(fallback, false);
          return;
        }

        const fallback = ensureFallback(vendorLogo);
        if (fallback) setVisible(fallback, true);
      });

      // Full white-label legacy mode has only the client image. If that image
      // fails, the legacy handler used to swap it back to VendorAI. Intercept
      // that state and show the tenant name instead.
      document.querySelectorAll<HTMLImageElement>('img[alt="Logo"]').forEach((clientLogo) => {
        if (!isBrandingClientLogo(clientLogo)) return;

        const parent = clientLogo.parentElement;
        if (!parent) return;

        const currentSrc = clientLogo.getAttribute("src") || "";
        const previousSrc = clientLogo.dataset.tenantBrandSrc;
        if (previousSrc && previousSrc !== currentSrc && !isVendorFallbackSource(clientLogo)) {
          setVisible(clientLogo, true);
        }
        clientLogo.dataset.tenantBrandSrc = currentSrc;

        const logoUnavailable = clientLogo.style.display === "none" || isVendorFallbackSource(clientLogo);
        if (logoUnavailable) {
          setVisible(clientLogo, false);
          const fallback = ensureFallback(clientLogo);
          if (fallback) setVisible(fallback, true);
        } else {
          if (clientLogo.style.maxWidth !== "160px") clientLogo.style.maxWidth = "160px";
          const fallback = parent.querySelector<HTMLElement>("[data-tenant-brand-fallback]");
          if (fallback) setVisible(fallback, false);
        }
      });
    };

    enforceTenantLogoOnly();
    const observer = new MutationObserver(enforceTenantLogoOnly);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style"],
    });
    return () => observer.disconnect();
  }, [tenantOverride?.id, tenantOverride?.name, user]);

  return <SidebarLayoutLegacy>{children}</SidebarLayoutLegacy>;
}
