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

export default function ProjectHomeV2({ arqState, onNavigate }: ProjectHomeV2Props) {
  const [search, setSearch] = useState("");
  const projects = useMemo(() => getProjects(arqState), [arqState]);
  const activeProject = useMemo(() => getActiveProject(arqState, projects), [arqState, projects]);
  const pct = progress(activeProject);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => [title(project), client(project), String(project.status || "")].some((value) => value.toLowerCase().includes(q)));
  }, [projects, search]);

  const projectModules = LIFECYCLE.filter((item) => item.group === "projeto");
  const siteModules = LIFECYCLE.filter((item) => item.group === "obra");
  const clientModules = LIFECYCLE.filter((item) => item.group === "cliente");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-5 py-6 lg:px-8">
        <header className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">ARQDOR.ai</p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight">Pré-Projeto simples. Evolução técnica quando você quiser.</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Primeiro conclua o projeto. Depois, opcionalmente, especifique, gere quantitativos, orce, envie para cotação e siga para execução sem recriar informações.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar projeto ou cliente..." className="h-11 min-w-[280px] rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
              <button type="button" onClick={() => onNavigate?.("projeto")} className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-violet-700">+ Novo projeto</button>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-[36px] bg-slate-950 text-white shadow-sm">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
            <div className="p-7 lg:p-9">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-200">Projeto atual</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{status(activeProject)}</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">{Math.round(pct)}% concluído</span>
              </div>
              <h2 className="mt-5 text-3xl font-semibold tracking-tight lg:text-4xl">{title(activeProject)}</h2>
              <p className="mt-2 text-base text-slate-300">{client(activeProject)}</p>

              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-slate-400">Área</p><p className="mt-1 text-lg font-semibold">{area(activeProject)}</p></div>
                <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-slate-400">Orçamento</p><p className="mt-1 text-lg font-semibold">{money(activeProject?.orcamentoTotal)}</p></div>
                <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-slate-400">Ambientes</p><p className="mt-1 text-lg font-semibold">{activeProject?.totalAmbientes || activeProject?.ambientes?.length || 0}</p></div>
                <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs text-slate-400">Renders</p><p className="mt-1 text-lg font-semibold">{activeProject?.totalRenders || activeProject?.renders?.length || 0}</p></div>
              </div>

              <div className="mt-7">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Depois que o projeto estiver pronto</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => onNavigate?.(activeProject ? "projeto" : "projeto")} className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-violet-100">{activeProject ? "Continuar projeto" : "Criar projeto"}</button>
                  <button type="button" onClick={() => onNavigate?.("real-specification")} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">Especificar</button>
                  <button type="button" onClick={() => onNavigate?.("real-budget")} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">Quantificar</button>
                  <button type="button" onClick={() => onNavigate?.("real-budget")} className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/15">Orçar</button>
                  <button type="button" onClick={() => onNavigate?.("compras")} className="rounded-2xl border border-violet-300/30 bg-violet-500/20 px-5 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/30">Contratar / Cotar</button>
                </div>
              </div>
            </div>
            <div className="min-h-[300px] bg-slate-900">
              {cover(activeProject) ? <img src={cover(activeProject)} alt={title(activeProject)} className="h-full min-h-[300px] w-full object-cover opacity-90" /> : <div className="flex h-full min-h-[300px] items-center justify-center"><div className="text-center"><p className="text-6xl font-semibold text-white/10">ARQDOR</p><p className="mt-3 text-sm text-slate-500">O último render do projeto aparecerá aqui</p></div></div>}
            </div>
          </div>
        </section>

        <div className="grid gap-6 2xl:grid-cols-[1fr_350px]">
          <main className="space-y-6">
            <Group title="1. Pré-Projeto" subtitle="Conclua a arquitetura primeiro. Especificação é opcional e pode ser feita depois, sem travar o projeto." items={projectModules} onNavigate={onNavigate} />
            <Group title="2. Quantificar, Orçar e Contratar" subtitle="Use a geometria para quantificar, aprofunde quando houver especificação e envie pacotes para cotação dentro da rede Vendor.ai." items={siteModules} onNavigate={onNavigate} />
            <Group title="3. Cliente, Execução e Pós-obra" subtitle="Aprovações, contratação, execução e entrega continuam vinculadas ao mesmo projeto e aos mesmos elementos." items={clientModules} onNavigate={onNavigate} />

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Projetos</p><h2 className="mt-1 text-xl font-semibold">Projetos recentes</h2></div>
                <span className="text-sm text-slate-500">{filteredProjects.length} encontrado(s)</span>
              </div>
              {filteredProjects.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredProjects.slice(0, 6).map((project) => <ProjectCard key={String(project.id || title(project))} project={project} onOpen={() => onNavigate?.("projeto")} />)}</div> : <div className="mt-5 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center"><p className="font-semibold">Nenhum projeto encontrado.</p><button type="button" onClick={() => onNavigate?.("projeto")} className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Criar projeto</button></div>}
            </section>
          </main>

          <aside className="space-y-5">
            <section className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fluxo integrado</p>
              <h3 className="mt-1 text-lg font-semibold">Projeto → Decisão → Execução</h3>
              <div className="mt-5 space-y-4">
                {["Projeto concluído", "Especificar (opcional)", "Quantificar", "Orçar", "Contratar / Cotar", "Comparar propostas", "Executar", "Entrega e pós-obra"].map((label, index) => (
                  <div key={label} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-xs font-bold text-violet-700">{index + 1}</span><span className="text-sm font-medium text-slate-700">{label}</span></div>
                ))}
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Copiloto da obra</p>
              <h3 className="mt-1 text-lg font-semibold">IA com contexto do projeto</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">A estrutura passa a trabalhar sobre o mesmo projeto para cruzar materiais, orçamento, execução, compras, aprovações e entrega.</p>
              <button type="button" onClick={() => onNavigate?.("construction")} className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700">Abrir Construction Hub</button>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
