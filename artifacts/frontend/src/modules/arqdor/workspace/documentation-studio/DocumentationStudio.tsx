import React, { useEffect, useMemo, useState } from "react";

type DocumentationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type DocumentTab = "memorial" | "materials" | "shopping";

type ProjectDocuments = {
  generatedAt: string;
  project: {
    id: string;
    title: string;
    clientName: string | null;
    workType: string | null;
    areaM2: string | number | null;
    status: string | null;
  };
  sources: {
    specifications: number;
    renders: number;
    approvedRenders: number;
    budgetId: string | null;
  };
  memorial: {
    title: string;
    approvedRenderIds: string[];
    sections: Array<{
      id: string;
      ambienteId: string | null;
      category: string | null;
      region: string | null;
      title: string;
      description: string | null;
      material: string | null;
      product: string | null;
      manufacturer: string | null;
      supplier: string | null;
      quantity: number;
      unit: string;
      notes: string | null;
      sourceRenderId: string | null;
      status: string;
    }>;
  };
  materialsBook: {
    title: string;
    items: Array<{
      specObjectId: string;
      ambienteId: string | null;
      category: string | null;
      region: string | null;
      material: string | null;
      product: string | null;
      manufacturer: string | null;
      supplier: string | null;
      catalogMaterialId: string | null;
      catalogProductId: string | null;
      quantity: number;
      unit: string;
      materialValue: number;
      sourceRenderId: string | null;
    }>;
  };
  shoppingList: {
    title: string;
    items: Array<{
      specObjectId: string;
      description: string;
      category: string | null;
      supplier: string | null;
      manufacturer: string | null;
      quantity: number;
      unit: string;
      unitMaterialValue: number;
      laborValue: number;
      estimatedTotal: number;
      budgetStatus: "linked" | "pending";
    }>;
    summary: null | {
      budgetId: string;
      status: string;
      subtotalMaterial: number;
      subtotalLabor: number;
      discountValue: number;
      totalValue: number;
    };
  };
};

