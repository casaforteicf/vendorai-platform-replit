import { useEffect, useState } from "react";
import ConfiguracoesNormalized from "./ConfiguracoesNormalized";
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

export default function Configuracoes() {
  const params = new URLSearchParams(window.location.search);
  const legacySiteDeepLink = params.get("tab") === "site";
  const isInstallationMode = params.get("installation") === "1";

  const [showJarvis, setShowJarvis] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  const [showInstallationSettings, setShowInstallationSettings] = useState(false);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    const openIntegration = (event: MouseEvent) => {
      const origin = event.target instanceof Element ? event.target : null;
      const card = origin?.closest<HTMLElement>("[data-integration-key]");
      const key = card?.dataset.integrationKey;
      if (!key) return;

      event.preventDefault();
      event.stopPropagation();

      if (key === "domain") {
        window.location.assign("/content-autopilot?view=settings");
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
