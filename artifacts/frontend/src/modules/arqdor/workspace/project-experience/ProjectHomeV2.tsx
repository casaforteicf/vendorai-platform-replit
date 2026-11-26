import React, { useMemo, useState } from "react";

type ArqProject = {
  id?: string;
  titulo?: string;
  title?: string;
  name?: string;
  clienteNome?: string | null;
  clientName?: string;
  status?: string | null;
  tipoObra?: string | null;
  areaM2?: number | string | null;
  orcamentoTotal?: number | string | null;
  totalAmbientes?: number;
  totalRenders?: number;
  ambientes?: unknown[];
  renders?: unknown[];
  updatedAt?: string;
  updated_at?: string;
  coverImageUrl?: string;
  capaUrl?: string;
  imageUrl?: string;
  progress?: number;
  project_progress?: number;
};

type ArqStateLike = {
  projects?: ArqProject[];
  projetos?: ArqProject[];
  allProjects?: ArqProject[];
  currentProject?: ArqProject | null;
  selectedProject?: ArqProject | null;
  project?: ArqProject | null;
};

type ProjectHomeV2Props = {
  arqState: ArqStateLike;
  onNavigate?: (module: string) => void;
};

type LifecycleItem = {
  id: string;
  icon: string;
  label: string;
  description: string;
  module: string;
  group: "projeto" | "obra" | "cliente";
  badge?: string;
};

const LIFECYCLE: LifecycleItem[] = [
  { id: "project", icon: "🏗️", label: "Projeto", description: "Crie ou importe o pré-projeto. A especificação técnica não é obrigatória para concluir esta etapa.", module: "projeto", group: "projeto" },
  { id: "render", icon: "✨", label: "Visualizar & Renderizar", description: "Gere fachadas, ambientes e renders sem bloquear a conclusão do projeto.", module: "renders", group: "projeto" },
  { id: "specify", icon: "📋", label: "Especificar", description: "Opcional. Defina sistemas, materiais, tecnologias e acabamentos quando quiser aprofundar o projeto.", module: "real-specification", group: "projeto", badge: "OPCIONAL" },
  { id: "quantity", icon: "📐", label: "Quantificar", description: "Gere quantitativos geométricos imediatamente e aprofunde-os quando houver especificações técnicas.", module: "real-budget", group: "projeto" },
  { id: "budget", icon: "💰", label: "Orçar", description: "Crie orçamento preliminar pela geometria ou orçamento detalhado usando sistemas e composições.", module: "real-budget", group: "obra", badge: "REAL" },
  { id: "marketplace", icon: "🤝", label: "Contratar / Cotar", description: "Envie o projeto ou pacotes para arquitetos, engenheiros, construtoras, empreiteiros e fornecedores dentro do sistema.", module: "compras", group: "obra", badge: "REDE" },
  { id: "purchases", icon: "🛒", label: "Compras & Cotações", description: "Compare retornos de materiais, serviços, esquadrias, móveis e demais fornecedores.", module: "compras", group: "obra" },
  { id: "execution", icon: "⚙️", label: "Enviar para Execução", description: "Transforme o que foi contratado em atividades, medições, consumo, custo e produtividade.", module: "execution", group: "obra" },

  { id: "approval", icon: "✅", label: "Aprovações do Cliente", description: "Compartilhe proposta, materiais, versões e decisões com rastreabilidade.", module: "client-portal-approval", group: "cliente" },
  { id: "post-sale", icon: "🔑", label: "Entrega & Pós-obra", description: "Entrega, documentação final, satisfação, garantias e pós-venda.", module: "post-sale", group: "cliente" },
];

