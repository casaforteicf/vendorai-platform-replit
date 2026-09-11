import { useEffect, useState } from "react";
import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import IntegrationSettingsHub from "./IntegrationSettingsHub";
import { ConfigurationHistoryPanel } from "@/components/ConfigurationHistoryPanel";
import { ConfigurationAccessPanel } from "@/components/ConfigurationAccessPanel";
import { ConfigurationRollbackPanel } from "@/components/ConfigurationRollbackPanel";
import { ConfigurationGovernancePanel } from "@/components/ConfigurationGovernancePanel";
import { ConfigurationImpactSimulator } from "@/components/ConfigurationImpactSimulator";
import { ConfigurationPostChangeValidation } from "@/components/ConfigurationPostChangeValidation";
import { ConfigurationSectionGuard } from "@/components/ConfigurationSectionGuard";
import { ConfigurationCatalogProductsBridge } from "@/components/ConfigurationCatalogProductsBridge";
import { JarvisPermissionsCenter } from "@/components/support/JarvisPermissionsCenter";
import {
  loadJarvisPermissions,
  RECOMMENDED_JARVIS_PERMISSIONS,
  saveJarvisPermissions,
} from "@/lib/jarvisPermissions";

const DIRECT_OAUTH_ENDPOINTS: Record<string, string> = {
  whatsapp: "/api/auth/whatsapp",
  instagram: "/api/auth/instagram",
  "google-calendar": "/api/onboarding/integracoes/google-url",
  "google-ads": "/api/auth/google-ads?returnTo=/onboarding/integracoes",
  "search-console": "/api/auth/search-console",
  linkedin: "/api/auth/linkedin",
  tiktok: "/api/auth/tiktok",
};

function integrationFallback(key: string) {
  if (key === "domain") return "/content-autopilot?view=settings";
  return `/configuracoes?tab=integracoes&integration=${encodeURIComponent(key)}`;
}

