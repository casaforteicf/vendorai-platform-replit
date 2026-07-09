import React, { useMemo, useState } from "react";
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

export default function RealSpecificationCatalogStudio({ arqState, onNavigate }: RealSpecificationCatalogStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const [renderId, setRenderId] = useState("");

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

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Sprint 030 • Real Specification Catalog</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">SpecObject persistente + catálogo real</h1>
              <p className="mt-1 text-sm text-slate-500">
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
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
              >
                Orçamento
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[1fr_320px]">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Projeto</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{projectId || "Projeto não identificado"}</p>
            </div>

            <label className="block rounded-3xl bg-slate-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Render aprovado ID</span>
              <input
                value={renderId}
                onChange={(event) => setRenderId(event.target.value)}
                placeholder="opcional, vindo da Sprint 029"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
              />
            </label>
          </div>
        </header>

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
            onApply={(item) => selectedObject ? void applyCatalogToObject(selectedObject, item) : undefined}
            onReload={reloadCatalog}
          />
        </div>
      </div>
    </div>
  );
}