const STATUS_LABEL: Record<string, string> = {
  briefing: "Briefing",
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

function getProjects(arqState: ArqStateLike): ArqProject[] {
  const projects = arqState.projects || arqState.projetos || arqState.allProjects || [];
  return Array.isArray(projects) ? projects : [];
}

function getActiveProject(arqState: ArqStateLike, projects: ArqProject[]): ArqProject | null {
  return arqState.currentProject || arqState.selectedProject || arqState.project || projects[0] || null;
}

function title(project?: ArqProject | null) {
  return String(project?.titulo || project?.title || project?.name || "Nenhum projeto selecionado");
}

function client(project?: ArqProject | null) {
  return String(project?.clienteNome || project?.clientName || "Cliente não informado");
}

function cover(project?: ArqProject | null) {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function area(project?: ArqProject | null) {
  if (!project?.areaM2) return "—";
  const value = Number(project.areaM2);
  return Number.isNaN(value) ? String(project.areaM2) : `${value.toLocaleString("pt-BR")} m²`;
}

function money(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function progress(project?: ArqProject | null) {
  if (!project) return 0;
  const explicit = project.project_progress ?? project.progress;
  if (explicit !== undefined && explicit !== null && !Number.isNaN(Number(explicit))) {
    return Math.max(0, Math.min(100, Number(explicit)));
  }
  const status = String(project.status || "briefing");
  const byStatus: Record<string, number> = {
    briefing: 15,
    orcamento: 35,
    aprovado: 55,
    em_execucao: 75,
    entregue: 100,
    cancelado: 0,
  };
  let value = byStatus[status] ?? 20;
  if (project.totalAmbientes || project.ambientes?.length) value += 8;
  if (project.totalRenders || project.renders?.length) value += 10;
  return Math.max(0, Math.min(100, value));
}

function status(project?: ArqProject | null) {
  const value = String(project?.status || "briefing");
  return STATUS_LABEL[value] || value;
}

function ModuleCard({ item, onNavigate }: { item: LifecycleItem; onNavigate?: (module: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(item.module)}
      className="group flex min-h-[160px] flex-col justify-between rounded-[26px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-2xl" aria-hidden="true">{item.icon}</span>
          {item.badge ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-violet-700">{item.badge}</span>
          ) : null}
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-950">{item.label}</h3>
        <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
      </div>
      <span className="mt-4 text-xs font-semibold text-violet-700 transition group-hover:translate-x-0.5">Abrir →</span>
    </button>
  );
}

function Group({ title: groupTitle, subtitle, items, onNavigate }: { title: string; subtitle: string; items: LifecycleItem[]; onNavigate?: (module: string) => void }) {
  return (
    <section className="rounded-[32px] border border-slate-100 bg-slate-50/70 p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-slate-950">{groupTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => <ModuleCard key={item.id} item={item} onNavigate={onNavigate} />)}
      </div>
    </section>
  );
}

function ProjectCard({ project, onOpen }: { project: ArqProject; onOpen: () => void }) {
  const pct = progress(project);
  return (
    <button type="button" onClick={onOpen} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="h-32 bg-slate-950">
        {cover(project) ? <img src={cover(project)} alt={title(project)} className="h-full w-full object-cover opacity-90" /> : <div className="flex h-full items-center justify-center text-2xl font-semibold text-white/15">ARQDOR</div>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{title(project)}</h3>
            <p className="mt-1 truncate text-xs text-slate-500">{client(project)}</p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{status(project)}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${pct}%` }} /></div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400"><span>{area(project)}</span><span>{Math.round(pct)}%</span></div>
      </div>
    </button>
  );
}

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "andamento", label: "Em andamento" },
  { key: "planejamento", label: "Planejamento" },
  { key: "proposta", label: "Proposta" },
  { key: "concluido", label: "Concluído" },
  { key: "arquivado", label: "Arquivado" },
] as const;

function projectStage(project: ArqProject): string {
  const raw = String(project.status || "briefing").toLowerCase();
  if (["entregue", "concluido", "concluído", "finalizado"].includes(raw)) return "concluido";
  if (["arquivado", "cancelado"].includes(raw)) return "arquivado";
  if (["orcamento", "proposta", "aprovado"].includes(raw)) return "proposta";
  if (["briefing", "planejamento", "rascunho"].includes(raw)) return "planejamento";
  return "andamento";
}

const STAGE_LABELS: Record<string, string> = {
  andamento: "Em andamento", planejamento: "Planejamento", proposta: "Proposta",
  concluido: "Concluído", arquivado: "Arquivado",
};
const STAGE_COLORS: Record<string, string> = {
  andamento: "#08ae81", planejamento: "#1585f4", proposta: "#f5b30a",
  concluido: "#009d72", arquivado: "#64748b",
};

export default function ProjectHomeV2({ arqState, onNavigate }: ProjectHomeV2Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todos");
  const [order, setOrder] = useState("recentes");
  const projects = useMemo(() => getProjects(arqState), [arqState]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matches = projects.filter((p) =>
      (filter === "todos" || projectStage(p) === filter) &&
      [title(p), client(p), String(p.status || "")].some((text) => text.toLowerCase().includes(q))
    );
    return [...matches].sort((a, b) => {
      if (order === "nome") return title(a).localeCompare(title(b), "pt-BR");
      const da = new Date(a.updatedAt || a.updated_at || 0).getTime() || 0;
      const db = new Date(b.updatedAt || b.updated_at || 0).getTime() || 0;
      return db - da;
    });
  }, [projects, filter, search, order]);
  const count = (key: string) => key === "todos" ? projects.length : projects.filter((p) => projectStage(p) === key).length;
  const openProject = () => onNavigate?.("projeto");
  const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-medium transition hover:border-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500";
  const recent = [...projects].sort((a, b) =>
    (new Date(b.updatedAt || b.updated_at || 0).getTime() || 0) -
    (new Date(a.updatedAt || a.updated_at || 0).getTime() || 0)
  ).slice(0, 3);

  return (
    <div className="min-h-full w-full overflow-x-hidden bg-[#f6f8f8] text-slate-950">
      <div className="mx-auto w-full max-w-[1800px] px-3 py-5 sm:px-5 lg:px-7">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
            <p className="text-sm text-slate-500">Gerencie seus projetos de arquitetura e interiores</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={openProject} className="inline-flex min-h-11 items-center gap-3 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-800 px-5 font-semibold text-white">＋ Novo projeto</button>
            <button type="button" onClick={openProject} className={actionClass + " bg-white"}>⇧ Importar</button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar projetos">
            {FILTERS.map(({key, label}) => (
              <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
                className={"shrink-0 rounded-lg px-3 py-2 text-xs font-medium sm:text-sm " + (filter === key ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800 hover:bg-slate-200")}>
                {label} <span className="ml-1 rounded-full bg-black/5 px-1.5">{count(key)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="arqdor-project-search" className="sr-only">Buscar projetos</label>
            <input id="arqdor-project-search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar projetos ou clientes…" className="min-h-10 w-44 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm sm:w-56" />
            <label htmlFor="arqdor-project-order" className="sr-only">Ordenação</label>
            <select id="arqdor-project-order" value={order} onChange={(e) => setOrder(e.target.value)}
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
              <option value="recentes">Mais recentes</option><option value="nome">Nome A–Z</option>
            </select>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_292px]">
          <main className="min-w-0">
            {filtered.length ? (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {filtered.map((project) => {
                  const stage = projectStage(project);
                  const pct = progress(project);
                  return (
                    <button type="button" key={String(project.id || title(project))} onClick={openProject}
                      className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                      <div className="relative h-36 bg-[#063a32] sm:h-40">
                        {cover(project) ? <img src={cover(project)} alt="" className="h-full w-full object-cover" /> :
                          <div className="flex h-full items-center justify-center text-2xl font-bold text-white/60">ARQDOR</div>}
                        <span className="absolute left-3 top-3 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{background: STAGE_COLORS[stage]}} />
                          {STAGE_LABELS[stage]}
                        </span>
                      </div>
                      <div className="space-y-2 p-4">
                        <h2 className="truncate text-base font-bold">{title(project)}</h2>
                        <p className="truncate text-xs text-slate-600">{client(project)} · {project.tipoObra || "Projeto"} </p>
                        <p className="text-xs text-slate-500">{area(project)}</p>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{width: pct + "%"}} /></div>
                          <span className="text-xs font-semibold">{Math.round(pct)}%</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <span>{project.updatedAt || project.updated_at ? "Atualizado " + new Date(project.updatedAt || project.updated_at || "").toLocaleDateString("pt-BR") : "Abrir projeto"}</span>
                          <span className="rounded-full border border-slate-200 px-2.5 py-1 text-slate-950">→</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <h2 className="text-lg font-semibold">{projects.length ? "Nenhum projeto corresponde aos filtros" : "Nenhum projeto ainda"}</h2>
                <p className="mt-2 text-sm text-slate-500">{projects.length ? "Altere a pesquisa ou o filtro para ver seus projetos." : "Crie seu primeiro projeto para iniciar."}</p>
                <button onClick={() => { if (projects.length) { setSearch(""); setFilter("todos"); } else openProject(); }}
                  className="mt-5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
                  {projects.length ? "Limpar filtros" : "+ Novo projeto"}
                </button>
              </div>
            )}
          </main>

          <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1" aria-label="Resumo de projetos">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-sm font-bold">◈ Visão geral</h2>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[["Projetos", projects.length], ["Em andamento", count("andamento")], ["Planejamento", count("planejamento")]].map(([label, value]) =>
                  <div key={label}><strong className="block text-2xl">{value}</strong><span className="text-[11px] text-slate-500">{label}</span></div>)}
              </div>
              <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                {FILTERS.slice(1).map(({key, label}) => <div key={key} className="flex items-center justify-between text-xs">
                  <span><i className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{background:STAGE_COLORS[key]}} />{label}</span><b>{count(key)}</b>
                </div>)}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-bold">◈ Ações rápidas</h2>
              <div className="grid gap-2">
                {[["＋ Novo projeto","projeto"],["⇧ Importar arquivo","projeto"],["▣ Biblioteca","biblioteca"],["♧ Convidar equipe","office"]].map(([label,module]) =>
                  <button key={label} type="button" onClick={() => onNavigate?.(module)}
                    className={actionClass + " justify-start bg-white text-left"}>{label}</button>)}
              </div>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-3 text-sm font-bold">◈ Projetos recentes</h2>
              {recent.length ? recent.map((p) =>
                <button key={String(p.id || title(p))} type="button" onClick={openProject}
                  className="flex w-full items-center gap-3 border-t border-slate-100 py-2 text-left text-sm hover:text-emerald-700">
                  {cover(p) ? <img src={cover(p)} alt="" className="h-9 w-12 rounded object-cover" /> : <span className="flex h-9 w-12 items-center justify-center rounded bg-emerald-950 text-white">A</span>}
                  <span className="min-w-0"><strong className="block truncate">{title(p)}</strong><small className="text-slate-500">{status(p)}</small></span>
                </button>) : <p className="text-xs text-slate-500">Sem projetos recentes.</p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
