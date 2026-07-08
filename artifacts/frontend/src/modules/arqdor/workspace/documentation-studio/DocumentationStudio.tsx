import React, { useMemo, useState } from "react";

type DocumentationStudioProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type DisciplineId =
  | "geral"
  | "arquitetura"
  | "interiores"
  | "marcenaria"
  | "gesso"
  | "iluminacao"
  | "eletrica"
  | "hidraulica"
  | "marmoraria"
  | "pintura"
  | "paisagismo"
  | "esquadrias";

type ViewId = "visao" | "plantas" | "memorial" | "quantitativos" | "revisoes" | "impressao";

type DocItem = {
  id: string;
  title: string;
  type: string;
  status: "gerado" | "pendente" | "revisao" | "aprovado";
  source: string;
};

const disciplines: Array<{ id: DisciplineId; label: string; description: string }> = [
  { id: "geral", label: "Geral", description: "Resumo técnico, índice e controle geral." },
  { id: "arquitetura", label: "Arquitetura", description: "Plantas, cortes, fachadas e implantação." },
  { id: "interiores", label: "Interiores", description: "Ambientes, conceito, materiais e mobiliário." },
  { id: "marcenaria", label: "Marcenaria", description: "Módulos, ferragens, vistas e detalhamento." },
  { id: "gesso", label: "Gesso", description: "Forros, sancas, cortineiros e rasgos." },
  { id: "iluminacao", label: "Iluminação", description: "Luminárias, cenas, circuitos e temperatura." },
  { id: "eletrica", label: "Elétrica", description: "Tomadas, interruptores, pontos e circuitos." },
  { id: "hidraulica", label: "Hidráulica", description: "Pontos, louças, metais e observações técnicas." },
  { id: "marmoraria", label: "Marmoraria", description: "Bancadas, soleiras, peitoris e cubas." },
  { id: "pintura", label: "Pintura", description: "Tintas, massas, áreas e acabamentos." },
  { id: "paisagismo", label: "Paisagismo", description: "Espécies, vasos, pedras e iluminação externa." },
  { id: "esquadrias", label: "Esquadrias", description: "Portas, janelas, vidros e persianas." },
];

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

function buildItems(discipline: DisciplineId): DocItem[] {
  if (discipline === "geral") {
    return [
      { id: "capa", title: "Capa do projeto", type: "Memorial", status: "gerado", source: "Projeto" },
      { id: "indice", title: "Índice de cadernos", type: "Índice", status: "gerado", source: "Automático" },
      { id: "revisoes", title: "Controle de revisões", type: "Revisão", status: "pendente", source: "Workspace" },
      { id: "resumo", title: "Resumo executivo", type: "Relatório", status: "revisao", source: "IA" },
    ];
  }

  return [
    { id: `${discipline}-planta`, title: "Planta técnica", type: "Planta", status: "pendente", source: "Render + Projeto" },
    { id: `${discipline}-vista-frontal`, title: "Vista frontal", type: "Vista", status: "pendente", source: "Render" },
    { id: `${discipline}-vista-lateral`, title: "Vista lateral", type: "Vista", status: "pendente", source: "Render" },
    { id: `${discipline}-memorial`, title: "Memorial descritivo", type: "Memorial", status: "revisao", source: "IA" },
    { id: `${discipline}-quantitativos`, title: "Quantitativos", type: "Tabela", status: "pendente", source: "Objetos" },
  ];
}

const statusClass: Record<DocItem["status"], string> = {
  gerado: "bg-blue-50 text-blue-700",
  pendente: "bg-amber-50 text-amber-700",
  revisao: "bg-violet-50 text-violet-700",
  aprovado: "bg-emerald-50 text-emerald-700",
};

const statusLabel: Record<DocItem["status"], string> = {
  gerado: "Gerado",
  pendente: "Pendente",
  revisao: "Revisão",
  aprovado: "Aprovado",
};

function Sidebar({
  active,
  setActive,
}: {
  active: DisciplineId;
  setActive: (id: DisciplineId) => void;
}) {
  return (
    <aside className="flex h-full flex-col border-r border-slate-100 bg-white p-5">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Cadernos</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-950">Disciplinas</h3>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {disciplines.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActive(item.id)}
            className={[
              "w-full rounded-2xl px-4 py-3 text-left transition",
              active === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            <p className="text-sm font-semibold">{item.label}</p>
            <p className={["mt-1 line-clamp-2 text-xs", active === item.id ? "text-slate-300" : "text-slate-400"].join(" ")}>
              {item.description}
            </p>
          </button>
        ))}
      </div>
    </aside>
  );
}

