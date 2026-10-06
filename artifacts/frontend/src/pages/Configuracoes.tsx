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

function SettingsUxCleanup() {
  useEffect(() => {
    const simplify = () => {
      const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
      if (!root) return;

      const searchLabel = root.querySelector<HTMLElement>(".config-search__label");
      if (searchLabel && searchLabel.textContent !== "Buscar nas configurações") {
        searchLabel.textContent = "Buscar nas configurações";
      }
      const searchInput = root.querySelector<HTMLInputElement>(".config-search__input");
      if (searchInput) searchInput.setAttribute("aria-label", "Buscar nas configurações");

      root.querySelectorAll<HTMLElement>("h2, h3, h4").forEach((heading) => {
        const text = heading.textContent?.replace(/\s+/g, " ").trim() ?? "";

        if (text === "Contexto para a IA") {
          heading.textContent = "Conhecimento sobre o negócio";
          const description = heading.parentElement?.querySelector<HTMLElement>("p");
          if (description) {
            description.textContent = "Informações que ajudam os agentes a entender sua empresa e atender seus clientes corretamente.";
          }
        }

        if (text === "Rede de Parceiros") {
          heading.textContent = "Parcerias comerciais";
          const card = heading.closest<HTMLElement>("section, article, .rounded-xl, .rounded-lg, .rounded-md, .border");
          const description = card?.querySelector<HTMLElement>("p");
          if (description?.textContent?.includes("outros tenants")) {
            description.textContent = "Permite receber cotações e oportunidades comerciais encaminhadas diretamente por empresas parceiras da rede VendorAI.";
          }
        }
      });

      root.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        if (!input.value.startsWith("/objects/uploads/")) return;
        const row = input.closest<HTMLElement>(".flex") ?? input.parentElement;
        if (row) row.dataset.settingsTechnicalPath = "true";
      });

      root.querySelectorAll<HTMLElement>("[data-legacy-products-readonly='true']").forEach((block) => {
        if (block.dataset.settingsCatalogCollapsed === "true") return;
        block.dataset.settingsCatalogCollapsed = "true";

        const sourceText = block.textContent?.replace(/\s+/g, " ") ?? "";
        const counts = sourceText.match(/(\d+)\s+cadastrados.*?(\d+)\s+ativos/i);
        const countLabel = counts ? `${counts[1]} cadastrados · ${counts[2]} ativos` : "Fonte oficial: Catálogo";

        const summary = document.createElement("div");
        summary.dataset.settingsCatalogSummary = "true";
        summary.className = "settings-catalog-summary";
        summary.innerHTML = `
          <div class="settings-catalog-summary__copy">
            <strong>Catálogo</strong>
            <span>${countLabel}. Produtos, serviços, preços, estoque e imagens são administrados no módulo Catálogo.</span>
          </div>
          <a href="/catalogo">Abrir Catálogo</a>
        `;
        block.insertAdjacentElement("beforebegin", summary);
        block.hidden = true;
        block.setAttribute("aria-hidden", "true");
      });
    };

    simplify();
    const observer = new MutationObserver(simplify);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <style>{`
      .vendor-settings-compact,
      .vendor-settings-compact button,
      .vendor-settings-compact input,
      .vendor-settings-compact textarea,
      .vendor-settings-compact select {
        font-family: inherit;
      }

      .vendor-settings-compact .config-governance { display: none !important; }
      .vendor-settings-compact [data-settings-technical-path="true"] { display: none !important; }

      .vendor-settings-compact .vendor-config-without-site { font-size: .8125rem; }
      .vendor-settings-compact .vendor-config-without-site h1 {
        font-size: 1rem !important;
        line-height: 1.35 !important;
        font-weight: 650 !important;
      }
      .vendor-settings-compact .vendor-config-without-site h2,
      .vendor-settings-compact .vendor-config-without-site h3,
      .vendor-settings-compact .vendor-config-without-site h4 {
        font-size: .875rem !important;
        line-height: 1.35 !important;
        font-weight: 650 !important;
      }
      .vendor-settings-compact .vendor-config-without-site .text-sm {
        font-size: .75rem !important;
        line-height: 1.42 !important;
      }
      .vendor-settings-compact .vendor-config-without-site .text-xs {
        font-size: .7rem !important;
        line-height: 1.4 !important;
      }
      .vendor-settings-compact .vendor-config-without-site [role="tab"] {
        font-size: .75rem !important;
        font-weight: 500 !important;
      }
      .vendor-settings-compact .vendor-config-without-site .rounded-xl.border.bg-card.p-6 {
        padding: 1rem !important;
      }
      .vendor-settings-compact .vendor-config-without-site .space-y-6 > :not([hidden]) ~ :not([hidden]) {
        margin-top: 1rem !important;
      }

      .settings-quick-panel {
        border-radius: .85rem;
        padding: .8rem .9rem;
      }
      .settings-quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: .45rem;
      }
      .settings-quick-actions button {
        min-height: 2rem;
        padding: .4rem .7rem;
        border-radius: .55rem;
        font-size: .7rem;
        line-height: 1;
        font-weight: 650;
      }
      .settings-toggle-summary {
        min-height: 3.25rem;
        transition: background-color 140ms ease, border-color 140ms ease;
      }
      .settings-toggle-summary:hover {
        background: hsl(var(--muted) / .28);
      }
      .settings-toggle-title {
        font-size: .8rem;
        line-height: 1.25;
        font-weight: 650;
      }
      .settings-toggle-description {
        margin-top: .18rem;
        font-size: .69rem;
        line-height: 1.35;
        color: hsl(var(--muted-foreground));
      }
      .settings-toggle-action {
        flex: 0 0 auto;
        margin-left: .8rem;
        font-size: .69rem;
        line-height: 1;
        font-weight: 650;
        color: hsl(var(--primary));
      }

      .settings-advanced-content .text-xl { font-size: .95rem !important; line-height: 1.35 !important; }
      .settings-advanced-content .text-lg { font-size: .9rem !important; line-height: 1.35 !important; }
      .settings-advanced-content .text-base { font-size: .82rem !important; line-height: 1.4 !important; }
      .settings-advanced-content .text-sm { font-size: .75rem !important; line-height: 1.42 !important; }
      .settings-advanced-content .text-xs { font-size: .7rem !important; line-height: 1.4 !important; }
      .settings-advanced-content h1,
      .settings-advanced-content h2,
      .settings-advanced-content h3,
      .settings-advanced-content h4 {
        font-family: inherit !important;
      }

      .settings-catalog-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin: .75rem 0;
        padding: .9rem 1rem;
        border: 1px solid hsl(var(--border));
        border-radius: .75rem;
        background: hsl(var(--muted) / .28);
      }
      .settings-catalog-summary__copy { display: grid; gap: .2rem; min-width: 0; }
      .settings-catalog-summary__copy strong { font-size: .82rem; }
      .settings-catalog-summary__copy span { font-size: .72rem; line-height: 1.4; color: hsl(var(--muted-foreground)); }
      .settings-catalog-summary a {
        flex: 0 0 auto;
        border: 1px solid hsl(var(--border));
        border-radius: .55rem;
        padding: .45rem .65rem;
        background: hsl(var(--background));
        font-size: .7rem;
        font-weight: 650;
      }

      @media (max-width: 640px) {
        .settings-catalog-summary { align-items: stretch; flex-direction: column; }
        .settings-catalog-summary a { width: 100%; text-align: center; }
        .settings-quick-actions { width: 100%; }
        .settings-quick-actions button { flex: 1 1 auto; }
      }
    `}</style>
  );
}

