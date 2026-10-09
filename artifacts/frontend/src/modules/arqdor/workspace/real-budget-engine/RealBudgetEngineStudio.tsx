import React, { useMemo, useState } from "react";
import { BudgetItemEditorPanel } from "./BudgetItemEditorPanel";
import { BudgetItemsTable } from "./BudgetItemsTable";
import { BudgetPrintPreview } from "./BudgetPrintPreview";
import { BudgetSettingsPanel } from "./BudgetSettingsPanel";
import { BudgetSummaryCards } from "./BudgetSummaryCards";
import type { BudgetViewMode } from "./budgetTypes";
import { getClientName, getProjectId, getProjectTitle, statusClass, statusLabel } from "./budgetUtils";
import { useRealBudgetEngine } from "./useRealBudgetEngine";
import { ProjectCommercialFlowBar } from "../project-commercial-flow/ProjectCommercialFlowBar";

type RealBudgetEngineStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type GeometryQuantity = {
  key: string;
  item: string;
  description: string;
  quantity: number;
  unit: string;
  type: "material" | "product" | "service" | "other";
};

function activeArchProject(arqState: any) {
  return arqState?.currentProject ?? arqState?.selectedProject ?? arqState?.project ?? arqState ?? null;
}

function dimensionInMeters(value: unknown): number {
  if (value == null) return 0;
  const raw = String(value).trim().toLowerCase().replace(",", ".");
  const number = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(number) || number <= 0) return 0;
  if (/mm\b/.test(raw)) return number / 1000;
  if (/cm\b/.test(raw)) return number / 100;
  return number;
}

function geometryQuantities(arqState: any): GeometryQuantity[] {
  const project = activeArchProject(arqState);
  const objects = Array.isArray(project?.objetos)
    ? project.objetos
    : Array.isArray(project?.objects)
      ? project.objects
      : [];

  const result: GeometryQuantity[] = [];
  for (const object of objects) {
    const category = String(object?.categoria || object?.category || "").toUpperCase();
    const name = String(object?.nome || object?.name || object?.tipo || category || "Elemento");
    const dims = object?.dimensoes || object?.dimensions || {};
    const width = dimensionInMeters(dims?.largura ?? dims?.width);
    const height = dimensionInMeters(dims?.altura ?? dims?.height);
    const depth = dimensionInMeters(dims?.profundidade ?? dims?.depth);
    const key = String(object?.id || `${category}:${name}`);

    let quantity = 0;
    let unit = "un";
    if (["PAREDE", "ESQUADRIA", "PORTA", "VIDRO"].includes(category) && width > 0 && height > 0) {
      quantity = width * height;
      unit = "m²";
    } else if (["PISO", "FORRO", "AMBIENTE", "BANCADA", "PEDRA"].includes(category) && width > 0 && depth > 0) {
      quantity = width * depth;
      unit = "m²";
    } else if (category === "ESTRUTURA" && width > 0 && height > 0 && depth > 0) {
      quantity = width * height * depth;
      unit = "m³";
    } else if (width > 0 && height > 0 && depth > 0) {
      quantity = width * height * depth;
      unit = "m³";
    } else if (width > 0 && height > 0) {
      quantity = width * height;
      unit = "m²";
    } else if (width > 0) {
      quantity = width;
      unit = "m";
    } else {
      quantity = 1;
      unit = "un";
    }

    result.push({
      key,
      item: `[GEOMETRIA] ${category ? `${category} — ` : ""}${name}`,
      description: `Quantitativo preliminar gerado da geometria do Pré-Projeto. Elemento: ${key}. Pode ser especificado tecnicamente depois.`,
      quantity: Number(quantity.toFixed(4)),
      unit,
      type: category === "PORTA" || category === "ESQUADRIA" ? "product" : "other",
    });
  }
  return result;
}

export default function RealBudgetEngineStudio({ arqState, onNavigate }: RealBudgetEngineStudioProps) {
  const projectId = useMemo(() => getProjectId(arqState), [arqState]);
  const projectTitle = useMemo(() => getProjectTitle(arqState), [arqState]);
  const clientName = useMemo(() => getClientName(arqState), [arqState]);
  const [viewMode, setViewMode] = useState<BudgetViewMode>("internal");
  const [generatingGeometry, setGeneratingGeometry] = useState(false);
  const [geometryMessage, setGeometryMessage] = useState<string | null>(null);

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

  const geometry = useMemo(() => geometryQuantities(arqState), [arqState]);

  const generateFromGeometry = async () => {
    if (!projectId || !geometry.length || generatingGeometry) return;
    setGeneratingGeometry(true);
    setGeometryMessage(null);
    try {
      await ensureBudget();
      const existingGeometry = new Set(
        items
          .filter((item) => item.item.startsWith("[GEOMETRIA]"))
          .map((item) => item.item),
      );
      let created = 0;
      for (let index = 0; index < geometry.length; index += 1) {
        const quantity = geometry[index];
        if (existingGeometry.has(quantity.item)) continue;
        const result = await addItem({
          item: quantity.item,
          description: quantity.description,
          type: quantity.type,
          quantity: quantity.quantity,
          unit: quantity.unit,
          materialValue: 0,
          laborValue: 0,
          visibleToClient: true,
          sortOrder: index,
        });
        if (result) created += 1;
      }
      setGeometryMessage(
        created > 0
          ? `${created} quantitativo(s) geométrico(s) adicionados. Custos continuam em aberto até orçamento/especificação.`
          : "Os quantitativos geométricos deste projeto já estão no orçamento.",
      );
      await reload();
    } finally {
      setGeneratingGeometry(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--arq-background)] text-[var(--arq-foreground)]">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-[var(--arq-border)] bg-[var(--arq-card)] p-5 shadow-sm print:hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--arq-accent)]">Orçamento do projeto</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-[var(--arq-foreground)]">Quantificar primeiro. Especificar quando precisar.</h1>
              <p className="mt-1 text-sm text-[var(--arq-muted)]">
                {projectTitle} • gere quantitativos pela geometria do Pré-Projeto sem exigir especificação; depois aprofunde sistemas, composições, materiais e mão de obra.
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
                onClick={() => void generateFromGeometry()}
                disabled={generatingGeometry || !geometry.length}
                className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {generatingGeometry ? "Quantificando..." : `Gerar quantitativos (${geometry.length})`}
              </button>

              <button
                type="button"
                onClick={() => void generateFromSpecObjects()}
                disabled={generating}
                className="rounded-2xl bg-[var(--arq-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {generating ? "Gerando..." : "Aprofundar pela especificação"}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Projeto" value={projectId || "não identificado"} />
            <Info label="Cliente" value={budget?.clientName || clientName} />
            <Info label="Budget ID" value={budget?.id || "ainda não criado"} />
          </div>
        </header>

        <ProjectCommercialFlowBar
          current="budget"
          onNavigate={onNavigate}
          projectReady={Boolean(projectId)}
          specificationReady={items.length > 0}
          budgetReady={Boolean(budget)}
        />

        {geometryMessage ? (
          <div className="rounded-[28px] border border-emerald-100 bg-emerald-50 p-4 text-sm font-medium text-emerald-800 print:hidden">
            {geometryMessage}
          </div>
        ) : null}

        {!geometry.length ? (
          <div className="rounded-[28px] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
            Ainda não encontrei elementos geométricos quantificáveis neste projeto. Você pode criar o orçamento manualmente ou voltar ao Pré-Projeto e concluir/importar a geometria.
          </div>
        ) : null}

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
