import React, { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout as SidebarLayoutLegacy } from "./SidebarLayoutLegacy";
import { MarketingAgentDock } from "@/components/marketing/MarketingAgentDock";
import { AdsMediaPlanContextBanner } from "@/components/marketing/AdsMediaPlanContextBanner";
import { MessagingMediaPlanBridge } from "@/components/marketing/MessagingMediaPlanBridge";
import { getGetBusinessProfileByTenantQueryKey, useGetBusinessProfileByTenant } from "@workspace/api-client-react";

type TenantNavModule = {
  moduleKey: string;
  isEnabled: boolean;
};

const PRACA_AI_PATHS = new Set([
  "/stories",
  "/variedades-dia",
  "/praca-perguntas",
  "/praca-variedades",
  "/entregas-praca",
  "/praca-executivo",
  "/praca-conciliacao",
  "/logistica-praca",
]);

const PRACA_AI_LINK_SELECTOR = Array.from(PRACA_AI_PATHS)
  .map((href) => `a[href="${href}"]`)
  .join(",");

/**
 * Navigation policy wrapper.
 *
 * SidebarLayoutLegacy remains the declarative source of the navigation tree.
 * This wrapper only enforces tenant entitlements and tenant-only branding.
 * Marketing labels and entries must be declared in the sidebar itself instead
 * of being cloned or renamed after render.
 *
 * Branding policy:
 * - regular tenant sessions show only the tenant/client logo;
 * - the only tenant logo source is Perfil da Empresa → Logo da empresa;
 * - Super Admin keeps the VendorAI brand in its own environment;
 * - when Super Admin opens a tenant/vertical preview, the preview follows the
 *   tenant-only branding rule;
 * - a missing/broken company-profile logo falls back to the company name,
 *   never VendorAI.
 */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, tenantOverride, token } = useAuth();
  const [location, setLocation] = useLocation();
  const effectiveTenantId = tenantOverride?.id ?? user?.tenantId ?? "";

  const { data: tenantNavModules = [], isLoading: tenantNavModulesLoading } = useQuery<TenantNavModule[]>({
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

  const businessProfileQuery = useGetBusinessProfileByTenant(effectiveTenantId, {
    query: {
      queryKey: getGetBusinessProfileByTenantQueryKey(effectiveTenantId),
      enabled: !!effectiveTenantId && !!token,
      staleTime: 5 * 60_000,
    },
  });

  const rawCompanyLogo = businessProfileQuery.data?.logoUrl?.trim() || null;
  const companyLogoUrl = rawCompanyLogo
    ? rawCompanyLogo.startsWith("/objects/")
      ? `/api/storage${rawCompanyLogo}`
      : rawCompanyLogo
    : null;

  const companyName =
    businessProfileQuery.data?.nomeFantasia?.trim() ||
    businessProfileQuery.data?.razaoSocial?.trim() ||
    tenantOverride?.name ||
    (user as { tenantName?: string | null } | null)?.tenantName?.trim() ||
    "Sua empresa";

  const erpEntitled = tenantNavModules.some(
    (module) => module.moduleKey === "financeiro" && module.isEnabled === true,
  );
  const pracaAiEntitled = tenantNavModules.some(
    (module) => module.moduleKey === "praca_ai" && module.isEnabled === true,
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
    const enforceBudgetSidebarPolicy = () => {
      document.querySelectorAll<HTMLAnchorElement>('a[href="/propostas"]').forEach((link) => {
        if (link.textContent?.trim() !== "Orçamentos") return;
        link.style.display = "none";
        link.setAttribute("aria-hidden", "true");
        link.setAttribute("tabindex", "-1");
        link.dataset.budgetSidebarHidden = "true";
      });
    };

    enforceBudgetSidebarPolicy();
    const observer = new MutationObserver(enforceBudgetSidebarPolicy);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelectorAll<HTMLAnchorElement>('a[data-budget-sidebar-hidden="true"]').forEach((link) => {
        link.style.display = "";
        link.removeAttribute("aria-hidden");
        link.removeAttribute("tabindex");
        delete link.dataset.budgetSidebarHidden;
      });
    };
  }, []);

  useEffect(() => {
    if (!PRACA_AI_LINK_SELECTOR) return;

    const enforcePracaAiEntitlement = () => {
      document.querySelectorAll<HTMLAnchorElement>(PRACA_AI_LINK_SELECTOR).forEach((link) => {
        const nextDisplay = pracaAiEntitled ? "" : "none";
        if (link.style.display !== nextDisplay) link.style.display = nextDisplay;
        if (pracaAiEntitled) {
          link.removeAttribute("aria-hidden");
          if (link.dataset.pracaAiLocked === "true") {
            link.removeAttribute("tabindex");
            delete link.dataset.pracaAiLocked;
          }
        } else {
          link.setAttribute("aria-hidden", "true");
          link.setAttribute("tabindex", "-1");
          link.dataset.pracaAiLocked = "true";
        }
      });
    };

    enforcePracaAiEntitlement();
    const observer = new MutationObserver(enforcePracaAiEntitlement);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pracaAiEntitled]);

  useEffect(() => {
    if (!effectiveTenantId || tenantNavModulesLoading || pracaAiEntitled) return;
    const pathname = location.split("?")[0];
    if (PRACA_AI_PATHS.has(pathname)) setLocation("/");
  }, [effectiveTenantId, location, pracaAiEntitled, setLocation, tenantNavModulesLoading]);

  useEffect(() => {
    if (!user) return;

    const isPureSuperAdmin = user.platformRole === "super_admin" && !tenantOverride;
    if (isPureSuperAdmin) return;

    const setVisible = (element: HTMLElement, visible: boolean) => {
      const display = visible ? "" : "none";
      if (element.style.display !== display) element.style.display = display;
    };

    const isBrandingClientLogo = (image: HTMLImageElement) => {
      if (image.alt !== "Logo") return false;
      if (image.dataset.profileCompanyLogo === "true") return true;
      const classes = image.className;
      return typeof classes === "string" && (classes.includes("max-w-[100px]") || classes.includes("max-w-[160px]"));
    };

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
      if (fallback.textContent !== companyName) fallback.textContent = companyName;
      return fallback;
    };

    const rememberLegacySource = (image: HTMLImageElement) => {
      if (image.dataset.legacyTenantBrandSrc !== undefined) return;
      image.dataset.legacyTenantBrandSrc = image.getAttribute("src") || "";
    };

    const restoreLegacySource = (image: HTMLImageElement) => {
      const previous = image.dataset.legacyTenantBrandSrc;
      if (previous === undefined) return;
      if (previous) image.setAttribute("src", previous);
      else image.removeAttribute("src");
      delete image.dataset.legacyTenantBrandSrc;
      delete image.dataset.profileLogoFailed;
      delete image.dataset.profileCompanyLogo;
      image.style.display = "";
    };

    const setCompanyLogo = (image: HTMLImageElement) => {
      if (!companyLogoUrl) {
        setVisible(image, false);
        return false;
      }

      rememberLegacySource(image);

      if (image.dataset.profileLogoFailed === companyLogoUrl) {
        setVisible(image, false);
        return false;
      }

      if (image.getAttribute("src") !== companyLogoUrl) {
        delete image.dataset.profileLogoFailed;
        image.setAttribute("src", companyLogoUrl);
      }

      image.dataset.profileCompanyLogo = "true";
      image.alt = "Logo";
      image.style.maxWidth = "160px";
      setVisible(image, true);
      image.onerror = () => {
        image.dataset.profileLogoFailed = companyLogoUrl;
        setVisible(image, false);
        const fallback = ensureFallback(image);
        if (fallback) setVisible(fallback, true);
      };
      return true;
    };

    const createCompanyLogo = (vendorLogo: HTMLImageElement) => {
      const parent = vendorLogo.parentElement;
      if (!parent || !companyLogoUrl) return null;

      const existing = Array.from(parent.querySelectorAll<HTMLImageElement>('img[alt="Logo"]')).find(isBrandingClientLogo);
      if (existing) return existing;

      const image = document.createElement("img");
      image.alt = "Logo";
      image.dataset.profileCompanyLogo = "true";
      image.dataset.profileCompanyLogoCreated = "true";

      const vendorClasses = vendorLogo.className || "";
      const heightClass = vendorClasses.includes("h-10")
        ? "h-10"
        : vendorClasses.includes("h-8")
          ? "h-8"
          : "h-7";
      image.className = `${heightClass} w-auto max-w-[160px] object-contain`;
      vendorLogo.insertAdjacentElement("afterend", image);
      return image;
    };

    const enforceCompanyProfileLogo = () => {
      document.querySelectorAll<HTMLImageElement>('img[alt="Vendor.ai"]').forEach((vendorLogo) => {
        const parent = vendorLogo.parentElement;
        if (!parent) return;

        setVisible(vendorLogo, false);
        parent.querySelectorAll<HTMLElement>("span").forEach((span) => {
          if (span.textContent?.trim() === "×") setVisible(span, false);
        });

        let clientLogo = Array.from(parent.querySelectorAll<HTMLImageElement>('img[alt="Logo"]')).find(isBrandingClientLogo);
        if (!clientLogo && companyLogoUrl) clientLogo = createCompanyLogo(vendorLogo) ?? undefined;

        if (clientLogo && setCompanyLogo(clientLogo)) {
          const fallback = parent.querySelector<HTMLElement>("[data-tenant-brand-fallback]");
          if (fallback) setVisible(fallback, false);
        } else {
          if (clientLogo) setVisible(clientLogo, false);
          const fallback = ensureFallback(vendorLogo);
          if (fallback) setVisible(fallback, true);
        }
      });

      document.querySelectorAll<HTMLImageElement>('img[alt="Logo"]').forEach((clientLogo) => {
        if (!isBrandingClientLogo(clientLogo)) return;

        const parent = clientLogo.parentElement;
        if (!parent) return;

        if (setCompanyLogo(clientLogo)) {
          const fallback = parent.querySelector<HTMLElement>("[data-tenant-brand-fallback]");
          if (fallback) setVisible(fallback, false);
        } else {
          const fallback = ensureFallback(clientLogo);
          if (fallback) setVisible(fallback, true);
        }
      });
    };

    enforceCompanyProfileLogo();
    const observer = new MutationObserver(enforceCompanyProfileLogo);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style"],
    });

    return () => {
      observer.disconnect();

      document.querySelectorAll<HTMLImageElement>('[data-profile-company-logo-created="true"]').forEach((image) => image.remove());
      document.querySelectorAll<HTMLImageElement>('img[data-legacy-tenant-brand-src]').forEach(restoreLegacySource);
      document.querySelectorAll<HTMLElement>("[data-tenant-brand-fallback]").forEach((fallback) => fallback.remove());
      document.querySelectorAll<HTMLImageElement>('img[alt="Vendor.ai"]').forEach((vendorLogo) => setVisible(vendorLogo, true));
      document.querySelectorAll<HTMLElement>("span").forEach((span) => {
        if (span.textContent?.trim() === "×") setVisible(span, true);
      });
    };
  }, [companyLogoUrl, companyName, tenantOverride, user]);

  return (
    <SidebarLayoutLegacy>
      <AdsMediaPlanContextBanner pathname={location} />
      <MessagingMediaPlanBridge pathname={location} />
      {children}
      <MarketingAgentDock pathname={location} />
    </SidebarLayoutLegacy>
  );
}
