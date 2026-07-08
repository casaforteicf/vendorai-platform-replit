import React, { useMemo, useState } from "react";

type SpecificationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type SpecView = "overview" | "objetos" | "materiais" | "fornecedores" | "timeline" | "ia";
type SpecCategory = "todos" | "mobiliario" | "marcenaria" | "iluminacao" | "marmoraria" | "decoracao" | "revestimentos";

type SpecObject = {
  id: string;
  name: string;
  category: SpecCategory;
  environment: string;
  supplier: string;
  manufacturer: string;
  sku: string;
  material: string;
  finish: string;
  dimensions: string;
  price: string;
  deadline: string;
  status: "selecionado" | "especificado" | "orcado" | "comprado" | "produzido" | "entregue" | "instalado";
  compatibility: number;
  aiNote: string;
};

type Material = {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  collection: string;
  finish: string;
  price: string;
  leadTime: string;
  stock: string;
};

type Supplier = {
  id: string;
  name: string;
  category: string;
  score: number;
  deadline: string;
  city: string;
  status: "apto" | "revisar" | "indisponivel";
};

const categories: Array<{ id: SpecCategory; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "mobiliario", label: "Mobiliário" },
  { id: "marcenaria", label: "Marcenaria" },
  { id: "iluminacao", label: "Iluminação" },
  { id: "marmoraria", label: "Marmoraria" },
  { id: "decoracao", label: "Decoração" },
  { id: "revestimentos", label: "Revestimentos" },
];

const specObjects: SpecObject[] = [
  {
    id: "obj-poltrona-lisboa",
    name: "Poltrona Lisboa",
    category: "mobiliario",
    environment: "Sala de Estar",
    supplier: "Fornecedor local",
    manufacturer: "Estofados Casa",
    sku: "POL-LIS-001",
    material: "Linho Bege",
    finish: "Natural",
    dimensions: "82 x 78 x 74 cm",
    price: "R$ 3.850",
    deadline: "18 dias",
    status: "especificado",
    compatibility: 92,
    aiNote: "Manter modelo, revisar tecido para reduzir custo e melhorar durabilidade.",
  },
  {
    id: "obj-painel-tv",
    name: "Painel TV",
    category: "marcenaria",
    environment: "Sala de Estar",
    supplier: "Marceneiro Local",
    manufacturer: "Execução local",
    sku: "MAR-PNL-002",
    material: "MDF Carvalho Claro",
    finish: "Fosco",
    dimensions: "320 x 240 x 4 cm",
    price: "A cotar",
    deadline: "25 dias",
    status: "selecionado",
    compatibility: 88,
    aiNote: "Confirmar paginação do MDF e prever passagem para cabos e iluminação indireta.",
  },
  {
    id: "obj-bancada",
    name: "Bancada Gourmet",
    category: "marmoraria",
    environment: "Cozinha",
    supplier: "Marmoraria Local",
    manufacturer: "Execução local",
    sku: "MAR-BAN-003",
    material: "Quartzo Branco",
    finish: "Polido",
    dimensions: "280 x 90 x 2 cm",
    price: "A cotar",
    deadline: "20 dias",
    status: "orcado",
    compatibility: 90,
    aiNote: "Validar cuba, cooktop e espessura antes da produção.",
  },
  {
    id: "obj-perfil-led",
    name: "Perfil LED Linear",
    category: "iluminacao",
    environment: "Sala de Estar",
    supplier: "Luminárias Pro",
    manufacturer: "LED Line",
    sku: "LED-PER-004",
    material: "Alumínio",
    finish: "Preto Fosco",
    dimensions: "300 cm",
    price: "R$ 890",
    deadline: "7 dias",
    status: "especificado",
    compatibility: 96,
    aiNote: "Compatível com cena noturna e iluminação indireta proposta.",
  },
];

const materials: Material[] = [
  {
    id: "mat-linho-bege",
    name: "Linho Bege",
    category: "Tecido",
    manufacturer: "Tecidos Premium",
    collection: "Natural Living",
    finish: "Tramado",
    price: "R$ 168/m",
    leadTime: "5 dias",
    stock: "Disponível",
  },
  {
    id: "mat-carvalho",
    name: "MDF Carvalho Claro",
    category: "MDF",
    manufacturer: "Duratex",
    collection: "Essencial",
    finish: "Fosco",
    price: "R$ 420/chapa",
    leadTime: "10 dias",
    stock: "Sob consulta",
  },
  {
    id: "mat-quartzo",
    name: "Quartzo Branco",
    category: "Pedra",
    manufacturer: "Stone Premium",
    collection: "Classic",
    finish: "Polido",
    price: "R$ 1.350/m²",
    leadTime: "15 dias",
    stock: "Disponível",
  },
];