function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function projectId(project: any): string {
  return String(project?.id || project?.projectId || project?.projetoId || "");
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
      <p className="text-lg font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{children}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}

function MemorialView({ data }: { data: ProjectDocuments }) {
  if (data.memorial.sections.length === 0) {
    return (
      <EmptyState title="Memorial ainda sem itens reais">
        Aprove uma versão do render e complete as especificações. O memorial será montado automaticamente a partir dessas informações, sem texto fictício.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {data.memorial.sections.map((item, index) => (
        <article key={item.id} className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Item {index + 1}</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {[item.category, item.region].filter(Boolean).join(" • ") || "Sem classificação"}
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{item.status}</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Info label="Material" value={item.material || "—"} />
            <Info label="Produto" value={item.product || "—"} />
            <Info label="Fabricante" value={item.manufacturer || "—"} />
            <Info label="Quantidade" value={`${item.quantity} ${item.unit}`} />
          </div>

          {(item.description || item.notes) && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              {item.description && <p>{item.description}</p>}
              {item.notes && <p className="mt-2 text-slate-500">{item.notes}</p>}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function MaterialsView({ data }: { data: ProjectDocuments }) {
  if (data.materialsBook.items.length === 0) {
    return <EmptyState title="Caderno de materiais vazio">Nenhum material ou produto real está especificado no projeto ainda.</EmptyState>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.materialsBook.items.map((item) => (
        <article key={item.specObjectId} className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{item.category || "Material"}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{item.product || item.material || "Item especificado"}</h3>
          <p className="mt-1 text-sm text-slate-500">{item.region || "Região não informada"}</p>
          <div className="mt-4 space-y-2">
            <Info label="Material" value={item.material || "—"} />
            <Info label="Fabricante" value={item.manufacturer || "—"} />
            <Info label="Fornecedor" value={item.supplier || "—"} />
            <Info label="Quantidade" value={`${item.quantity} ${item.unit}`} />
            <Info label="Valor material" value={item.materialValue > 0 ? money(item.materialValue) : "A definir"} />
          </div>
        </article>
      ))}
    </div>
  );
}

function ShoppingView({ data }: { data: ProjectDocuments }) {
  const summary = data.shoppingList.summary;
  return (
    <div className="space-y-5">
      {summary && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Materiais" value={money(summary.subtotalMaterial)} />
          <Metric label="Mão de obra" value={money(summary.subtotalLabor)} />
          <Metric label="Desconto" value={money(summary.discountValue)} />
          <Metric label="Total" value={money(summary.totalValue)} />
        </section>
      )}

      {data.shoppingList.items.length === 0 ? (
        <EmptyState title="Lista de compras vazia">Complete as especificações do projeto para formar a lista automaticamente.</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">Item</th>
                  <th className="px-5 py-3">Fornecedor</th>
                  <th className="px-5 py-3">Quantidade</th>
                  <th className="px-5 py-3">Estimado</th>
                  <th className="px-5 py-3">Orçamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.shoppingList.items.map((item) => (
                  <tr key={item.specObjectId}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.category || "Sem categoria"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{item.supplier || item.manufacturer || "A definir"}</td>
                    <td className="px-5 py-4 text-slate-600">{item.quantity} {item.unit}</td>
                    <td className="px-5 py-4 font-semibold text-slate-900">{money(item.estimatedTotal)}</td>
                    <td className="px-5 py-4">
                      <span className={item.budgetStatus === "linked" ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"}>
                        {item.budgetStatus === "linked" ? "Vinculado" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentationStudio({ arqState, onNavigate }: DocumentationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const id = projectId(project);
  const [tab, setTab] = useState<DocumentTab>("memorial");
  const [data, setData] = useState<ProjectDocuments | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/arch/projects/${encodeURIComponent(id)}/documents`, {
      headers: authHeaders(),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
        setData(body as ProjectDocuments);
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err instanceof Error ? err.message : "Erro ao carregar documentação");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id]);

  if (!id) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50 p-6">
        <EmptyState title="Selecione um projeto">A documentação é sempre derivada do projeto ativo. Nenhum documento demonstrativo será exibido sem uma fonte real.</EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-50">
      <header className="border-b border-slate-100 bg-white px-6 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Documentação do projeto</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{data?.project.title || project?.titulo || project?.title || "Projeto ARQDOR"}</h1>
            <p className="mt-1 text-sm text-slate-500">Gerada das especificações, renders aprovados e orçamento reais.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setTab("memorial")} className={tab === "memorial" ? "rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" : "rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600"}>Memorial</button>
            <button type="button" onClick={() => setTab("materials")} className={tab === "materials" ? "rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" : "rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600"}>Caderno de materiais</button>
            <button type="button" onClick={() => setTab("shopping")} className={tab === "shopping" ? "rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" : "rounded-2xl bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600"}>Lista de compras</button>
            <button type="button" onClick={() => onNavigate?.("renders")} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Voltar ao Studio</button>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {loading && <div className="rounded-[28px] border border-slate-100 bg-white p-10 text-center text-sm text-slate-500">Carregando dados reais do projeto…</div>}
        {error && <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">{error}</div>}

        {!loading && !error && data && (
          <div className="space-y-5">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Especificações" value={data.sources.specifications} />
              <Metric label="Renders" value={data.sources.renders} />
              <Metric label="Renders aprovados" value={data.sources.approvedRenders} />
              <Metric label="Orçamento" value={data.sources.budgetId ? "Conectado" : "Pendente"} />
            </section>

            {tab === "memorial" && <MemorialView data={data} />}
            {tab === "materials" && <MaterialsView data={data} />}
            {tab === "shopping" && <ShoppingView data={data} />}

            <p className="pb-2 text-right text-xs text-slate-400">
              Atualizado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