export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab");
  const legacySiteDeepLink = requestedTab === "site";
  const integrationsDeepLink = requestedTab === "integracoes";
  const normalizedSectionDeepLink = requestedTab !== null && [
    "perfil",
    "marketing",
    "analise",
    "calendario",
    "ai",
    "contrato",
    "equipe",
    "faturamento",
  ].includes(requestedTab);
  const isInstallationMode = params.get("installation") === "1";

  const [showJarvis, setShowJarvis] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [showInstallationSettings, setShowInstallationSettings] = useState(false);
  const [showFullSettings, setShowFullSettings] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
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
      if (!key) return;

      event.preventDefault();
      event.stopPropagation();
      window.location.assign(`/configuracoes?tab=integracoes&integration=${encodeURIComponent(key)}`);
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

  const advancedOpen = showJarvis && showGovernance;
  const toggleAdvanced = () => {
    const next = !advancedOpen;
    setShowJarvis(next);
    setShowGovernance(next);
  };

  if (integrationsDeepLink) {
    return <IntegrationSettingsHub />;
  }

  if (legacySiteDeepLink || normalizedSectionDeepLink) {
    return <ConfiguracoesNormalized />;
  }

  if (isInstallationMode) {
    return (
      <div className="vendor-settings-compact vendor-page-canvas vendor-config-page">
        <SettingsUxCleanup />
        <section className="mx-auto mb-3 w-full max-w-7xl px-4 sm:px-6">
          <div className="settings-quick-panel border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[13px] font-semibold">Instalação simplificada</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Mostramos primeiro as pendências da instalação. As configurações completas ficam recolhidas para evitar uma página longa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallationSettings((current) => !current)}
                className="min-h-8 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-semibold"
              >
                {showInstallationSettings ? "Ocultar configurações" : "Abrir configurações"}
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
          <summary className="settings-toggle-summary flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm [&::-webkit-details-marker]:hidden">
            <span className="settings-toggle-title">Configurações completas</span>
            <span className="settings-toggle-action">{showInstallationSettings ? "Ocultar" : "Abrir"}</span>
          </summary>
          <div className="settings-advanced-content mt-2.5">
            <ConfiguracoesNormalized />
            <ConfigurationCatalogProductsBridge />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="vendor-settings-compact vendor-page-canvas vendor-config-page">
      <SettingsUxCleanup />
      <section className="mx-auto mb-3 w-full max-w-7xl px-4 sm:px-6">
        <div className="settings-quick-panel border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[13px] font-semibold">Ajustes rápidos</div>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Modo essencial</span>
              </div>
              <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
                Aplique o padrão recomendado ou abra as opções avançadas quando precisar revisar permissões, segurança e histórico.
              </p>
            </div>

            <div className="settings-quick-actions">
              <button
                type="button"
                onClick={applyAutomaticDefaults}
                className="bg-primary text-primary-foreground"
              >
                {defaultsApplied ? "Padrão aplicado" : "Aplicar padrão recomendado"}
              </button>
              <button
                type="button"
                onClick={toggleAdvanced}
                className="border border-border bg-background text-foreground"
              >
                {advancedOpen ? "Ocultar avançado" : "Ver avançado"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <details
        open={showJarvis}
        onToggle={(event) => setShowJarvis(event.currentTarget.open)}
        className="mx-auto mb-2.5 w-full max-w-7xl px-4 sm:px-6"
      >
        <summary className="settings-toggle-summary flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="settings-toggle-title">IA — permissões e autonomia</div>
            <div className="settings-toggle-description">Voz, contexto, permissões e autonomia dos agentes.</div>
          </div>
          <span className="settings-toggle-action">{showJarvis ? "Ocultar" : "Abrir"}</span>
        </summary>
        {showJarvis && (
          <div className="settings-advanced-content mt-2.5">
            <JarvisPermissionsCenter />
          </div>
        )}
      </details>

      <details
        open={showGovernance}
        onToggle={(event) => setShowGovernance(event.currentTarget.open)}
        className="mx-auto mb-3 w-full max-w-7xl px-4 sm:px-6"
      >
        <summary className="settings-toggle-summary flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="settings-toggle-title">Segurança e histórico</div>
            <div className="settings-toggle-description">Acessos, impacto, validação, histórico de alterações e restauração segura.</div>
          </div>
          <span className="settings-toggle-action">{showGovernance ? "Ocultar" : "Abrir"}</span>
        </summary>
        {showGovernance && (
          <div className="settings-advanced-content mt-2.5 space-y-2.5">
            <ConfigurationSectionGuard />
            <ConfigurationAccessPanel />
            <ConfigurationGovernancePanel />
            <ConfigurationImpactSimulator />
            <ConfigurationPostChangeValidation />
            <ConfigurationHistoryPanel />
            <ConfigurationRollbackPanel />
          </div>
        )}
      </details>

      <details
        open={showFullSettings}
        onToggle={(event) => setShowFullSettings(event.currentTarget.open)}
        className="mx-auto mb-4 w-full max-w-7xl px-4 sm:px-6"
      >
        <summary className="settings-toggle-summary flex cursor-pointer list-none items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="settings-toggle-title">Configurações completas</div>
            <div className="settings-toggle-description">Empresa, equipe, integrações, catálogo e preferências detalhadas.</div>
          </div>
          <span className="settings-toggle-action">{showFullSettings ? "Ocultar" : "Abrir"}</span>
        </summary>
        {showFullSettings && (
          <div className="settings-advanced-content mt-2.5">
            <ConfiguracoesNormalized />
            <ConfigurationCatalogProductsBridge />
          </div>
        )}
      </details>
    </div>
  );
}