const suppliers: Supplier[] = [
  { id: "sup-marceneiro", name: "Marceneiro Local", category: "Marcenaria", score: 88, deadline: "25 dias", city: "Chapecó", status: "apto" },
  { id: "sup-marmoraria", name: "Marmoraria Local", category: "Marmoraria", score: 86, deadline: "20 dias", city: "Chapecó", status: "apto" },
  { id: "sup-luz", name: "Luminárias Pro", category: "Iluminação", score: 94, deadline: "7 dias", city: "Online", status: "apto" },
  { id: "sup-estofados", name: "Estofados Casa", category: "Mobiliário", score: 82, deadline: "18 dias", city: "Blumenau", status: "revisar" },
];

const timelineSteps = ["Selecionado", "Especificado", "Orçado", "Comprado", "Produzido", "Entregue", "Instalado"];

function getProjects(arqState: any): any[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getProject(arqState: any) {
  const projects = getProjects(arqState);
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function projectTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Projeto ARQDOR";
}

function clientName(project: any): string {
  return project?.clienteNome || project?.clientName || "Cliente";
}

function statusLabel(status: SpecObject["status"]) {
  const map: Record<SpecObject["status"], string> = {
    selecionado: "Selecionado",
    especificado: "Especificado",
    orcado: "Orçado",
    comprado: "Comprado",
    produzido: "Produzido",
    entregue: "Entregue",
    instalado: "Instalado",
  };
  return map[status];
}

function statusIndex(status: SpecObject["status"]) {
  return ["selecionado", "especificado", "orcado", "comprado", "produzido", "entregue", "instalado"].indexOf(status);
}

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
    { id: "objetos", label: "Objetos" },
    { id: "materiais", label: "Materiais" },
    { id: "fornecedores", label: "Fornecedores" },
    { id: "timeline", label: "Timeline" },
    { id: "ia", label: "IA" },
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

function Metric({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function ObjectCard({ object, selected, onSelect }: { object: SpecObject; selected?: boolean; onSelect: (object: SpecObject) => void }) {
  return (
    <button type="button" onClick={() => onSelect(object)} className="text-left">
      <article
        className={[
          "rounded-[30px] border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
          selected ? "border-violet-300 ring-4 ring-violet-100" : "border-slate-100",
        ].join(" ")}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">{object.name}</p>
            <p className="mt-1 text-sm text-slate-500">{object.environment} • {object.category}</p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
            {object.compatibility}%
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info label="Fornecedor" value={object.supplier} />
          <Info label="Preço" value={object.price} />
          <Info label="Prazo" value={object.deadline} />
          <Info label="Status" value={statusLabel(object.status)} />
        </div>

        <div className="mt-4 rounded-3xl bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{object.material}</p>
          <p className="mt-1 text-xs text-slate-500">{object.finish} • {object.dimensions}</p>
        </div>
      </article>
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function ObjectInspector({ object }: { object: SpecObject }) {
  return (
    <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objeto selecionado</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{object.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{object.manufacturer} • {object.sku}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Info label="Material" value={object.material} />
        <Info label="Acabamento" value={object.finish} />
        <Info label="Medidas" value={object.dimensions} />
        <Info label="Compatível" value={`${object.compatibility}%`} />
        <Info label="Preço" value={object.price} />
        <Info label="Prazo" value={object.deadline} />
      </div>

      <div className="mt-5 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Recomendação IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{object.aiNote}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
          Manual PDF
        </button>
        <button type="button" className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
          Modelo 3D
        </button>
        <button type="button" className="rounded-2xl bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
          Orçar
        </button>
        <button type="button" className="rounded-2xl bg-slate-950 px-3 py-3 text-xs font-semibold text-white hover:bg-violet-700">
          Produzir
        </button>
      </div>
    </aside>
  );
}

function Overview({ selectedObject, onSelect }: { selectedObject: SpecObject; onSelect: (object: SpecObject) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <main className="space-y-5">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Objetos" value={String(specObjects.length)} description="Itens identificados no projeto." />
          <Metric label="Materiais" value={String(materials.length)} description="Materiais associados à especificação." />
          <Metric label="Fornecedores" value={String(suppliers.length)} description="Base inicial de fornecedores." />
          <Metric label="Pendências" value="3" description="Itens que precisam de validação." />
        </section>

        <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objetos do render</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Base inteligente de especificação</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
            {specObjects.map((object) => (
              <ObjectCard key={object.id} object={object} selected={selectedObject.id === object.id} onSelect={onSelect} />
            ))}
          </div>
        </section>
      </main>

      <ObjectInspector object={selectedObject} />
    </div>
  );
}

function ObjectsView({ category, setCategory, selectedObject, onSelect }: { category: SpecCategory; setCategory: (category: SpecCategory) => void; selectedObject: SpecObject; onSelect: (object: SpecObject) => void }) {
  const filtered = category === "todos" ? specObjects : specObjects.filter((object) => object.category === category);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Especificações</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Objetos inteligentes</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCategory(item.id)}
                className={[
                  "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                  category === item.id ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                ].join(" ")}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {filtered.map((object) => (
            <ObjectCard key={object.id} object={object} selected={selectedObject.id === object.id} onSelect={onSelect} />
          ))}
        </div>
      </section>

      <ObjectInspector object={selectedObject} />
    </div>
  );
}

function MaterialsView() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Materiais</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Biblioteca técnica</h2>

      <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Material</th>
              <th className="px-4 py-3">Fabricante</th>
              <th className="px-4 py-3">Coleção</th>
              <th className="px-4 py-3">Acabamento</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Prazo</th>
              <th className="px-4 py-3">Estoque</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materials.map((material) => (
              <tr key={material.id}>
                <td className="px-4 py-4 font-medium text-slate-800">{material.name}</td>
                <td className="px-4 py-4 text-slate-500">{material.manufacturer}</td>
                <td className="px-4 py-4 text-slate-500">{material.collection}</td>
                <td className="px-4 py-4 text-slate-500">{material.finish}</td>
                <td className="px-4 py-4 text-slate-500">{material.price}</td>
                <td className="px-4 py-4 text-slate-500">{material.leadTime}</td>
                <td className="px-4 py-4 text-slate-500">{material.stock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SuppliersView() {
  const statusClass: Record<Supplier["status"], string> = {
    apto: "bg-emerald-50 text-emerald-700",
    revisar: "bg-amber-50 text-amber-700",
    indisponivel: "bg-rose-50 text-rose-700",
  };

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fornecedores</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">Base de execução</h2>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {suppliers.map((supplier) => (
          <article key={supplier.id} className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">{supplier.name}</p>
                <p className="mt-1 text-sm text-slate-500">{supplier.category} • {supplier.city}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[supplier.status]}`}>
                {supplier.status}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Info label="Score" value={`${supplier.score}%`} />
              <Info label="Prazo" value={supplier.deadline} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TimelineView({ selectedObject }: { selectedObject: SpecObject }) {
  const index = statusIndex(selectedObject.status);

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Timeline executiva</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-950">{selectedObject.name}</h2>

      <div className="mt-8 grid gap-4 md:grid-cols-7">
        {timelineSteps.map((step, stepIndex) => (
          <div key={step} className="text-center">
            <div className={["mx-auto flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold", stepIndex <= index ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-400"].join(" ")}>
              {stepIndex + 1}
            </div>
            <p className={["mt-3 text-sm font-semibold", stepIndex <= index ? "text-slate-900" : "text-slate-400"].join(" ")}>{step}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function AIView({ selectedObject }: { selectedObject: SpecObject }) {
  const recommendations = [
    "Solicitar orçamento formal para o fornecedor selecionado.",
    "Validar prazo antes de apresentar ao cliente.",
    "Checar alternativa de material para reduzir custo.",
    "Conectar item ao pacote de produção.",
  ];

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_390px]">
      <section className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Specification</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-950">Recomendações inteligentes</h2>

        <div className="mt-5 space-y-3">
          {recommendations.map((recommendation) => (
            <div key={recommendation} className="rounded-3xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{recommendation}</p>
            </div>
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
  selectedObject,
  setSelectedObject,
}: {
  view: SpecView;
  category: SpecCategory;
  setCategory: (category: SpecCategory) => void;
  selectedObject: SpecObject;
  setSelectedObject: (object: SpecObject) => void;
}) {
  if (view === "objetos") return <ObjectsView category={category} setCategory={setCategory} selectedObject={selectedObject} onSelect={setSelectedObject} />;
  if (view === "materiais") return <MaterialsView />;
  if (view === "fornecedores") return <SuppliersView />;
  if (view === "timeline") return <TimelineView selectedObject={selectedObject} />;
  if (view === "ia") return <AIView selectedObject={selectedObject} />;
  return <Overview selectedObject={selectedObject} onSelect={setSelectedObject} />;
}

export default function SpecificationStudio({ arqState, onNavigate }: SpecificationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [view, setView] = useState<SpecView>("overview");
  const [category, setCategory] = useState<SpecCategory>("todos");
  const [selectedObject, setSelectedObject] = useState<SpecObject>(specObjects[0]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />

        <Content
          view={view}
          category={category}
          setCategory={setCategory}
          selectedObject={selectedObject}
          setSelectedObject={setSelectedObject}
        />
      </div>
    </div>
  );
}
