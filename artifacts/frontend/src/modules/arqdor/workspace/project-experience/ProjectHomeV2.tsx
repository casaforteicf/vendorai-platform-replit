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

function getProjects(arqState: ArqStateLike): ArqProject[] {
  const list = arqState.projects || arqState.projetos || arqState.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getActiveProject(arqState: ArqStateLike, projects: ArqProject[]): ArqProject | null {
  return arqState.currentProject || arqState.selectedProject || arqState.project || projects[0] || null;
}

function getTitle(project?: ArqProject | null): string {
  return String(project?.titulo || project?.title || project?.name || "Comece seu primeiro projeto");
}

function getClient(project?: ArqProject | null): string {
  return String(project?.clienteNome || project?.clientName || "ARQDOR Studio");
}

function getStatus(project?: ArqProject | null): string {
  const value = String(project?.status || "briefing");
  return statusLabel[value] || value;
}

function getProgress(project?: ArqProject | null): number {
  if (!project) return 0;
  const raw = project.project_progress ?? project.progress;
  if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
    return Math.max(0, Math.min(100, Number(raw)));
  }

  const status = String(project.status || "briefing");
  const base: Record<string, number> = {
    briefing: 18,
    orcamento: 42,
    aprovado: 55,
    em_execucao: 78,
    entregue: 100,
    cancelado: 0,
  };

  let score = base[status] ?? 25;
  if (project.totalAmbientes || project.ambientes?.length) score += 12;
  if (project.totalRenders || project.renders?.length) score += 18;
  return Math.max(0, Math.min(100, score));
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

function getCover(project?: ArqProject | null): string | undefined {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function nextAction(project?: ArqProject | null): string {
  if (!project) return "Criar Projeto Inteligente";
  if (!project.totalAmbientes && !project.ambientes?.length) return "Adicionar primeiro ambiente";
  if (!project.totalRenders && !project.renders?.length) return "Gerar primeiro render";
  if (project.status === "orcamento") return "Revisar orçamento executivo";
  if (project.status === "aprovado") return "Abrir Design Studio";
  return "Continuar desenvolvimento";
}

function aiInsights(project?: ArqProject | null) {
  if (!project) {
    return [
      ["Projeto Inteligente", "Crie o primeiro projeto para ativar render, documentação, produção e orçamento."],
      ["AI Architect", "A IA passará a orientar decisões de design, custo e execução."],
      ["Fluxo completo", "Design → Documentação → Produção → Orçamento → Cliente."],
    ];
  }

  return [
    ["Briefing", project.totalAmbientes || project.ambientes?.length ? "Ambientes encontrados. Próxima etapa: consolidar briefing visual." : "Adicione ambientes para melhorar as sugestões da IA."],
    ["Render", project.totalRenders || project.renders?.length ? "Renders disponíveis para análise e evolução." : "Gere o primeiro render para ativar versões e storyboard."],
    ["Produção", "Marcenaria, gesso e marmoraria serão conectados ao pacote técnico."],
  ];
}

function ScoreCard({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-slate-400">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function WorkflowStep({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className={["rounded-2xl px-4 py-3 text-sm font-semibold", active ? "bg-slate-950 text-white" : "bg-white text-slate-600"].join(" ")}>
      {label}
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: ArqProject; onOpen: () => void }) {
  const progress = getProgress(project);

  return (
    <button type="button" onClick={onOpen} className="text-left">
      <article className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="h-40 bg-slate-950">
          {getCover(project) ? (
            <img src={getCover(project)} alt={getTitle(project)} className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-white/10">ARQDOR</div>
          )}
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-950">{getTitle(project)}</h3>
              <p className="mt-1 truncate text-sm text-slate-500">{getClient(project)}</p>
            </div>
            <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">{getStatus(project)}</span>
          </div>

          <div className="mt-5">
            <ScoreCard label="AI Score" value={progress} />
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-400">Próxima ação</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{nextAction(project)}</p>
          </div>
        </div>
      </article>
    </button>
  );
}

export default function ProjectHomeV2({ arqState, onNavigate }: ProjectHomeV2Props) {
  const [search, setSearch] = useState("");
  const projects = useMemo(() => getProjects(arqState), [arqState]);
  const activeProject = useMemo(() => getActiveProject(arqState, projects), [arqState, projects]);
  const progress = getProgress(activeProject);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => {
      return getTitle(project).toLowerCase().includes(q) || getClient(project).toLowerCase().includes(q);
    });
  }, [projects, search]);

  const insights = aiInsights(activeProject);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-6 py-6 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">ARQDOR.ai Operating Workspace</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Projetos Inteligentes</h1>
            <p className="mt-1 text-sm text-slate-500">Design, render, documentação, produção, orçamento e cliente no mesmo fluxo.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar projeto, cliente, ambiente..."
              className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100 sm:w-96"
            />
            <button
              type="button"
              onClick={() => onNavigate?.("projeto")}
              className="h-11 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-violet-700"
            >
              Novo projeto
            </button>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1fr_390px]">
          <main className="space-y-6">
            <section className="overflow-hidden rounded-[36px] bg-slate-950 shadow-sm">
              <div className="grid min-h-[410px] lg:grid-cols-[1fr_0.72fr]">
                <div className="flex flex-col justify-between p-8 text-white">
                  <div>
                    <p className="text-sm font-medium text-violet-300">Continue exatamente de onde parou</p>
                    <h2 className="mt-4 text-4xl font-semibold tracking-tight">{getTitle(activeProject)}</h2>
                    <p className="mt-2 text-slate-300">{getClient(activeProject)}</p>

                    <div className="mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                      <WorkflowStep label="Design" active />
                      <WorkflowStep label="Doc." />
                      <WorkflowStep label="Produção" />
                      <WorkflowStep label="Orçamento" />
                    </div>
                  </div>

                  <div className="mt-8">
                    <p className="mb-4 text-sm text-slate-300">
                      Próxima ação: <span className="font-semibold text-white">{nextAction(activeProject)}</span>
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => onNavigate?.(activeProject ? "renders" : "projeto")}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100"
                      >
                        {activeProject ? "Abrir Design Studio" : "Criar Projeto Inteligente"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate?.("especificacao")}
                        className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Especificar
                      </button>
                    </div>
                  </div>
                </div>

                <div className="hidden bg-slate-900 lg:block">
                  {getCover(activeProject) ? (
                    <img src={getCover(activeProject)} alt={getTitle(activeProject)} className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-6xl font-semibold text-white/10">ARQDOR</div>
                  )}
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-end justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Projetos recentes</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">Continue ou acompanhe a evolução</h2>
                </div>
              </div>

              {filteredProjects.length ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredProjects.slice(0, 6).map((project) => (
                    <ProjectCard key={String(project.id || getTitle(project))} project={project} onOpen={() => onNavigate?.("projeto")} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                  <h3 className="text-xl font-semibold text-slate-950">Comece seu primeiro projeto no ARQDOR.</h3>
                  <p className="mt-2 text-sm text-slate-500">Crie um projeto para ativar IA, renders, documentação e orçamento.</p>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("projeto")}
                    className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
                  >
                    Criar projeto
                  </button>
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-6">
            <section className="rounded-[32px] border border-violet-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Architect</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">Radar inteligente</h3>
                </div>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ativo</span>
              </div>

              <div className="space-y-3">
                {insights.map(([title, description]) => (
                  <div key={title} className="rounded-3xl bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Score</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">Saúde do projeto</h3>
                </div>
                <div className="rounded-2xl bg-slate-950 px-4 py-2 text-xl font-semibold text-white">{progress}%</div>
              </div>

              <div className="space-y-4">
                <ScoreCard label="Briefing" value={activeProject ? 72 : 0} />
                <ScoreCard label="Design" value={progress} />
                <ScoreCard label="Documentação" value={activeProject ? 35 : 0} />
                <ScoreCard label="Produção" value={activeProject ? 20 : 0} />
                <ScoreCard label="Orçamento" value={activeProject ? 28 : 0} />
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">História do projeto</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Linha de evolução</h3>
              <div className="mt-5 space-y-4">
                {["Briefing iniciado", "Render base", "Especificações", "Produção", "Entrega"].map((item, index) => (
                  <div key={item} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={["h-3 w-3 rounded-full", index <= 1 ? "bg-violet-600" : "bg-slate-200"].join(" ")} />
                      {index < 4 ? <span className="mt-2 h-full min-h-[32px] w-px bg-slate-200" /> : null}
                    </div>
                    <p className="text-sm font-medium text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </div>
  );
}
