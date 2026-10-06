import React, { useMemo, useState } from "react";
import { BudgetItemEditorPanel } from "./BudgetItemEditorPanel";
import { BudgetItemsTable } from "./BudgetItemsTable";
import { BudgetPrintPreview } from "./BudgetPrintPreview";
import { BudgetSettingsPanel } from "./BudgetSettingsPanel";
import { BudgetSummaryCards } from "./BudgetSummaryCards";
import type { BudgetViewMode } from "./budgetTypes";
import { getClientName, getProjectId, getProjectTitle, statusClass, statusLabel } from "./budgetUtils";
import { useRealBudgetEngine } from "./useRealBudgetEngine";

type RealBudgetEngineStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

export default function RealBudgetEngineStudio({ arqState, onNavigate }: RealBudgetEngineStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const clientName = useMemo(() => getClientName(arqState), [arqState]);
  const [viewMode, setViewMode] = useState<BudgetViewMode>("internal");

  const {
    budget,
    items,
    selectedItem,
    setSelectedItem,
    totals,
    loading,
    saving,
    generating,
    sending,
    approving,
    error,
    reload,
    ensureBudget,
    generateFromSpecObjects,
    saveBudget,
    addItem,
    saveItem,
    removeItem,
    sendBudget,
    approveCurrentBudget,
  } = useRealBudgetEngine(projectId, projectTitle, clientName);

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm print:hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Sprint 031 • Real Budget Engine</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Orçamento real + impressão corrigida</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • material e mão de obra separados, itens visíveis na impressão e versão cliente/interna.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {budget ? (
                <span className={`rounded-2xl px-4 py-2 text-sm font-semibold ${statusClass(budget.status)}`}>
                  {statusLabel(budget.status)}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setViewMode(viewMode === "internal" ? "client" : "internal")}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Modo: {viewMode === "internal" ? "Interno" : "Cliente"}
              </button>

              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                {loading ? "Carregando..." : "Atualizar"}
              </button>

              <button
                type="button"
                onClick={() => void ensureBudget()}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Criar orçamento
              </button>

              <button
                type="button"
                onClick={() => void generateFromSpecObjects()}
                disabled={generating}
                className="rounded-2xl bg-[var(--arq-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {generating ? "Gerando..." : "Gerar dos SpecObjects"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Projeto" value={projectId || "não identificado"} />
            <Info label="Cliente" value={budget?.clientName || clientName} />
            <Info label="Budget ID" value={budget?.id || "ainda não criado"} />
          </div>
        </header>

        {error ? (
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700 print:hidden">
            {error}
          </div>
        ) : null}

        {budget?.specificationOutdated ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
            Este orçamento ficou desatualizado após uma revisão do projeto{budget.specificationRevision ? ` (revisão ${budget.specificationRevision})` : ""}. Revise e sincronize os itens destacados antes de enviar, aprovar ou solicitar novas cotações.
          </div>
        ) : null}

        <div className="print:hidden">
          <BudgetSummaryCards budget={budget} totals={totals} itemCount={items.length} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr] print:block">
          <div className="space-y-5">
            <BudgetItemsTable
              items={items}
              selectedItem={selectedItem}
              viewMode={viewMode}
              onSelect={setSelectedItem}
              onDelete={(id) => void removeItem(id)}
            />

            <BudgetPrintPreview
              budget={budget}
              items={items}
              totals={totals}
              viewMode={viewMode}
              projectTitle={projectTitle}
            />
          </div>

          <div className="space-y-5 print:hidden">
            <BudgetItemEditorPanel
              selectedItem={selectedItem}
              saving={saving}
              onCreate={addItem}
              onSave={saveItem}
            />

            <BudgetSettingsPanel
              budget={budget}
              saving={saving}
              onSave={saveBudget}
            />

            <section className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Ações</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--arq-foreground)]">Enviar, aprovar e continuar fluxo</h2>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  disabled={!budget || sending || Boolean(budget?.specificationOutdated)}
                  onClick={() => void sendBudget()}
                  className="rounded-2xl bg-[var(--arq-accent)] px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? "Enviando..." : "Marcar como enviado"}
                </button>

                <button
                  type="button"
                  disabled={!budget || approving || Boolean(budget?.specificationOutdated)}
                  onClick={() => void approveCurrentBudget()}
                  className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approving ? "Aprovando..." : "Aprovar orçamento"}
                </button>

                <button
                  type="button"
                  disabled={!budget || Boolean(budget?.specificationOutdated)}
                  onClick={() => onNavigate?.("procurement")}
                  className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Solicitar cotações aos fornecedores
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate?.("portal-cliente")}
                  className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-5 py-3 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
                >
                  Ir para portal cliente
                </button>
              </div>
            </section>
          </div>
        </div>
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
