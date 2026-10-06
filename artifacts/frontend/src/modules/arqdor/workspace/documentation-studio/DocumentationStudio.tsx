import React, { useEffect, useMemo, useState } from "react";

type DocumentationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type ViewId = "memorial" | "materiais" | "compras";

type SpecObject = {
  id: string;
  project_id: string;
  ambiente_id?: string | null;
  render_id?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  region?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  product_name?: string | null;
  material_name?: string | null;
  catalog_code?: string | null;
  manufacturer_name?: string | null;
  supplier_name?: string | null;
  material_value?: string | number | null;
  labor_value?: string | number | null;
  total_value?: string | number | null;
  notes?: string | null;
  status?: string | null;
};

type BudgetItem = {
  id: string;
  item: string;
  description?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  material_value?: string | number | null;
  labor_value?: string | number | null;
  total?: string | number | null;
  supplier_name?: string | null;
  manufacturer_name?: string | null;
  product_name?: string | null;
  material_name?: string | null;
  catalog_code?: string | null;
};

type BudgetResponse = {
  budget: any | null;
  items: BudgetItem[];
  totals: {
    subtotalMaterial: number;
    subtotalLabor: number;
    subtotal: number;
    discountTotal: number;
    grandTotal: number;
  };
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function projectIdOf(arqState: any, project: any): string {
  return String(
    arqState?.projectId ||
    arqState?.activeProjectId ||
    project?.id ||
    project?.projectId ||
    "",
  );
}

function projectTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

function clientName(project: any): string {
  return project?.clienteNome || project?.clientName || "Cliente não informado";
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function textOrPending(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "Pendente de especificação";
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

export default function DocumentationStudio({ arqState, onNavigate }: DocumentationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const projectId = useMemo(() => projectIdOf(arqState, project), [arqState, project]);
  const [view, setView] = useState<ViewId>("memorial");
  const [specs, setSpecs] = useState<SpecObject[]>([]);
  const [budget, setBudget] = useState<BudgetResponse>({
    budget: null,
    items: [],
    totals: { subtotalMaterial: 0, subtotalLabor: 0, subtotal: 0, discountTotal: 0, grandTotal: 0 },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/arch/spec-objects?projectId=${encodeURIComponent(projectId)}`, { headers: authHeaders() }),
      fetch(`/api/arch/orcamento?projectId=${encodeURIComponent(projectId)}`, { headers: authHeaders() }),
    ])
      .then(async ([specRes, budgetRes]) => {
        if (!specRes.ok) throw new Error(`Especificações: HTTP ${specRes.status}`);
        if (!budgetRes.ok) throw new Error(`Orçamento: HTTP ${budgetRes.status}`);
        const specData = await specRes.json();
        const budgetData = await budgetRes.json();
        if (cancelled) return;
        setSpecs(Array.isArray(specData?.items) ? specData.items : []);
        setBudget({
          budget: budgetData?.budget ?? null,
          items: Array.isArray(budgetData?.items) ? budgetData.items : [],
          totals: budgetData?.totals ?? { subtotalMaterial: 0, subtotalLabor: 0, subtotal: 0, discountTotal: 0, grandTotal: 0 },
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar documentação");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [projectId]);

  const specifiedCount = specs.filter((s) => s.material_name || s.product_name).length;
  const pendingCount = specs.length - specifiedCount;

  const materialRows = useMemo(() => specs.filter((s) => s.material_name || s.product_name || s.manufacturer_name || s.supplier_name), [specs]);

  const exportMaterials = () => downloadCsv(
    `caderno-materiais-${projectId || "projeto"}.csv`,
    [
      ["Item", "Código / SKU", "Material", "Produto", "Fabricante", "Fornecedor", "Quantidade", "Unidade", "Região", "Status"],
      ...materialRows.map((s) => [
        s.name,
        s.catalog_code ?? "",
        s.material_name ?? "",
        s.product_name ?? "",
        s.manufacturer_name ?? "",
        s.supplier_name ?? "",
        Number(s.quantity ?? 1),
        s.unit ?? "un",
        s.region ?? "",
        s.status ?? "",
      ]),
    ],
  );

  const exportPurchases = () => downloadCsv(
    `lista-compras-${projectId || "projeto"}.csv`,
    [
      ["Item", "Código / SKU", "Produto", "Material", "Fornecedor", "Quantidade", "Unidade", "Material R$", "Mão de obra R$", "Total R$"],
      ...budget.items.map((item) => [
        item.item,
        item.catalog_code ?? "",
        item.product_name ?? "",
        item.material_name ?? "",
        item.supplier_name ?? item.manufacturer_name ?? "",
        Number(item.quantity ?? 1),
        item.unit ?? "un",
        Number(item.material_value ?? 0),
        Number(item.labor_value ?? 0),
        Number(item.total ?? 0),
      ]),
    ],
  );

  if (!projectId) {
    return (
      <div className="h-full overflow-auto bg-slate-50 p-8">
        <EmptyState>Abra um projeto para gerar documentação real.</EmptyState>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Documentação do projeto</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">{projectTitle(project)}</h1>
            <p className="mt-1 text-sm text-slate-500">{clientName(project)} • dados vindos das especificações e do orçamento real</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ["memorial", "Memorial"],
              ["materiais", "Caderno de materiais"],
              ["compras", "Lista de compras"],
            ] as Array<[ViewId, string]>).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${view === id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-violet-50 hover:text-violet-700"}`}
              >
                {label}
              </button>
            ))}
            <button onClick={() => onNavigate?.("renders")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
              Voltar ao Render Studio
            </button>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-6">
        <section className="grid gap-4 md:grid-cols-4">
          {[
            ["Especificações", specs.length],
            ["Com material/produto", specifiedCount],
            ["Pendentes", pendingCount],
            ["Orçamento", money(budget.totals.grandTotal)],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
            </div>
          ))}
        </section>

        {loading && <div className="rounded-3xl bg-white p-8 text-sm text-slate-500">Carregando dados reais do projeto…</div>}
        {error && <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>}

        {!loading && !error && view === "memorial" && (
          <section className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Memorial descritivo</p>
              <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens especificados no projeto</h2>
              <p className="mt-1 text-sm text-slate-500">O memorial só mostra dados persistidos. Campos ausentes permanecem pendentes.</p>
            </div>
            {specs.length === 0 ? (
              <EmptyState>Nenhuma especificação foi criada ainda. Aprove uma versão do render e complete os materiais antes de emitir o memorial.</EmptyState>
            ) : (
              <div className="space-y-4">
                {specs.map((s, index) => (
                  <article key={s.id} className="rounded-3xl border border-slate-200 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Item {index + 1}</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-950">{s.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{s.category ?? "Categoria pendente"}{s.region ? ` • ${s.region}` : ""}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.material_name || s.product_name ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {s.material_name || s.product_name ? "Especificado" : "Pendente"}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <Info label="Código / SKU" value={textOrPending(s.catalog_code)} />
                      <Info label="Material" value={textOrPending(s.material_name)} />
                      <Info label="Produto" value={textOrPending(s.product_name)} />
                      <Info label="Fabricante" value={textOrPending(s.manufacturer_name)} />
                      <Info label="Fornecedor" value={textOrPending(s.supplier_name)} />
                      <Info label="Quantidade" value={`${Number(s.quantity ?? 1)} ${s.unit ?? "un"}`} />
                      <Info label="Material" value={money(s.material_value)} />
                      <Info label="Mão de obra" value={money(s.labor_value)} />
                      <Info label="Total" value={money(s.total_value)} />
                    </div>
                    {(s.description || s.notes) && <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{s.description || s.notes}</p>}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!loading && !error && view === "materiais" && (
          <section className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Caderno de materiais</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Materiais vinculados às especificações</h2>
              </div>
              <button onClick={exportMaterials} disabled={materialRows.length === 0} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Exportar CSV</button>
            </div>
            {materialRows.length === 0 ? (
              <EmptyState>Nenhum material ou produto está especificado ainda.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-3">Item</th><th className="p-3">Código / SKU</th><th className="p-3">Material / Produto</th><th className="p-3">Fabricante</th><th className="p-3">Fornecedor</th><th className="p-3">Qtd.</th><th className="p-3">Região</th></tr></thead>
                  <tbody>{materialRows.map((s) => <tr key={s.id} className="border-b border-slate-100"><td className="p-3 font-medium text-slate-900">{s.name}</td><td className="p-3 text-slate-600">{s.catalog_code ?? "—"}</td><td className="p-3 text-slate-600">{s.material_name ?? s.product_name ?? "Pendente"}</td><td className="p-3 text-slate-600">{s.manufacturer_name ?? "—"}</td><td className="p-3 text-slate-600">{s.supplier_name ?? "—"}</td><td className="p-3 text-slate-600">{Number(s.quantity ?? 1)} {s.unit ?? "un"}</td><td className="p-3 text-slate-600">{s.region ?? "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!loading && !error && view === "compras" && (
          <section className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Lista de compras</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Itens do orçamento real</h2>
              </div>
              <button onClick={exportPurchases} disabled={budget.items.length === 0} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Exportar CSV</button>
            </div>
            {budget.items.length === 0 ? (
              <EmptyState>Nenhum item foi enviado ao orçamento ainda.</EmptyState>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b text-xs uppercase text-slate-400"><th className="p-3">Item</th><th className="p-3">Código / SKU</th><th className="p-3">Produto / Material</th><th className="p-3">Fornecedor</th><th className="p-3">Qtd.</th><th className="p-3 text-right">Material</th><th className="p-3 text-right">Mão de obra</th><th className="p-3 text-right">Total</th></tr></thead>
                    <tbody>{budget.items.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="p-3 font-medium text-slate-900">{item.item}</td><td className="p-3 text-slate-600">{item.catalog_code ?? "—"}</td><td className="p-3 text-slate-600">{item.product_name ?? item.material_name ?? "—"}</td><td className="p-3 text-slate-600">{item.supplier_name ?? item.manufacturer_name ?? "—"}</td><td className="p-3 text-slate-600">{Number(item.quantity ?? 1)} {item.unit ?? "un"}</td><td className="p-3 text-right text-slate-600">{money(item.material_value)}</td><td className="p-3 text-right text-slate-600">{money(item.labor_value)}</td><td className="p-3 text-right font-semibold text-slate-900">{money(item.total)}</td></tr>)}</tbody>
                  </table>
                </div>
                <div className="mt-5 ml-auto max-w-sm space-y-2 rounded-3xl bg-slate-50 p-5 text-sm">
                  <TotalRow label="Materiais" value={money(budget.totals.subtotalMaterial)} />
                  <TotalRow label="Mão de obra" value={money(budget.totals.subtotalLabor)} />
                  <TotalRow label="Desconto" value={money(budget.totals.discountTotal)} />
                  <div className="border-t border-slate-200 pt-2"><TotalRow label="Total geral" value={money(budget.totals.grandTotal)} strong /></div>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-medium text-slate-800">{value}</p></div>;
}

function TotalRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-center justify-between ${strong ? "text-base font-bold text-slate-950" : "text-slate-600"}`}><span>{label}</span><span>{value}</span></div>;
}
