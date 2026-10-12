import React, { lazy, Suspense, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { loadVerifiedContexts } from "@/lib/unifiedContextsApi";
import { ContextSwitcher } from "./ContextSwitcher";

import {
  getGetBusinessProfileByTenantQueryKey,
  getGetTenantQueryKey,
  useGetBusinessProfileByTenant,
  useGetTenant,
} from "@workspace/api-client-react";

const SidebarLayoutLegacy = lazy(() => import("./SidebarLayoutLegacy").then((m) => ({ default: m.SidebarLayout })));
const SuperAdminSidebarLayout = lazy(() => import("./SuperAdminSidebarLayout").then((m) => ({ default: m.SuperAdminSidebarLayout })));
const MarketingAgentDock = lazy(() => import("@/components/marketing/MarketingAgentDock").then((m) => ({ default: m.MarketingAgentDock })));
const AdsMediaPlanContextBanner = lazy(() => import("@/components/marketing/AdsMediaPlanContextBanner").then((m) => ({ default: m.AdsMediaPlanContextBanner })));
const MessagingMediaPlanBridge = lazy(() => import("@/components/marketing/MessagingMediaPlanBridge").then((m) => ({ default: m.MessagingMediaPlanBridge })));

// UI-01 is opt-in and remains off in all existing deployments unless explicitly enabled.
const UI01_CONTEXT_NAV_ENABLED = import.meta.env.VITE_UI01_CONTEXT_NAV === "true";

const MARKETING_ROUTE_HINTS = ["marketing", "campanh", "content", "conteudo", "media", "midia", "ads", "anuncio", "analytics", "site", "landing", "video", "planej"];

type TenantNavModule = {
  moduleKey: string;
  isEnabled: boolean;
  hasOverride?: boolean;
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

function normalizeVertical(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isArqdorEligibleVertical(vertical: string | null | undefined) {
  const normalized = normalizeVertical(vertical);
  if (!normalized) return false;

  return (
    normalized === "construcao & reforma" ||
    normalized === "arquitetura" ||
    normalized === "arquitetura & design" ||
    normalized === "obras" ||
    normalized.includes("construtora") ||
    normalized.includes("construcao") ||
    normalized.includes("gestao de obras") ||
    normalized.includes("marcenaria") ||
    normalized.includes("fabrica de moveis") ||
    normalized.includes("moveis planejados") ||
    normalized.includes("moveis sob medida") ||
    normalized.includes("industria de moveis") ||
    normalized.includes("designer de interiores") ||
    normalized.includes("design de interiores")
  );
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const { user, tenantOverride, token } = useAuth();
  const [location, setLocation] = useLocation();
  // user.tenantId já reflete o tenantOverride quando o logado é super_admin
  // (ver AuthContext) — ler tenantOverride de novo aqui, sem checar o role,
  // fazia contas não-super-admin herdarem um override sintético/antigo que
  // ficou preso no localStorage (ex: preview "Visualizar layout" em
  // AdminVerticais), pedindo nav-modules com um tenantId que não bate com
  // o token, e voltando 403 (tela em branco no app).
  const effectiveTenantId = user?.tenantId ?? "";

  const { data: tenantNavModules = [], isLoading: tenantNavModulesLoading } = useQuery<TenantNavModule[]>({
    queryKey: ["tenant-nav-modules", effectiveTenantId],
    enabled: !!effectiveTenantId && !!token,
    staleTime: 60_000,
    queryFn: async () => {
      // Lê o token direto do localStorage (mesma fonte usada por authHeaders()
      // e pelo cliente de API gerado) em vez do estado do React (`token`),
      // que pode ficar um passo atrás logo após login/troca de tenant e
      // mandar um Bearer de um tenantId diferente do que a URL está pedindo.
      const freshToken = localStorage.getItem("vendorai_token") ?? token;
      const response = await fetch(`/api/tenants/${effectiveTenantId}/nav-modules`, {
        headers: { Authorization: `Bearer ${freshToken}` },
      });
      if (!response.ok) return [];
      return response.json();
    },
  });

  const tenantQuery = useGetTenant(effectiveTenantId, {
    query: {
      queryKey: getGetTenantQueryKey(effectiveTenantId),
      enabled: !!effectiveTenantId && !!token,
      staleTime: 5 * 60_000,
    },
  });

  const businessProfileQuery = useGetBusinessProfileByTenant(effectiveTenantId, {
    query: {
      queryKey: getGetBusinessProfileByTenantQueryKey(effectiveTenantId),
      enabled: !!effectiveTenantId && !!token,
      staleTime: 5 * 60_000,
    },
  });

  const rawCompanyLogo =
    tenantQuery.data?.logoUrl?.trim() ||
    businessProfileQuery.data?.logoUrl?.trim() ||
    null;

  const companyLogoUrl = rawCompanyLogo
    ? rawCompanyLogo.startsWith("/objects/")
      ? `/api/storage${rawCompanyLogo}`
      : rawCompanyLogo
    : null;

  const companyName =
    businessProfileQuery.data?.nomeFantasia?.trim() ||
    businessProfileQuery.data?.razaoSocial?.trim() ||
    tenantQuery.data?.name?.trim() ||
    tenantOverride?.name ||
    (user as { tenantName?: string | null } | null)?.tenantName?.trim() ||
    "Sua empresa";

  const tenantSnapshot = tenantQuery.data as
    | { vertical?: string | null; segmento?: string | null }
    | undefined;
  const userSnapshot = user as
    | { tenantVertical?: string | null; tenantSegment?: string | null; tenantSegmento?: string | null }
    | null;

  const effectiveVertical =
    tenantOverride?.vertical ??
    tenantSnapshot?.vertical ??
    userSnapshot?.tenantVertical ??
    null;
  const effectiveSegment =
    tenantSnapshot?.segmento ??
    userSnapshot?.tenantSegment ??
    userSnapshot?.tenantSegmento ??
    null;

  const arqdorEligible =
    isArqdorEligibleVertical(effectiveVertical) ||
    isArqdorEligibleVertical(effectiveSegment);
  const arqdorModule = tenantNavModules.find((module) => module.moduleKey === "arch");
  const arqdorDisabledByOverride = arqdorModule?.hasOverride === true && arqdorModule.isEnabled === false;
  const arqdorVisible =
    !!effectiveTenantId &&
    !arqdorDisabledByOverride &&
    (arqdorEligible || user?.platformRole === "super_admin");

  // Regra de coerência: habilitar o módulo "arch" isoladamente não pode
  // transformar uma farmácia, supermercado ou loja de veículos em tenant
  // de arquitetura. A vertical precisa ser semanticamente elegível; o
  // entitlement só pode restringir, nunca furar a compatibilidade vertical.

  const erpEntitled = tenantNavModules.some(
    (module) => module.moduleKey === "financeiro" && module.isEnabled === true,
  );
  // Praça.ai fica oculto para todos os tenants nesta fase. O Super Admin
  // continua podendo acessar as rotas administrativas diretamente.
  const isPureSuperAdmin = user?.platformRole === "super_admin" && !tenantOverride;
  const pracaAiVisible = isPureSuperAdmin;

  // Arqdor é renderizado declarativamente pelo SidebarLayoutLegacy. Isso evita
  // injeção via MutationObserver e impede que o atalho apareça dentro de CRM
  // ou Administração dependendo do link-âncora disponível.

  // Dentro do Arqdor, a navegação vira um workspace curto. CRM, agenda,
  // conversas, catálogo global, ERP e marketing continuam sendo os mesmos
  // módulos do Vendor.ai; não são clonados no menu nem no domínio do Arqdor.
  useEffect(() => {
    const pathname = location.split("?")[0];
    const inArqdorContext = pathname === "/arch" || pathname.startsWith("/arch/");
    // Super admin fora de um tenant continua no shell administrativo.
    // Em modo "visualizando tenant" (tenantOverride), deve enxergar exatamente
    // o mesmo workspace Arqdor do tenant, incluindo Pré-Projeto e ferramentas.
    const isPureSuperAdmin = user?.platformRole === "super_admin" && !tenantOverride;
    if (isPureSuperAdmin) return;

    const restoreContext = () => {
      document
        .querySelectorAll<HTMLElement>('[data-arqdor-context-hidden="true"]')
        .forEach((element) => {
          element.style.display = element.dataset.arqdorPreviousDisplay ?? "";
          delete element.dataset.arqdorPreviousDisplay;
          delete element.dataset.arqdorContextHidden;
        });
      document
        .querySelectorAll<HTMLElement>('[data-arqdor-context-entry="true"], [data-arqdor-context-back="true"]')
        .forEach((element) => element.remove());
      document
        .querySelectorAll<HTMLAnchorElement>('a[data-arqdor-tool-entry="true"]')
        .forEach((root) => {
          const label = root.querySelector<HTMLElement>("span.flex-1");
          if (label) label.textContent = "Arqdor.ai";
          root.setAttribute("aria-label", "Arqdor.ai");
          root.title = "Arqdor.ai — Projetos, arquitetura, interiores e obra";
        });
    };

    if (!inArqdorContext || !arqdorVisible) {
      restoreContext();
      return;
    }

    const entries = [
      { href: "/arch/projetos", label: "Projetos", glyph: "P" },
      { href: "/arch/concept", label: "Pré-Projeto", glyph: "C" },
      { href: "/arch/render?new=1", label: "Render IA", glyph: "R" },
      { href: "/arch/catalogo", label: "Biblioteca do Projeto", glyph: "B" },
      { href: "/arch/marketplace", label: "Marketplace", glyph: "M" },
    ];

    const enforceArqdorContext = () => {
      // As inserções abaixo (insertAdjacentElement) são mutações de DOM
      // observadas pelo MutationObserver criado logo mais abaixo. Sem
      // desconectar antes de mexer no DOM, cada inserção podia disparar o
      // próprio observer de novo — e se o React re-renderizasse esse trecho
      // do menu (removendo os links injetados) entre um ciclo e outro, o
      // efeito reinseria e o observer reagia de novo, travando a aba
      // (era exatamente esse loop que prendia contas com Arqdor habilitado
      // num "Entrando..." infinito, mesmo com o login já concluído).
      observer.disconnect();
      const roots = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[data-arqdor-tool-entry="true"]'),
      );

      roots.forEach((root) => {
        const navContainer = root.parentElement;
        if (!navContainer) return;

        const rootLabel = root.querySelector<HTMLElement>("span.flex-1");
        if (rootLabel) rootLabel.textContent = "Visão Geral";
        root.setAttribute("aria-label", "Visão Geral do Arqdor.ai");
        root.title = "Visão Geral do Arqdor.ai";

        let insertAfter: Element = root;
        entries.forEach((entry) => {
          let link = navContainer.querySelector<HTMLAnchorElement>(
            `a[data-arqdor-context-entry="true"][href="${entry.href}"]`,
          );
          if (!link) {
            link = document.createElement("a");
            link.href = entry.href;
            link.dataset.arqdorContextEntry = "true";
            link.title = entry.label;
            link.setAttribute("aria-label", entry.label);

            const icon = document.createElement("span");
            icon.setAttribute("aria-hidden", "true");
            icon.className = "h-4 w-4 shrink-0 grid place-items-center text-[11px] font-bold";
            icon.textContent = entry.glyph;

            const label = document.createElement("span");
            label.className = "flex-1";
            label.textContent = entry.label;
            link.append(icon, label);
            link.addEventListener("click", (event) => {
              event.preventDefault();
              setLocation(entry.href);
            });
            insertAfter.insertAdjacentElement("afterend", link);
          }

          const entryPath = entry.href.split("?")[0];
          const active = pathname === entryPath || pathname.startsWith(`${entryPath}/`);
          link.className = [
            "group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
            active
              ? "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
              : "text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground",
          ].join(" ");
          insertAfter = link;
        });

        let back = navContainer.querySelector<HTMLAnchorElement>('a[data-arqdor-context-back="true"]');
        if (!back) {
          back = document.createElement("a");
          back.href = "/";
          back.dataset.arqdorContextBack = "true";
          back.className = "mt-2 flex min-h-[40px] items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground";
          back.innerHTML = '<span aria-hidden="true" class="h-4 w-4 shrink-0 grid place-items-center">←</span><span class="flex-1">Voltar ao Vendor.ai</span>';
          back.addEventListener("click", (event) => {
            event.preventDefault();
            setLocation("/");
          });
          insertAfter.insertAdjacentElement("afterend", back);
        }

        navContainer.querySelectorAll<HTMLElement>("a, button").forEach((element) => {
          if (
            element === root ||
            element.dataset.arqdorContextEntry === "true" ||
            element.dataset.arqdorContextBack === "true"
          ) {
            return;
          }
          if (element.dataset.arqdorContextHidden === "true") return;
          element.dataset.arqdorPreviousDisplay = element.style.display;
          element.dataset.arqdorContextHidden = "true";
          element.style.display = "none";
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    };

    const observer = new MutationObserver(enforceArqdorContext);
    enforceArqdorContext();

    return () => {
      observer.disconnect();
      restoreContext();
    };
  }, [arqdorVisible, location, setLocation, tenantOverride, user?.platformRole]);

  useEffect(() => {
    const isPureSuperAdmin = user?.platformRole === "super_admin" && !tenantOverride;
    if (isPureSuperAdmin || tenantNavModulesLoading || tenantQuery.isLoading) return;
    const pathname = location.split("?")[0];
    if ((pathname === "/arch" || pathname.startsWith("/arch/")) && !arqdorVisible) {
      setLocation("/");
    }
  }, [arqdorVisible, location, setLocation, tenantNavModulesLoading, tenantOverride, tenantQuery.isLoading, user?.platformRole]);

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

    const enforcePracaAiVisibility = () => {
      document.querySelectorAll<HTMLAnchorElement>(PRACA_AI_LINK_SELECTOR).forEach((link) => {
        const nextDisplay = pracaAiVisible ? "" : "none";
        if (link.style.display !== nextDisplay) link.style.display = nextDisplay;
        if (pracaAiVisible) {
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

    enforcePracaAiVisibility();
    const observer = new MutationObserver(enforcePracaAiVisibility);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pracaAiVisible]);

  useEffect(() => {
    if (isPureSuperAdmin || !effectiveTenantId || tenantNavModulesLoading) return;
    const pathname = location.split("?")[0];
    if (PRACA_AI_PATHS.has(pathname)) setLocation("/");
  }, [effectiveTenantId, isPureSuperAdmin, location, setLocation, tenantNavModulesLoading]);

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
      // Mesmo risco de loop dos outros enforce* deste arquivo: este
      // observer também escuta mudanças de atributo (src/style), que são
      // exatamente o que criar/mostrar a logo do tenant produz.
      observer.disconnect();
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

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "style"],
      });
    };

    const observer = new MutationObserver(enforceCompanyProfileLogo);
    enforceCompanyProfileLogo();

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

  const lowerLocation = location.toLowerCase();
  const pathname = location.split("?")[0] || "/";
  const marketingContext =
    MARKETING_ROUTE_HINTS.some((hint) => lowerLocation.includes(hint));
  const messagingContext =
    pathname === "/content" ||
    pathname === "/ads" ||
    pathname === "/content-autopilot";
  const adsContext = pathname === "/ads";

  const verifiedContextsQuery = useQuery({
    queryKey: ["ui01-contexts", user?.id, effectiveTenantId],
    enabled: UI01_CONTEXT_NAV_ENABLED && !!token && !!user?.id && !!effectiveTenantId && !isPureSuperAdmin,
    queryFn: ({ signal }) => loadVerifiedContexts(signal),
    staleTime: 60_000,
    retry: false,
  });
  const verifiedContextData = verifiedContextsQuery.data;
  const ui01CurrentContext = verifiedContextData?.contexts.find(
    (ctx) => ctx.id === verifiedContextData.currentContextId && ctx.tenantId === effectiveTenantId,
  );

  const shellContent = (
    <>
      <Suspense fallback={null}>
        {adsContext ? <AdsMediaPlanContextBanner pathname={location} /> : null}
        {messagingContext ? <MessagingMediaPlanBridge pathname={location} /> : null}
      </Suspense>
      {UI01_CONTEXT_NAV_ENABLED && ui01CurrentContext ? (
        <div className="mx-4 my-3 rounded-lg border p-3" data-ui01-context-preview="true">
          <ContextSwitcher
            contexts={[ui01CurrentContext]}
            currentContextId={ui01CurrentContext.id}
            tenantId={effectiveTenantId}
            disabled
            onRequestSwitch={() => { /* Switching requires a separate server-authorized flow. */ }}
          />
        </div>
      ) : null}
      {children}
      {marketingContext ? (
        <Suspense fallback={null}>
          <MarketingAgentDock pathname={location} />
        </Suspense>
      ) : null}
    </>
  );

  if (isPureSuperAdmin) {
    return (
      <Suspense fallback={null}>
        <SuperAdminSidebarLayout>{shellContent}</SuperAdminSidebarLayout>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <SidebarLayoutLegacy arqdorVisible={arqdorVisible}>{shellContent}</SidebarLayoutLegacy>
    </Suspense>
  );
}
