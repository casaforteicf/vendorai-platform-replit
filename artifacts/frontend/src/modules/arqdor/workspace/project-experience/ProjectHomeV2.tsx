import React, { useMemo, useState } from "react";

type ArqProject = {
  id?: string;
  titulo?: string;
  title?: string;
  name?: string;
  clienteNome?: string | null;
  clientName?: string;
  status?: string | null;
  areaM2?: number | string | null;
  totalAmbientes?: number;
  totalRenders?: number;
  ambientes?: unknown[];
  renders?: unknown[];
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
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

const statusLabel: Record<string, string> = {
  briefing: "Briefing",
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const statusClass: Record<string, string> = {
  briefing: "bg-slate-100 text-slate-700",
  orcamento: "bg-amber-50 text-amber-700",
  aprovado: "bg-emerald-50 text-emerald-700",
  em_execucao: "bg-blue-50 text-blue-700",
  entregue: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-rose-50 text-rose-700",
};

function getProjects(arqState: ArqStateLike): ArqProject[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getActiveProject(arqState: ArqStateLike, projects: ArqProject[]): ArqProject | null {
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || projects?.[0] || null;
}

function getProjectTitle(project?: ArqProject | null): string {
  return String(project?.titulo || project?.title || project?.name || "Projeto sem título");
}

function getClientName(project?: ArqProject | null): string {
  return String(project?.clienteNome || project?.clientName || "Cliente não informado");
}

function getStatusLabel(project?: ArqProject | null): string {
  const status = String(project?.status || "briefing");
  return statusLabel[status] || status;
}

function getStatusClass(project?: ArqProject | null): string {
  const status = String(project?.status || "briefing");
  return statusClass[status] || "bg-slate-100 text-slate-700";
}

function getProgress(project?: ArqProject | null): number {
  const raw = project?.project_progress ?? project?.progress;

  if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
    return Math.max(0, Math.min(100, Number(raw)));
  }

  const status = String(project?.status || "briefing");

  const map: Record<string, number> = {
    briefing: 15,
    orcamento: 30,
    aprovado: 45,
    em_execucao: 70,
    entregue: 100,
    cancelado: 0,
  };

  return map[status] ?? 20;
}

function getNextStep(project?: ArqProject | null): string {
  if (!project) return "Criar primeiro projeto";
  if (!project.totalAmbientes && !project.ambientes?.length) return "Adicionar primeiro ambiente";
  if (!project.totalRenders && !project.renders?.length) return "Gerar primeiro render";
  if (project.status === "entregue") return "Revisar entrega";
  if (project.status === "orcamento") return "Finalizar proposta";
  if (project.status === "aprovado") return "Iniciar desenvolvimento";
  return "Continuar desenvolvimento";
}

function getProjectArea(project?: ArqProject | null): string {
  if (!project?.areaM2) return "—";
  return `${Number(project.areaM2).toLocaleString("pt-BR")} m²`;
}

function getCover(project?: ArqProject | null): string | undefined {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function formatDate(value?: string): string {
  if (!value) return "Sem atualização";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem atualização";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildRadar(project?: ArqProject | null): Array<{ id: string; title: string; description: string; tone: string }> {
  if (!project) {
    return [
      {
        id: "no-project",
        title: "Crie ou selecione um projeto.",
        description: "O ARQDOR Studio começa a partir de um projeto ativo.",
        tone: "bg-blue-500",
      },
    ];
  }

  const items: Array<{ id: string; title: string; description: string; tone: string }> = [];

  if (!project.totalAmbientes && !project.ambientes?.length) {
    items.push({
      id: "no-environments",
      title: "Adicione o primeiro ambiente.",
      description: "Cada projeto precisa de pelo menos um ambiente para iniciar o Studio.",
      tone: "bg-amber-500",
    });
  }

  if (!project.totalRenders && !project.renders?.length) {
    items.push({
      id: "no-renders",
      title: "Gere o primeiro render.",
      description: "O render será a base do storyboard e das próximas decisões.",
      tone: "bg-amber-500",
    });
  }

  if (!items.length) {
    items.push({
      id: "continue",
      title: "Continue o desenvolvimento.",
      description: "O projeto está pronto para a próxima etapa.",
      tone: "bg-emerald-500",
    });
  }

  return items;
}

function StatusBadge({ project }: { project?: ArqProject | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(project)}`}>
      {getStatusLabel(project)}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between text-xs text-slate-500">
        <span>Progresso</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: ArqProject; onOpen: () => void }) {
  const progress = getProgress(project);

  return (
    <button type="button" onClick={onOpen} className="group text-left">
      <article className="h-full rounded-[28px] border border-slate-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-950">{getProjectTitle(project)}</h3>
            <p className="mt-1 truncate text-sm text-slate-500">{getClientName(project)}</p>
          </div>
          <StatusBadge project={project} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-slate-400">Área</p>
            <p className="font-medium text-slate-700">{getProjectArea(project)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Atualizado</p>
            <p className="font-medium text-slate-700">{formatDate(project.updatedAt || project.updated_at)}</p>
          </div>
        </div>

        <div className="mt-5">
          <ProgressBar value={progress} />
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-3">
          <p className="text-xs text-slate-400">Próxima etapa</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{getNextStep(project)}</p>
        </div>
      </article>
    </button>
  );
}

export default function ProjectHomeV2({ arqState, onNavigate }: ProjectHomeV2Props) {
  const [search, setSearch] = useState("");

  const projects = useMemo(() => getProjects(arqState), [arqState]);
  const activeProject = useMemo(() => getActiveProject(arqState, projects), [arqState, projects]);

  const filteredProjects = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) return projects;

    return projects.filter((project) => {
      return (
        getProjectTitle(project).toLowerCase().includes(normalized) ||
        getClientName(project).toLowerCase().includes(normalized) ||
        String(project.status || "").toLowerCase().includes(normalized)
      );
    });
  }, [projects, search]);

  const recentProjects = filteredProjects.slice(0, 6);
  const radarItems = useMemo(() => buildRadar(activeProject), [activeProject]);

  const openProject = () => onNavigate?.("projeto");
  const createProject = () => onNavigate?.("projeto");

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-6 lg:px-10">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-medium text-violet-600">ARQDOR Studio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Projetos</h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar projeto ou cliente..."
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100 sm:w-80"
            />

            <button
              type="button"
              onClick={createProject}
              className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              Novo projeto
            </button>

            <button
              type="button"
              className="h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
            >
              Escritório
            </button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="overflow-hidden rounded-[32px] bg-slate-950 shadow-sm">
            <div className="grid min-h-[320px] lg:grid-cols-[1fr_0.85fr]">
              <div className="flex flex-col justify-between p-8 text-white">
                <div>
                  <p className="text-sm font-medium text-violet-300">Continue exatamente de onde parou</p>

                  <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                    {activeProject ? getProjectTitle(activeProject) : "Comece seu primeiro projeto"}
                  </h2>

                  <p className="mt-2 text-slate-300">
                    {activeProject ? getClientName(activeProject) : "Crie um projeto para iniciar o ARQDOR Studio."}
                  </p>

                  {activeProject ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <StatusBadge project={activeProject} />
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                        {formatDate(activeProject.updatedAt || activeProject.updated_at)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-8">
                  <p className="mb-3 text-sm text-slate-300">
                    Próxima etapa: <span className="font-semibold text-white">{getNextStep(activeProject)}</span>
                  </p>

                  <button
                    type="button"
                    onClick={activeProject ? openProject : createProject}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100"
                  >
                    {activeProject ? "▶ Continuar projeto" : "Criar projeto"}
                  </button>
                </div>
              </div>

              <div className="hidden bg-slate-900 lg:block">
                {getCover(activeProject) ? (
                  <img
                    src={getCover(activeProject)}
                    alt={getProjectTitle(activeProject)}
                    className="h-full w-full object-cover opacity-90"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-5xl font-semibold text-white/10">
                    ARQDOR
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-950">Radar do projeto</h3>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">IA</span>
            </div>

            <div className="space-y-3">
              {radarItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.tone}`} />
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">Projetos recentes</h2>
              <p className="mt-1 text-sm text-slate-500">Acesse rapidamente os projetos em andamento.</p>
            </div>
          </div>

          {recentProjects.length === 0 ? (
            <div className="rounded-[32px] border border-dashed border-slate-200 bg-white p-10 text-center">
              <h3 className="text-xl font-semibold text-slate-950">Comece seu primeiro projeto no ARQDOR.</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Crie um projeto para organizar ambientes, renders, especificações e entregas.
              </p>
              <button
                type="button"
                onClick={createProject}
                className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                Criar projeto
              </button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {recentProjects.map((project) => (
                <ProjectCard key={String(project.id)} project={project} onOpen={openProject} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
