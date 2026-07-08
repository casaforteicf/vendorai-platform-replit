import React, { useMemo, useState } from "react";
import { AIRecommendationPanel } from "./AIRecommendationPanel";
import { ApprovalPanel } from "./ApprovalPanel";
import { ManufacturerLibrary } from "./ManufacturerLibrary";
import { MaterialLibrary } from "./MaterialLibrary";
import { MetricCard } from "./MetricCard";
import { ObjectCard } from "./ObjectCard";
import { ObjectInspector } from "./ObjectInspector";
import { ProductCatalog } from "./ProductCatalog";
import { ProductFilters } from "./ProductFilters";
import { SearchBar } from "./SearchBar";
import { SpecificationTimeline } from "./SpecificationTimeline";
import { SupplierComparison } from "./SupplierComparison";
import { specObjects } from "./specificationData";
import type { SpecCategory, SpecObject, SpecView } from "./specificationTypes";
import { clientName, getProject, projectTitle } from "./specificationUtils";

type SpecificationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

function Header({
  project,
  view,
  setView,
  onNavigate,
}: {
  project: any;
  view: SpecView;
  setView: (view: SpecView) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: SpecView; label: string }> = [
    { id: "overview", label: "Visão" },
    { id: "objects", label: "Objetos" },
    { id: "catalog", label: "Catálogo" },
    { id: "materials", label: "Materiais" },
    { id: "manufacturers", label: "Fabricantes" },
    { id: "suppliers", label: "Fornecedores" },
    { id: "timeline", label: "Timeline" },
    { id: "approval", label: "Aprovação" },
    { id: "ai", label: "IA" },
  ];

  return (
    <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Specification Studio Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{projectTitle(project)}</h1>
          <p className="mt-1 text-sm text-slate-500">{clientName(project)} • Render → Objetos → Materiais → Fornecedores → Produção</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={[
                "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                view === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onNavigate?.("renders")}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-violet-200 hover:text-violet-700"
          >
            Voltar ao Studio
          </button>
        </div>
      </div>
    </header>
  );
}

function Overview({ selectedObject, setSelectedObject }: { selectedObject: SpecObject; setSelectedObject: (object: SpecObject) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <main className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Objetos" value={String(specObjects.length)} description="Itens identificados no projeto." />
          <MetricCard label="Especificados" value={String(specObjects.filter((item) => item.status !== "selecionado").length)} description="Itens com dados técnicos." />
          <MetricCard label="Orçados" value={String(specObjects.filter((item) => item.status === "orcado").length)} description="Itens com preço/prazo." />
          <MetricCard label="Pendências" value="3" description="Itens que precisam validação." />
        </section>

        <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objetos do render</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Base inteligente de especificação</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {specObjects.map((object) => (
              <ObjectCard key={object.id} object={object} selected={selectedObject.id === object.id} onSelect={setSelectedObject} />
            ))}
          </div>
        </section>
      </main>

      <ObjectInspector object={selectedObject} />
    </div>
  );
}

function ObjectsView({
  category,
  setCategory,
  query,
  setQuery,
  selectedObject,
  setSelectedObject,
}: {
  category: SpecCategory;
  setCategory: (category: SpecCategory) => void;
  query: string;
  setQuery: (query: string) => void;
  selectedObject: SpecObject;
  setSelectedObject: (object: SpecObject) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return specObjects.filter((object) => {
      const matchesCategory = category === "todos" || object.category === category;
      const matchesQuery =
        !q ||
        object.name.toLowerCase().includes(q) ||
        object.manufacturer.toLowerCase().includes(q) ||
        object.supplier.toLowerCase().includes(q) ||
        object.material.toLowerCase().includes(q);

      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Especificações</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Objetos inteligentes</h2>
          </div>
          <div className="w-full xl:w-[360px]">
            <SearchBar value={query} onChange={setQuery} placeholder="Buscar objeto, material, fornecedor..." />
          </div>
        </div>

        <div className="mb-5">
          <ProductFilters category={category} setCategory={setCategory} />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((object) => (
            <ObjectCard key={object.id} object={object} selected={selectedObject.id === object.id} onSelect={setSelectedObject} />
          ))}
        </div>
      </section>

      <ObjectInspector object={selectedObject} />
    </div>
  );
}

function Content({
  view,
  category,
  setCategory,
  query,
  setQuery,
  selectedObject,
  setSelectedObject,
}: {
  view: SpecView;
  category: SpecCategory;
  setCategory: (category: SpecCategory) => void;
  query: string;
  setQuery: (query: string) => void;
  selectedObject: SpecObject;
  setSelectedObject: (object: SpecObject) => void;
}) {
  if (view === "objects") return <ObjectsView category={category} setCategory={setCategory} query={query} setQuery={setQuery} selectedObject={selectedObject} setSelectedObject={setSelectedObject} />;
  if (view === "catalog") return <ProductCatalog />;
  if (view === "materials") return <MaterialLibrary />;
  if (view === "manufacturers") return <ManufacturerLibrary />;
  if (view === "suppliers") return <SupplierComparison />;
  if (view === "timeline") return <SpecificationTimeline selectedObject={selectedObject} />;
  if (view === "approval") return <ApprovalPanel selectedObject={selectedObject} />;
  if (view === "ai") return <AIRecommendationPanel selectedObject={selectedObject} />;
  return <Overview selectedObject={selectedObject} setSelectedObject={setSelectedObject} />;
}

export default function SpecificationStudio({ arqState, onNavigate }: SpecificationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<SpecView>("overview");
  const [category, setCategory] = useState<SpecCategory>("todos");
  const [query, setQuery] = useState("");
  const [selectedObject, setSelectedObject] = useState<SpecObject>(specObjects[0]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />

        <Content
          view={view}
          category={category}
          setCategory={setCategory}
          query={query}
          setQuery={setQuery}
          selectedObject={selectedObject}
          setSelectedObject={setSelectedObject}
        />
      </div>
    </div>
  );
}