function Header({
  project,
  view,
  setView,
  onNavigate,
}: {
  project: any;
  view: ViewId;
  setView: (view: ViewId) => void;
  onNavigate?: (module: string) => void;
}) {
  const views: Array<{ id: ViewId; label: string }> = [
    { id: "visao", label: "Visão" },
    { id: "plantas", label: "Plantas" },
    { id: "memorial", label: "Memorial" },
    { id: "quantitativos", label: "Quantitativos" },
    { id: "revisoes", label: "Revisões" },
    { id: "impressao", label: "Impressão" },
  ];

  return (
    <header className="border-b border-slate-100 bg-white px-6 py-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Documentation Studio Enterprise</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{projectTitle(project)}</h1>
          <p className="mt-1 text-sm text-slate-500">{clientName(project)} • Documentação técnica conectada ao render</p>
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

function DocumentCard({ item }: { item: DocItem }) {
  return (
    <article className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-950">{item.title}</p>
          <p className="mt-1 text-sm text-slate-500">{item.type} • {item.source}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass[item.status]}`}>
          {statusLabel[item.status]}
        </span>
      </div>

      <div className="mt-5 flex h-40 items-center justify-center rounded-3xl bg-slate-50 text-sm text-slate-400">
        Prévia técnica
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700" type="button">
          Abrir
        </button>
        <button className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700" type="button">
          Gerar IA
        </button>
      </div>
    </article>
  );
}

function Overview({ discipline }: { discipline: DisciplineId }) {
  const items = buildItems(discipline);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Documentos" value={String(items.length)} />
        <Metric label="Gerados" value={String(items.filter((i) => i.status === "gerado").length)} />
        <Metric label="Pendentes" value={String(items.filter((i) => i.status === "pendente").length)} />
        <Metric label="Revisão" value={String(items.filter((i) => i.status === "revisao").length)} />
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <DocumentCard key={item.id} item={item} />
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function TechnicalPreview({ discipline }: { discipline: DisciplineId }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="flex min-h-[620px] items-center justify-center rounded-[34px] border border-slate-100 bg-white p-8 shadow-sm">
        <div className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-slate-50 p-8">
          <div className="aspect-[1.45] rounded-2xl border border-dashed border-slate-300 bg-white p-8">
            <div className="flex h-full items-center justify-center rounded-xl border-2 border-slate-300 text-center">
              <div>
                <p className="text-2xl font-semibold text-slate-700">Planta / Vista Técnica</p>
                <p className="mt-2 text-sm text-slate-500">Disciplina: {discipline}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Camadas técnicas</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Controle visual</h3>

        <div className="mt-5 space-y-2">
          {["Planta baixa", "Vistas", "Medidas", "Objetos", "Materiais", "Observações", "Quantitativos"].map((item) => (
            <label key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              {item}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Memorial({ discipline }: { discipline: DisciplineId }) {
  const [text, setText] = useState(
    `Memorial técnico — ${discipline}\n\nDescrever materiais, medidas, acabamentos, critérios de execução, observações de obra e requisitos de aprovação.`
  );

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Memorial inteligente</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Editor assistido por IA</h3>
          </div>
          <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
            Gerar com IA
          </button>
        </div>

        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-[620px] w-full resize-none rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
        />
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Checklist IA</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Itens obrigatórios</h3>

        <div className="mt-5 space-y-2">
          {["Materiais", "Medidas", "Acabamentos", "Fornecedores", "Execução", "Revisão", "Aprovação"].map((item) => (
            <label key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
              {item}
            </label>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Quantities({ discipline }: { discipline: DisciplineId }) {
  const rows = [
    ["Material principal", "m²", "0,00", "Render/Objeto"],
    ["Acabamento linear", "m", "0,00", "Planta"],
    ["Peças / módulos", "un", "0", "Biblioteca"],
    ["Mão de obra", "vb", "1", "Produção"],
  ];

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Quantitativos</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{discipline}</h3>
        </div>
        <button type="button" className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
          Recalcular IA
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-100">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3">Qtd.</th>
              <th className="px-4 py-3">Origem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row[0]}>
                <td className="px-4 py-4 font-medium text-slate-800">{row[0]}</td>
                <td className="px-4 py-4 text-slate-500">{row[1]}</td>
                <td className="px-4 py-4 text-slate-500">{row[2]}</td>
                <td className="px-4 py-4 text-slate-500">{row[3]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Revisions() {
  const items = [
    ["R00", "Base criada", "Sistema"],
    ["R01", "Memorial revisado", "IA"],
    ["R02", "Aguardando aprovação técnica", "Arquiteto"],
  ];

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Controle de revisões</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Histórico técnico</h3>

      <div className="mt-5 space-y-4">
        {items.map(([rev, title, author], index) => (
          <div key={rev} className="flex gap-4">
            <div className="flex flex-col items-center">
              <span className="h-3 w-3 rounded-full bg-violet-600" />
              {index < items.length - 1 ? <span className="mt-2 h-full min-h-[42px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-950">{rev} — {title}</p>
              <p className="mt-1 text-xs text-slate-500">{author}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PrintPanel({ discipline }: { discipline: DisciplineId }) {
  const items = buildItems(discipline);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Impressão</p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">Selecionar documentos</h3>

        <div className="mt-5 space-y-2">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              {item.title}
            </label>
          ))}
        </div>
      </section>

      <aside className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Saídas</p>
        <div className="mt-5 space-y-3">
          {["Gerar PDF técnico", "Enviar ao cliente", "Salvar no projeto", "Anexar à proposta"].map((item) => (
            <button key={item} type="button" className="w-full rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
              {item}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Content({ view, discipline }: { view: ViewId; discipline: DisciplineId }) {
  if (view === "plantas") return <TechnicalPreview discipline={discipline} />;
  if (view === "memorial") return <Memorial discipline={discipline} />;
  if (view === "quantitativos") return <Quantities discipline={discipline} />;
  if (view === "revisoes") return <Revisions />;
  if (view === "impressao") return <PrintPanel discipline={discipline} />;
  return <Overview discipline={discipline} />;
}

export default function DocumentationStudio({ arqState, onNavigate }: DocumentationStudioProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const [discipline, setDiscipline] = useState<DisciplineId>("geral");
  const [view, setView] = useState<ViewId>("visao");

  return (
    <div className="min-h-screen bg-[#f7f7f8] p-6 text-slate-950">
      <div className="mx-auto flex min-h-[820px] max-w-[1760px] overflow-hidden rounded-[38px] border border-slate-100 bg-white shadow-sm">
        <div className="w-[330px] shrink-0">
          <Sidebar active={discipline} setActive={setDiscipline} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <Header project={project} view={view} setView={setView} onNavigate={onNavigate} />
          <main className="min-h-0 flex-1 overflow-y-auto bg-[#f7f7f8] p-6">
            <Content view={view} discipline={discipline} />
          </main>
        </div>
      </div>
    </div>
  );
}
