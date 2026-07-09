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
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm print:hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 031 • Real Budget Engine</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Orçamento real + impressão corrigida</h1>
              <p className="mt-1 text-sm text-slate-500">
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
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
              >
                Modo: {viewMode === "internal" ? "Interno" : "Cliente"}
              </button>

              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
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
                className="rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
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

            <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Ações</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Enviar, aprovar e continuar fluxo</h2>

              <div className="mt-5 grid gap-3">
                <button
                  type="button"
                  disabled={!budget || sending}
                  onClick={() => void sendBudget()}
                  className="rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {sending ? "Enviando..." : "Marcar como enviado"}
                </button>

                <button
                  type="button"
                  disabled={!budget || approving}
                  onClick={() => void approveCurrentBudget()}
                  className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {approving ? "Aprovando..." : "Aprovar orçamento"}
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate?.("portal-cliente")}
                  className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
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
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
