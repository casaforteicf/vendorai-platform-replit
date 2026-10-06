import React, { useMemo, useState } from "react";
import ConstructionPortalSettings from "../construction-hub/ConstructionPortalSettings";
import { ApprovalTimelinePanel } from "./ApprovalTimelinePanel";
import { ClientPortalPreview } from "./ClientPortalPreview";
import { PortalDeliveryPanel } from "./PortalDeliveryPanel";
import { ProposalItemsApprovalTable } from "./ProposalItemsApprovalTable";
import { ProposalSummaryCards } from "./ProposalSummaryCards";
import { useClientPortalApproval } from "./useClientPortalApproval";
import { getBudgetId, getClientName, getProjectId, getProjectTitle, proposalStatusClass, proposalStatusLabel } from "./portalUtils";

type ClientPortalApprovalStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function ClientPortalApprovalStudio({ arqState, onNavigate }: ClientPortalApprovalStudioProps) {
  const [view, setView] = useState<"proposal" | "portal">("proposal");
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const clientName = useMemo(() => getClientName(arqState), [arqState]);
  const budgetId = useMemo(() => getBudgetId(arqState), [arqState]);

  const {
    proposal,
    items,
    events,
    stats,
    loading,
    creating,
    activating,
    sending,
    error,
    reload,
    createFromBudget,
    activate,
    send,
  } = useClientPortalApproval(projectId, projectTitle, clientName, budgetId);

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Portal do Cliente</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">
                {view === "proposal" ? "Proposta e aprovações" : "Conteúdo publicado"}
              </h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • {view === "proposal"
                  ? "proposta, aprovação por item, envio e histórico de decisões."
                  : "documentos, cronograma, financeiro, contratos e demais conteúdos reais da obra."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("proposal")}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === "proposal" ? "bg-slate-950 text-white" : "border border-[var(--arq-border)] bg-[var(--arq-card)] text-[var(--arq-foreground)]"}`}
              >
                Proposta e aprovações
              </button>
              <button
                type="button"
                onClick={() => setView("portal")}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === "portal" ? "bg-slate-950 text-white" : "border border-[var(--arq-border)] bg-[var(--arq-card)] text-[var(--arq-foreground)]"}`}
              >
                Conteúdo do portal
              </button>

              {view === "proposal" && proposal ? (
                <span className={`rounded-2xl px-4 py-2 text-sm font-semibold ${proposalStatusClass(proposal.status)}`}>
                  {proposalStatusLabel(proposal.status)}
                </span>
              ) : null}

              {view === "proposal" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void reload()}
                    className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
                  >
                    {loading ? "Carregando..." : "Atualizar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void createFromBudget()}
                    disabled={creating}
                    className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {creating ? "Criando..." : "Criar proposta do orçamento"}
                  </button>
                </>
              ) : null}

              <button
                type="button"
                onClick={() => onNavigate?.("production")}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Produção
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Projeto" value={projectTitle || "Projeto"} />
            <Info label="Cliente" value={clientName || "A definir"} />
            <Info
              label={view === "proposal" ? "Proposta" : "Fonte"}
              value={view === "proposal"
                ? (proposal ? proposalStatusLabel(proposal.status) : "Ainda não criada")
                : "Obra vinculada ao projeto"}
            />
          </div>
        </header>

        {view === "portal" ? (
          <ConstructionPortalSettings arqState={arqState} />
        ) : (
          <>
            {error ? (
              <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
                {error}
              </div>
            ) : null}

            <ProposalSummaryCards proposal={proposal} stats={stats} />

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <ProposalItemsApprovalTable items={items} />
                <ClientPortalPreview proposal={proposal} items={items} />
              </div>

              <div className="space-y-5">
                <PortalDeliveryPanel
                  proposal={proposal}
                  activating={activating}
                  sending={sending}
                  onActivate={activate}
                  onSend={send}
                />

                <ApprovalTimelinePanel events={events} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-[var(--arq-card-soft)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--arq-foreground)]">{value}</p>
    </div>
  );
}