export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";
  const integrationsDeepLink = params.get("tab") === "integracoes";
  const isInstallationMode = params.get("installation") === "1";

  const [showJarvis, setShowJarvis] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [showInstallationSettings, setShowInstallationSettings] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    const startDirectConnection = async (key: string, card: HTMLElement) => {
      const endpoint = DIRECT_OAUTH_ENDPOINTS[key];
      if (!endpoint) {
        window.location.assign(integrationFallback(key));
        return;
      }

      const actionLabel = card.querySelector<HTMLElement>(".integration-health__action");
      const originalLabel = actionLabel?.textContent ?? "";
      const button = card instanceof HTMLButtonElement ? card : null;
      card.setAttribute("aria-busy", "true");
      if (button) button.disabled = true;
      if (actionLabel) actionLabel.textContent = "Abrindo integração…";

      try {
        const token = localStorage.getItem("vendorai_token");
        const response = await fetch(endpoint, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = await response.json().catch(() => ({})) as { url?: string };
        if (!response.ok || !data.url) throw new Error("integration_start_failed");
        window.location.assign(data.url);
      } catch {
        window.location.assign(integrationFallback(key));
      } finally {
        card.removeAttribute("aria-busy");
        if (button) button.disabled = false;
        if (actionLabel && originalLabel) actionLabel.textContent = originalLabel;
      }
    };

    const openIntegration = (event: MouseEvent) => {
      const origin = event.target instanceof Element ? event.target : null;

      const tab = origin?.closest<HTMLElement>("[role='tab']");
      if (tab) {
        const label = `${tab.getAttribute("aria-label") ?? ""} ${tab.textContent ?? ""}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();
        if (label.includes("integracoes")) {
          event.preventDefault();
          event.stopPropagation();
          window.location.assign("/configuracoes?tab=integracoes");
          return;
        }
      }

      const card = origin?.closest<HTMLElement>("[data-integration-key]");
      const key = card?.dataset.integrationKey;
      if (!key || !card) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "domain") {
        window.location.assign("/content-autopilot?view=settings");
        return;
      }

      if (card.classList.contains("is-off")) {
        void startDirectConnection(key, card);
        return;
      }

      const url = new URL(window.location.href);
      url.searchParams.set("tab", "integracoes");
      url.searchParams.set("integration", key);
      window.location.assign(`${url.pathname}${url.search}${url.hash}`);
    };

    document.addEventListener("click", openIntegration, true);
    return () => document.removeEventListener("click", openIntegration, true);
  }, []);

  const applyAutomaticDefaults = () => {
    const current = loadJarvisPermissions();
    saveJarvisPermissions({
      ...RECOMMENDED_JARVIS_PERMISSIONS,
      microphone: current.microphone,
      notifications: current.notifications,
      alwaysConfirmSensitiveActions: true,
    });
    setDefaultsApplied(true);
  };

  const hideSelections = () => {
    setShowJarvis(false);
    setShowGovernance(false);
    setShowInstallationSettings(false);
  };

  const showEverything = () => {
    setShowJarvis(true);
    setShowGovernance(true);
    setShowInstallationSettings(true);
  };

  if (integrationsDeepLink) {
    return <IntegrationSettingsHub />;
  }

  if (legacySiteDeepLink) {
    return <ConfiguracoesNormalized />;
  }

  if (isInstallationMode) {
    return (
      <div className="vendor-settings-compact">
        <section className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold">Instalação simplificada</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Mostramos primeiro as pendências da instalação. As configurações completas ficam recolhidas para evitar uma página longa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallationSettings((current) => !current)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold"
              >
                {showInstallationSettings ? "Ocultar configurações" : "Abrir configurações completas"}
              </button>
            </div>
          </div>
        </section>

        <ConfigurationSectionGuard />

        <details
          open={showInstallationSettings}
          onToggle={(event) => setShowInstallationSettings(event.currentTarget.open)}
          className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold shadow-sm [&::-webkit-details-marker]:hidden">
            <span>Configurações completas</span>
            <span className="text-xs font-medium text-muted-foreground">
              {showInstallationSettings ? "Ocultar" : "Abrir"}
            </span>
          </summary>
          <div className="mt-3">
            <ConfiguracoesNormalized />
            <ConfigurationCatalogProductsBridge />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="vendor-settings-compact">
      <section className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold">Configuração simplificada</h1>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">Modo essencial</span>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Dados já cadastrados da empresa continuam sendo carregados automaticamente. Permissões, governança, histórico e opções técnicas ficam recolhidos até você precisar deles.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={applyAutomaticDefaults}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                {defaultsApplied ? "Padrão recomendado aplicado" : "Pré-preencher recomendado"}
              </button>
              <button
                type="button"
                onClick={hideSelections}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold"
              >
                Ocultar seleções
              </button>
              <button
                type="button"
                onClick={showEverything}
                className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold"
              >
                Mostrar tudo
              </button>
            </div>
          </div>
        </div>
      </section>

      <details
        open={showJarvis}
        onToggle={(event) => setShowJarvis(event.currentTarget.open)}
        className="mx-auto mb-3 w-full max-w-7xl px-4 sm:px-6"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-sm font-semibold">JARVIS — permissões e autonomia</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Seleções ocultas por padrão. Abra somente quando quiser revisar voz, contexto e autonomia.</div>
          </div>
          <span className="ml-3 shrink-0 text-xs font-semibold text-primary">{showJarvis ? "Ocultar seleções" : "Configurar"}</span>
        </summary>
        <div className="mt-3">
          <JarvisPermissionsCenter />
        </div>
      </details>

      <details
        open={showGovernance}
        onToggle={(event) => setShowGovernance(event.currentTarget.open)}
        className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-4 py-3 shadow-sm [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Segurança e governança</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Acessos, políticas, impacto, validação, histórico e restauração em uma única área avançada.</div>
          </div>
          <span className="ml-3 shrink-0 text-xs font-semibold text-primary">{showGovernance ? "Ocultar" : "Ver opções"}</span>
        </summary>
        <div className="mt-3 space-y-3">
          <ConfigurationSectionGuard />
          <ConfigurationAccessPanel />
          <ConfigurationGovernancePanel />
          <ConfigurationImpactSimulator />
          <ConfigurationPostChangeValidation />
          <ConfigurationHistoryPanel />
          <ConfigurationRollbackPanel />
        </div>
      </details>

      <ConfiguracoesNormalized />
      <ConfigurationCatalogProductsBridge />
    </div>
  );
}
