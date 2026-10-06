import React, { useEffect, useMemo, useState } from "react";
import { BudgetBridgePanel } from "./BudgetBridgePanel";
import { CatalogBrowserPanel } from "./CatalogBrowserPanel";
import { SpecObjectEditorPanel } from "./SpecObjectEditorPanel";
import { SpecObjectListPanel } from "./SpecObjectListPanel";
import { SpecSummaryCards } from "./SpecSummaryCards";
import { useRealSpecificationCatalog } from "./useRealSpecificationCatalog";
import { getProjectId, getProjectTitle } from "./specCatalogUtils";
import { printSpecification } from "./printSpecification";
import { useAuth } from "@/contexts/AuthContext";

type RealSpecificationCatalogStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type PendingCatalogItem = {
  id: string;
  name: string;
  category?: string | null;
  source?: string;
  projectId?: string;
};

type WorkspacePanel = "details" | "catalog" | "budget" | null;

export default function RealSpecificationCatalogStudio({ arqState, onNavigate }: RealSpecificationCatalogStudioProps) {
  const { user } = useAuth();
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const [renderId, setRenderId] = useState("");
  const [pendingItem, setPendingItem] = useState<PendingCatalogItem | null>(null);
  const [panel, setPanel] = useState<WorkspacePanel>(null);
  const [filter, setFilter] = useState("");

  const {
    catalogItems,
    specObjects,
    selectedObject,
    setSelectedObject,
    catalogType,
    setCatalogType,
    query,
    setQuery,
    loadingCatalog,
    loadingObjects,
    saving,
    extracting,
    sendingToBudget,
    syncingProject,
    lastSync,
    approvals,
    approving,
    error,
    totals,
    reloadCatalog,
    reloadSpecObjects,
    syncProject,
    decideApproval,
    addObject,
    saveObject,
    extractFromRender,
    applyCatalogToObject,
    sendToBudget,
  } = useRealSpecificationCatalog(projectId, renderId || undefined, { catalogEnabled: panel === "catalog" });

  useEffect(() => {
    const raw = sessionStorage.getItem("arqdor:pendingCatalogItem");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PendingCatalogItem;
      if (parsed?.name && (!parsed.projectId || parsed.projectId === projectId)) {
        setPendingItem(parsed);
        setQuery(parsed.name);
        setPanel("catalog");
      }
    } catch {
      // Entrada antiga/inválida não deve quebrar o workspace.
    } finally {
      sessionStorage.removeItem("arqdor:pendingCatalogItem");
    }
  }, [projectId, setQuery]);

  const visibleObjects = useMemo(() => {
    const normalized = filter.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return specObjects;
    return specObjects.filter((item) =>
      [item.name, item.category, item.region, item.productName, item.materialName, item.supplierName]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(normalized)),
    );
  }, [filter, specObjects]);

  const applyWithHandoff = async (item: any) => {
    if (!selectedObject) return;
    const result = await applyCatalogToObject(selectedObject, item);
    if (result && pendingItem?.id === item.id) setPendingItem(null);
  };

  const openObject = (item: any) => {
    setSelectedObject(item);
    setPanel("details");
  };

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4 md:px-6 md:py-6">
        <header className="rounded-3xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Specification</p>
              <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-[var(--arq-foreground)]">{projectTitle}</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">Definições técnicas, materiais, fornecedores e orçamento do projeto.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedObject(null);
                  setPanel("details");
                }}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                + Novo item
              </button>
              <button
                type="button"
                onClick={() => setPanel("catalog")}
                className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Catálogo
              </button>
              <button
                type="button"
                onClick={() => setPanel("budget")}
                className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Orçamento
              </button>
              <button
                type="button"
                disabled={!specObjects.length}
                onClick={() => void printSpecification({
                  tenantId: user?.tenantId ?? null,
                  projectTitle,
                  items: specObjects,
                }).catch((err) => console.error("Falha ao imprimir especificação", err))}
                className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold hover:border-violet-200 hover:text-[var(--arq-accent)] disabled:opacity-50"
              >
                Imprimir especificação
              </button>
              <button
                type="button"
                onClick={() => onNavigate?.("procurement")}
                className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Cotar fornecedores
              </button>
            </div>
          </div>
        </header>

        {pendingItem ? (
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
            <div className="flex items-center justify-between gap-3">
              <span><strong>{pendingItem.name}</strong> veio do ARQ Hub. Selecione um item e revise antes de aplicar.</span>
              <button type="button" onClick={() => setPendingItem(null)} className="text-xs font-semibold">Fechar</button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</div>
        ) : null}

        {lastSync && (Number(lastSync["created"] || 0) > 0 || Number(lastSync["updated"] || 0) > 0 || Number(lastSync["removed"] || 0) > 0) ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Projeto sincronizado: {Number(lastSync["created"] || 0)} novo(s), {Number(lastSync["updated"] || 0)} alterado(s) e {Number(lastSync["removed"] || 0)} removido(s). Revise os itens afetados antes de atualizar orçamento ou cotação.
          </div>
        ) : null}

        <SpecSummaryCards
          count={totals.count}
          specified={totals.specified}
          material={totals.material}
          labor={totals.labor}
          total={totals.total}
        />

        <section className="rounded-3xl border border-[var(--arq-border)] bg-[var(--arq-card)] p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative flex-1">
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Buscar por item, ambiente, material, produto ou fornecedor..."
                className="w-full rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2.5 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncingProject}
                onClick={() => void syncProject()}
                className="rounded-xl border border-[var(--arq-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {syncingProject ? "Sincronizando..." : "Sincronizar projeto"}
              </button>
              <button
                type="button"
                onClick={() => void reloadSpecObjects()}
                className="rounded-xl border border-[var(--arq-border)] px-3 py-2 text-sm font-semibold"
              >
                Atualizar
              </button>
              {renderId ? (
                <button
                  type="button"
                  disabled={extracting}
                  onClick={() => void extractFromRender()}
                  className="rounded-xl border border-[var(--arq-border)] px-3 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {extracting ? "Analisando..." : "Extrair do render"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <SpecObjectListPanel
              items={visibleObjects}
              selectedObject={selectedObject}
              loading={loadingObjects}
              extracting={extracting}
              hasRender={Boolean(renderId)}
              onSelect={openObject}
              onExtract={extractFromRender}
            />
          </div>
        </section>

        {panel ? (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-[1px]" role="dialog" aria-modal="true">
            <button type="button" aria-label="Fechar painel" className="min-w-0 flex-1" onClick={() => setPanel(null)} />
            <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-[var(--arq-border)] bg-[var(--arq-background)] shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--arq-border)] bg-[var(--arq-background)]/95 px-5 py-4 backdrop-blur">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">
                    {panel === "details" ? "Detalhes" : panel === "catalog" ? "Catálogo" : "Orçamento"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--arq-muted)]">
                    {selectedObject?.name || (panel === "details" ? "Novo item" : projectTitle)}
                  </p>
                </div>
                <button type="button" onClick={() => setPanel(null)} className="rounded-xl border border-[var(--arq-border)] px-3 py-2 text-sm font-semibold">
                  Fechar
                </button>
              </div>

              <div className="space-y-4 p-4 md:p-5">
                {panel === "details" ? (
                  <>
                    <SpecObjectEditorPanel
                      projectId={projectId}
                      renderId={renderId || undefined}
                      selectedObject={selectedObject}
                      saving={saving}
                      sendingToBudget={sendingToBudget}
                      approvals={approvals}
                      approving={approving}
                      onDecision={decideApproval}
                      onCreate={addObject}
                      onSave={saveObject}
                      onSendToBudget={sendToBudget}
                    />
                    {selectedObject ? (
                      <button
                        type="button"
                        onClick={() => setPanel("catalog")}
                        className="w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm font-semibold hover:border-violet-200 hover:text-[var(--arq-accent)]"
                      >
                        Escolher produto, material ou fornecedor
                      </button>
                    ) : null}
                  </>
                ) : null}

                {panel === "catalog" ? (
                  <CatalogBrowserPanel
                    items={catalogItems}
                    selectedObject={selectedObject}
                    catalogType={catalogType}
                    query={query}
                    loading={loadingCatalog}
                    onTypeChange={setCatalogType}
                    onQueryChange={setQuery}
                    onApply={(item) => selectedObject ? void applyWithHandoff(item) : undefined}
                    onReload={reloadCatalog}
                  />
                ) : null}

                {panel === "budget" ? (
                  <>
                    <BudgetBridgePanel items={specObjects} sending={sendingToBudget} onSend={sendToBudget} />
                    <button
                      type="button"
                      onClick={() => onNavigate?.("orcamento")}
                      className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Abrir orçamento completo
                    </button>
                  </>
                ) : null}
              </div>
            </aside>
          </div>
        ) : null}

        <details className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Ferramentas avançadas</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={renderId}
              onChange={(event) => setRenderId(event.target.value)}
              placeholder="ID de render aprovado (opcional)"
              className="rounded-xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2.5 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!renderId || extracting}
              onClick={() => void extractFromRender()}
              className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {extracting ? "Analisando..." : "Extrair"}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
