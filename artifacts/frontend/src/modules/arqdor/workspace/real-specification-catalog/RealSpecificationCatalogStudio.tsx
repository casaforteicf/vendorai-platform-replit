import React, { useEffect, useMemo, useState } from "react";
import { BudgetBridgePanel } from "./BudgetBridgePanel";
import { CatalogBrowserPanel } from "./CatalogBrowserPanel";
import { SpecObjectEditorPanel } from "./SpecObjectEditorPanel";
import { SpecObjectListPanel } from "./SpecObjectListPanel";
import { SpecSummaryCards } from "./SpecSummaryCards";
import { useRealSpecificationCatalog } from "./useRealSpecificationCatalog";
import { getProjectId, getProjectTitle } from "./specCatalogUtils";

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

export default function RealSpecificationCatalogStudio({ arqState, onNavigate }: RealSpecificationCatalogStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const [renderId, setRenderId] = useState("");
  const [pendingItem, setPendingItem] = useState<PendingCatalogItem | null>(null);

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
    error,
    totals,
    reloadCatalog,
    reloadSpecObjects,
    addObject,
    saveObject,
    extractFromRender,
    applyCatalogToObject,
    sendToBudget,
  } = useRealSpecificationCatalog(projectId, renderId || undefined);

  useEffect(() => {
    const raw = sessionStorage.getItem("arqdor:pendingCatalogItem");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as PendingCatalogItem;
      if (parsed?.name && (!parsed.projectId || parsed.projectId === projectId)) {
        setPendingItem(parsed);
        setQuery(parsed.name);
      }
    } catch {
      // Entrada antiga/inválida não deve quebrar o workspace.
    } finally {
      sessionStorage.removeItem("arqdor:pendingCatalogItem");
    }
  }, [projectId, setQuery]);

  const applyWithHandoff = async (item: any) => {
    if (!selectedObject) return;
    const result = await applyCatalogToObject(selectedObject, item);
    if (result && pendingItem?.id === item.id) setPendingItem(null);
  };

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Especificações do projeto</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Catálogo real + objetos especificáveis</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • render aprovado vira objeto especificável, catálogo real, valores e envio ao orçamento.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void reloadSpecObjects();
                  void reloadCatalog();
                }}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Atualizar
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.("orcamento")}
                className="rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-2 text-sm font-semibold text-[var(--arq-foreground)] hover:border-violet-200 hover:text-[var(--arq-accent)]"
              >
                Orçamento
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_320px]">
            <div className="rounded-3xl bg-[var(--arq-card-soft)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Projeto</p>
              <p className="mt-1 text-sm font-semibold text-[var(--arq-foreground)]">{projectId || "Projeto não identificado"}</p>
            </div>

            <label className="block rounded-3xl bg-[var(--arq-card-soft)] p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-muted)]">Render aprovado ID</span>
              <input
                value={renderId}
                onChange={(event) => setRenderId(event.target.value)}
                placeholder="opcional"
                className="mt-2 w-full rounded-2xl border border-[var(--arq-border)] bg-[var(--arq-card)] px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
              />
            </label>
          </div>
        </header>

        {pendingItem ? (
          <div className="rounded-[28px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Item vindo do ARQ Hub: {pendingItem.name}</p>
                <p className="mt-1 text-xs text-violet-700">
                  A busca já foi preenchida. Selecione o objeto correto do projeto e aplique o item no catálogo. Nada é alterado sem essa confirmação.
                </p>
              </div>
              <button type="button" onClick={() => setPendingItem(null)} className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-800">
                Fechar aviso
              </button>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[28px] border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <SpecSummaryCards
          count={totals.count}
          specified={totals.specified}
          material={totals.material}
          labor={totals.labor}
          total={totals.total}
        />

        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-5">
            <SpecObjectListPanel
              items={specObjects}
              selectedObject={selectedObject}
              loading={loadingObjects}
              extracting={extracting}
              hasRender={Boolean(renderId)}
              onSelect={setSelectedObject}
              onExtract={extractFromRender}
            />

            <SpecObjectEditorPanel
              projectId={projectId}
              renderId={renderId || undefined}
              selectedObject={selectedObject}
              saving={saving}
              sendingToBudget={sendingToBudget}
              onCreate={addObject}
              onSave={saveObject}
              onSendToBudget={sendToBudget}
            />

            <BudgetBridgePanel
              items={specObjects}
              sending={sendingToBudget}
              onSend={sendToBudget}
            />
          </div>

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
        </div>
      </div>
    </div>
  );
}
