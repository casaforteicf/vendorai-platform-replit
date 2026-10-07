import { useEffect, useState } from "react";
import { Bell, Bot, Building2, ChevronRight, Database, Search, Settings2, ShieldCheck, Users, Workflow, Zap } from "lucide-react";
import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
import { BrandKitSettings } from "@/components/BrandKitSettings";
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

      .settings-home-shell {
        width: 100%;
        max-width: 92rem;
        margin: 0 auto;
        padding: .65rem 1rem 1.5rem;
      }
      .settings-home-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .settings-home-title {
        font-size: 1.7rem;
        line-height: 1.15;
        font-weight: 750;
        letter-spacing: -.025em;
      }
      .settings-home-subtitle {
        margin-top: .35rem;
        color: hsl(var(--muted-foreground));
        font-size: .86rem;
      }
      .settings-review-button {
        display: inline-flex;
        align-items: center;
        gap: .55rem;
        min-height: 2.8rem;
        border: 1px solid hsl(var(--primary) / .16);
        border-radius: .85rem;
        padding: .7rem .9rem;
        background: hsl(var(--primary) / .08);
        color: hsl(var(--primary));
        font-size: .75rem;
        font-weight: 700;
      }
      .settings-searchbox {
        display: flex;
        align-items: center;
        gap: .65rem;
        height: 2.75rem;
        margin-bottom: 1rem;
        border: 1px solid hsl(var(--border));
        border-radius: .75rem;
        padding: 0 .85rem;
        background: hsl(var(--card));
        box-shadow: 0 1px 2px hsl(var(--foreground) / .04);
      }
      .settings-searchbox input {
        width: 100%;
        border: 0;
        outline: 0;
        background: transparent;
        font-size: .78rem;
      }
      .settings-home-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 20rem;
        gap: 1rem;
        align-items: start;
      }
      .settings-card-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: .8rem;
      }
      .settings-home-card {
        display: flex;
        min-height: 8.5rem;
        flex-direction: column;
        justify-content: space-between;
        border: 1px solid hsl(var(--border));
        border-radius: .9rem;
        padding: 1rem;
        background: hsl(var(--card));
        box-shadow: 0 1px 3px hsl(var(--foreground) / .04);
        transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
      }
      .settings-home-card:hover {
        transform: translateY(-1px);
        border-color: hsl(var(--primary) / .3);
        box-shadow: 0 8px 22px hsl(var(--foreground) / .06);
      }
      .settings-home-card__top { display: flex; gap: .8rem; align-items: flex-start; }
      .settings-home-card__icon {
        display: grid;
        width: 2.5rem;
        height: 2.5rem;
        flex: 0 0 auto;
        place-items: center;
        border-radius: .7rem;
        background: hsl(var(--primary) / .09);
        color: hsl(var(--primary));
      }
      .settings-home-card__title { font-size: .88rem; font-weight: 720; }
      .settings-home-card__description { margin-top: .25rem; font-size: .72rem; line-height: 1.45; color: hsl(var(--muted-foreground)); }
      .settings-home-card__action {
        display: inline-flex;
        align-items: center;
        gap: .35rem;
        width: fit-content;
        margin-top: .8rem;
        border: 1px solid hsl(var(--border));
        border-radius: .55rem;
        padding: .4rem .62rem;
        background: hsl(var(--background));
        font-size: .69rem;
        font-weight: 650;
      }
      .settings-side-stack { display: grid; gap: .8rem; }
      .settings-side-card {
        border: 1px solid hsl(var(--border));
        border-radius: .9rem;
        padding: 1rem;
        background: hsl(var(--card));
        box-shadow: 0 1px 3px hsl(var(--foreground) / .04);
      }
      .settings-side-card__title { font-size: .82rem; font-weight: 720; }
      .settings-recommendation-row,
      .settings-summary-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .75rem;
        padding: .68rem 0;
        border-bottom: 1px solid hsl(var(--border) / .72);
        font-size: .7rem;
      }
      .settings-recommendation-row:last-child,
      .settings-summary-row:last-child { border-bottom: 0; padding-bottom: 0; }
      .settings-summary-row span:first-child { color: hsl(var(--muted-foreground)); }
      .settings-review-panel {
        margin-bottom: 1rem;
        border: 1px solid hsl(var(--primary) / .2);
        border-radius: .85rem;
        padding: .9rem 1rem;
        background: hsl(var(--primary) / .04);
      }
      .settings-review-panel ul { margin: .55rem 0 0 1rem; list-style: disc; color: hsl(var(--muted-foreground)); font-size: .72rem; line-height: 1.55; }
      .settings-inline-panel { margin-top: 1rem; }

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

      @media (max-width: 980px) {
        .settings-home-layout { grid-template-columns: 1fr; }
        .settings-side-stack { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 640px) {
        .settings-home-header { flex-direction: column; }
        .settings-review-button { width: 100%; justify-content: space-between; }
        .settings-card-grid, .settings-side-stack { grid-template-columns: 1fr; }
        .settings-home-shell { padding-left: .75rem; padding-right: .75rem; }
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
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [settingsSearch, setSettingsSearch] = useState("");

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

  if (integrationsDeepLink) {
    return <IntegrationSettingsHub />;
  }

  // Marketing tem uma tela própria. Não misture Kit da Marca com as
  // configurações gerais da empresa, comercial, agenda, IA ou equipe.
  if (requestedTab === "marketing") {
    return (
      <div className="vendor-page-canvas mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <BrandKitSettings />
      </div>
    );
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

  const settingsCards = [
    {
      key: "empresa",
      title: "Empresa",
      description: "Dados da empresa, marca, endereço, canais e preferências.",
      icon: Building2,
      action: () => window.location.assign("/configuracoes?tab=perfil"),
    },
    {
      key: "equipe",
      title: "Equipe e permissões",
      description: "Usuários, funções, acessos e responsáveis.",
      icon: Users,
      action: () => window.location.assign("/configuracoes?tab=equipe"),
    },
    {
      key: "integracoes",
      title: "Integrações",
      description: "WhatsApp, Instagram, e-mail, Google, Meta, outros sistemas e APIs.",
      icon: Zap,
      action: () => window.location.assign("/configuracoes?tab=integracoes"),
    },
    {
      key: "ia",
      title: "IA e agentes",
      description: "Agentes, autonomia, permissões, comportamento e respostas.",
      icon: Bot,
      action: () => setShowJarvis(true),
    },
    {
      key: "crm",
      title: "CRM e operação",
      description: "Pipelines, etapas, atividades, propostas, regras e processos.",
      icon: Workflow,
      action: () => setShowFullSettings(true),
    },
    {
      key: "seguranca",
      title: "Segurança e auditoria",
      description: "Acessos, permissões, histórico de alterações, sessões e restauração.",
      icon: ShieldCheck,
      action: () => setShowGovernance(true),
    },
    {
      key: "notificacoes",
      title: "Notificações",
      description: "Alertas, e-mails, WhatsApp, eventos e preferências de contato.",
      icon: Bell,
      action: () => setShowFullSettings(true),
    },
    {
      key: "avancado",
      title: "Avançado",
      description: "Configurações técnicas, APIs, governança e preferências avançadas.",
      icon: Settings2,
      action: () => {
        setShowJarvis(true);
        setShowGovernance(true);
        setShowFullSettings(true);
      },
    },
  ];

  const settingsSearchTerm = settingsSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredSettingsCards = settingsSearchTerm
    ? settingsCards.filter((card) =>
        `${card.title} ${card.description}`.toLocaleLowerCase("pt-BR").includes(settingsSearchTerm),
      )
    : settingsCards;

  return (
    <div className="vendor-settings-compact vendor-page-canvas vendor-config-page">
      <SettingsUxCleanup />
      <main className="settings-home-shell">
        <header className="settings-home-header">
          <div>
            <h1 className="settings-home-title">Configurações</h1>
            <p className="settings-home-subtitle">Gerencie empresa, equipe, integrações, IA, segurança e preferências do Vendor.ai.</p>
          </div>
          <button type="button" className="settings-review-button" onClick={() => setShowRecommendations((current) => !current)}>
            <Settings2 className="h-4 w-4" />
            <span>Revisar configuração recomendada</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </header>

        {showRecommendations && (
          <section className="settings-review-panel" aria-label="Revisão da configuração recomendada">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[13px] font-semibold">{defaultsApplied ? "Padrão recomendado aplicado" : "Revise antes de aplicar"}</div>
                <ul>
                  <li>Mantém confirmação obrigatória para ações sensíveis.</li>
                  <li>Preserva suas permissões atuais de microfone e notificações.</li>
                  <li>Aplica o padrão recomendado somente às permissões e autonomia da IA.</li>
                </ul>
              </div>
              <button type="button" onClick={applyAutomaticDefaults} className="min-h-9 shrink-0 rounded-lg bg-primary px-3 py-2 text-[11px] font-semibold text-primary-foreground">
                {defaultsApplied ? "Aplicado" : "Aplicar após revisão"}
              </button>
            </div>
          </section>
        )}

        <label className="settings-searchbox">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={settingsSearch}
            onChange={(event) => setSettingsSearch(event.target.value)}
            placeholder="Pesquisar configuração, ex.: WhatsApp, usuários, pipeline..."
            aria-label="Pesquisar configuração"
          />
        </label>

        <div className="settings-home-layout">
          <section className="settings-card-grid" aria-label="Categorias de configuração">
            {filteredSettingsCards.map((card) => {
              const Icon = card.icon;
              return (
                <article key={card.key} className="settings-home-card">
                  <div className="settings-home-card__top">
                    <span className="settings-home-card__icon"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <div className="settings-home-card__title">{card.title}</div>
                      <p className="settings-home-card__description">{card.description}</p>
                    </div>
                  </div>
                  <button type="button" className="settings-home-card__action" onClick={card.action}>
                    Gerenciar <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </article>
              );
            })}
            {filteredSettingsCards.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhuma configuração encontrada para “{settingsSearch}”.
              </div>
            )}
          </section>

          <aside className="settings-side-stack">
            <section className="settings-side-card">
              <div className="flex items-center justify-between gap-3">
                <div className="settings-side-card__title">Recomendações</div>
                <button type="button" onClick={() => setShowRecommendations(true)} className="text-[10px] font-semibold text-primary">Revisar</button>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">Aplique mudanças somente depois de revisar o impacto.</p>
              <div className="settings-recommendation-row">
                <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Permissões da IA</span>
                <button type="button" onClick={() => setShowJarvis(true)} className="font-semibold text-primary">Abrir</button>
              </div>
              <div className="settings-recommendation-row">
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Segurança e histórico</span>
                <button type="button" onClick={() => setShowGovernance(true)} className="font-semibold text-primary">Abrir</button>
              </div>
              <div className="settings-recommendation-row">
                <span className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Configuração completa</span>
                <button type="button" onClick={() => setShowFullSettings(true)} className="font-semibold text-primary">Abrir</button>
              </div>
            </section>

            <section className="settings-side-card">
              <div className="settings-side-card__title">Resumo da configuração</div>
              <div className="settings-summary-row"><span>Empresa</span><strong>Perfil centralizado</strong></div>
              <div className="settings-summary-row"><span>Integrações</span><strong>Central única</strong></div>
              <div className="settings-summary-row"><span>IA e agentes</span><strong>Permissões revisáveis</strong></div>
              <div className="settings-summary-row"><span>Segurança</span><strong>Auditoria disponível</strong></div>
            </section>
          </aside>
        </div>

        {showJarvis && (
          <section className="settings-inline-panel">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold">IA e agentes</h2><p className="text-xs text-muted-foreground">Permissões, contexto e autonomia dos agentes.</p></div>
              <button type="button" onClick={() => setShowJarvis(false)} className="rounded-lg border px-2.5 py-1.5 text-xs">Fechar</button>
            </div>
            <JarvisPermissionsCenter />
          </section>
        )}

        {showGovernance && (
          <section className="settings-inline-panel settings-advanced-content space-y-2.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold">Segurança e auditoria</h2><p className="text-xs text-muted-foreground">Acessos, impacto, validação, histórico e restauração segura.</p></div>
              <button type="button" onClick={() => setShowGovernance(false)} className="rounded-lg border px-2.5 py-1.5 text-xs">Fechar</button>
            </div>
            <ConfigurationSectionGuard />
            <ConfigurationAccessPanel />
            <ConfigurationGovernancePanel />
            <ConfigurationImpactSimulator />
            <ConfigurationPostChangeValidation />
            <ConfigurationHistoryPanel />
            <ConfigurationRollbackPanel />
          </section>
        )}

        {showFullSettings && (
          <section className="settings-inline-panel settings-advanced-content">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div><h2 className="text-sm font-semibold">Configurações completas</h2><p className="text-xs text-muted-foreground">Demais opções preservadas e organizadas em um único ponto.</p></div>
              <button type="button" onClick={() => setShowFullSettings(false)} className="rounded-lg border px-2.5 py-1.5 text-xs">Fechar</button>
            </div>
            <ConfiguracoesNormalized />
            <ConfigurationCatalogProductsBridge />
          </section>
        )}
      </main>
    </div>
  );
}
