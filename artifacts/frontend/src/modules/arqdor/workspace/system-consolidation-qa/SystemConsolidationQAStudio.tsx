import React, { useState } from "react";
import { EndpointHealthPanel } from "./EndpointHealthPanel";
import { MockDebtPanel } from "./MockDebtPanel";
import { ModuleRegistryPanel } from "./ModuleRegistryPanel";
import { NavigationFlowPanel } from "./NavigationFlowPanel";
import { ReleaseGatePanel } from "./ReleaseGatePanel";
import { SystemSummaryCards } from "./SystemSummaryCards";
import { TenantSecurityPanel } from "./TenantSecurityPanel";
import type { ReleaseGateStatus } from "./consolidationTypes";
import { useSystemConsolidationQA } from "./useSystemConsolidationQA";

type SystemConsolidationQAStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function SystemConsolidationQAStudio({ onNavigate }: SystemConsolidationQAStudioProps) {
  const [view, setView] = useState<"overview" | "modules" | "apis" | "gates" | "mocks" | "security">("overview");

  const {
    modules,
    endpoints,
    mockDebts,
    releaseGates,
    flow,
    securityChecks,
    stats,
    loading,
    checking,
    savingGate,
    error,
    reload,
    checkEndpoints,
    setGateStatus,
  } = useSystemConsolidationQA();

  const nav = [
    { id: "overview", label: "Visão" },
    { id: "modules", label: "Módulos" },
    { id: "apis", label: "APIs" },
    { id: "gates", label: "Release" },
    { id: "mocks", label: "Mocks" },
    { id: "security", label: "Segurança" },
  ] as const;

  function handleGateChange(gateId: string, status: ReleaseGateStatus, evidence?: string) {
    void setGateStatus(gateId, status, evidence);
  }

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Sprint 035 • System Consolidation, Navigation & QA</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Consolidação geral do ARQDOR.ai</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                Navegação única, matriz de endpoints, mocks restantes, segurança tenant e gates para Release Candidate.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {nav.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setView(item.id)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    view === item.id ? "bg-slate-950 text-white" : "bg-[var(--arq-card-soft)] text-[var(--arq-muted)] hover:bg-[var(--arq-card-soft)] hover:text-[var(--arq-accent)]",
                  ].join(" ")}
                >
                  {item.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                {loading ? "Carregando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-[28px] border border-amber-100 bg-amber-50 p-4 text-sm font-medium text-amber-700">
            {error}
          </div>
        ) : null}

        {(view === "overview" || view === "modules") ? (
          <>
            <SystemSummaryCards stats={stats} />
            <NavigationFlowPanel flow={flow} modules={modules} onNavigate={onNavigate} />
          </>
        ) : null}

        {view === "modules" ? (
          <ModuleRegistryPanel modules={modules} onNavigate={onNavigate} />
        ) : null}

        {view === "apis" ? (
          <EndpointHealthPanel endpoints={endpoints} checking={checking} onCheck={checkEndpoints} />
        ) : null}

        {view === "gates" ? (
          <ReleaseGatePanel gates={releaseGates} saving={savingGate} onChange={handleGateChange} />
        ) : null}

        {view === "mocks" ? (
          <MockDebtPanel items={mockDebts} />
        ) : null}

        {view === "security" ? (
          <TenantSecurityPanel checks={securityChecks} />
        ) : null}

        <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Comando de validação</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Rodar no Replit após aplicar</h2>
          <pre className="mt-4 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm text-white">
            <code>{`pnpm typecheck
pnpm test -- --runInBand
pnpm lint`}</code>
          </pre>
          <p className="mt-3 text-sm leading-6 text-[var(--arq-muted)]">
            Se algum comando não existir no projeto, o agente deve informar o comando equivalente e registrar no gate de evidência.
          </p>
        </section>
      </div>
    </div>
  );
}
