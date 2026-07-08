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

type Insight = {
  id: string;
  title: string;
  description: string;
  impact: string;
  tone: "violet" | "emerald" | "amber" | "rose" | "blue";
};

type Stage = {
  label: string;
  module: string;
  value: number;
  active?: boolean;
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
  const list = arqState.projects || arqState.projetos || arqState.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getActiveProject(arqState: ArqStateLike, projects: ArqProject[]): ArqProject | null {
  return arqState.currentProject || arqState.selectedProject || arqState.project || projects[0] || null;
}

function projectTitle(project?: ArqProject | null): string {
  return String(project?.titulo || project?.title || project?.name || "Comece seu primeiro projeto");
}

function clientName(project?: ArqProject | null): string {
  return String(project?.clienteNome || project?.clientName || "ARQDOR Studio");
}

function projectStatus(project?: ArqProject | null): string {
  const value = String(project?.status || "briefing");
  return statusLabel[value] || value;
}

function projectStatusClass(project?: ArqProject | null): string {
  const value = String(project?.status || "briefing");
  return statusClass[value] || "bg-slate-100 text-slate-700";
}

function projectCover(project?: ArqProject | null): string | undefined {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function projectArea(project?: ArqProject | null): string {
  if (!project?.areaM2) return "—";
  const number = Number(project.areaM2);
  if (Number.isNaN(number)) return String(project.areaM2);
  return `${number.toLocaleString("pt-BR")} m²`;
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

function baseProgress(project?: ArqProject | null): number {
  if (!project) return 0;

  const raw = project.project_progress ?? project.progress;
  if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
    return clamp(Number(raw), 0, 100);
  }

  const status = String(project.status || "briefing");
  const map: Record<string, number> = {
    briefing: 18,
    orcamento: 42,
    aprovado: 58,
    em_execucao: 78,
    entregue: 100,
    cancelado: 0,
  };

  let value = map[status] ?? 24;
  if (project.totalAmbientes || project.ambientes?.length) value += 12;
  if (project.totalRenders || project.renders?.length) value += 18;

  return clamp(value, 0, 100);
}

function nextAction(project?: ArqProject | null): string {
  if (!project) return "Criar Projeto Inteligente";
  if (!project.totalAmbientes && !project.ambientes?.length) return "Adicionar primeiro ambiente";
  if (!project.totalRenders && !project.renders?.length) return "Gerar primeiro render";
  if (project.status === "orcamento") return "Revisar orçamento executivo";
  if (project.status === "aprovado") return "Abrir Design Studio";
  if (project.status === "em_execucao") return "Acompanhar produção e execução";
  if (project.status === "entregue") return "Revisar entrega final";
  return "Continuar desenvolvimento";
}

function buildStages(project?: ArqProject | null): Stage[] {
  const progress = baseProgress(project);
  const hasProject = Boolean(project);

  return [
    { label: "Design", module: "renders", value: hasProject ? Math.max(28, progress) : 0, active: true },
    { label: "Documentação", module: "especificacao", value: hasProject ? Math.max(12, Math.round(progress * 0.55)) : 0 },
    { label: "Produção", module: "office", value: hasProject ? Math.max(5, Math.round(progress * 0.32)) : 0 },
    { label: "Orçamento", module: "orcamento", value: hasProject ? Math.max(8, Math.round(progress * 0.38)) : 0 },
    { label: "Cliente", module: "cliente", value: hasProject ? Math.max(0, Math.round(progress * 0.22)) : 0 },
  ];
}

function buildInsights(project?: ArqProject | null): Insight[] {
  if (!project) {
    return [
      {
        id: "start",
        title: "Projeto Inteligente ainda não iniciado",
        description: "Crie o primeiro projeto para ativar render, documentação, produção, orçamento e cliente.",
        impact: "Ativar Workspace",
        tone: "violet",
      },
      {
        id: "ai",
        title: "AI Architect preparado",
        description: "A IA vai orientar decisões de design, custo, fornecedor, produção e entrega.",
        impact: "IA contextual",
        tone: "blue",
      },
      {
        id: "flow",
        title: "Fluxo completo disponível",
        description: "O ARQDOR conecta Design → Documentação → Produção → Orçamento → Cliente.",
        impact: "Operação completa",
        tone: "emerald",
      },
    ];
  }

  const hasEnvironments = Boolean(project.totalAmbientes || project.ambientes?.length);
  const hasRenders = Boolean(project.totalRenders || project.renders?.length);

  const insights: Insight[] = [];

  if (!hasEnvironments) {
    insights.push({
      id: "environment",
      title: "Ambiente pendente",
      description: "Adicione cozinha, sala, suíte ou outro ambiente para ativar o fluxo de design.",
      impact: "Prioridade alta",
      tone: "amber",
    });
  } else {
    insights.push({
      id: "environment-ok",
      title: "Ambientes localizados",
      description: "A base do projeto já permite conectar render, documentação e orçamento.",
      impact: "Base pronta",
      tone: "emerald",
    });
  }

  if (!hasRenders) {
    insights.push({
      id: "render",
      title: "Primeiro render recomendado",
      description: "Sem render, a IA ainda não consegue avaliar materiais, iluminação e composição visual.",
      impact: "Ativar Design Studio",
      tone: "violet",
    });
  } else {
    insights.push({
      id: "render-ok",
      title: "Render disponível para análise",
      description: "Use o Studio para comparar versões, ajustar materiais e iniciar especificações.",
      impact: "Próxima etapa: especificar",
      tone: "blue",
    });
  }

  insights.push({
    id: "budget",
    title: "Orçamento precisa ser conectado",
    description: "A produção e os fornecedores podem ser analisados após a documentação base.",
    impact: "Economia potencial",
    tone: "amber",
  });

  return insights;
}

function buildStory(project?: ArqProject | null): Array<{ label: string; done: boolean; description: string }> {
  return [
    {
      label: "Briefing",
      done: Boolean(project),
      description: project ? "Projeto iniciado e cliente identificado." : "Aguardando criação do projeto.",
    },
    {
      label: "Ambientes",
      done: Boolean(project?.totalAmbientes || project?.ambientes?.length),
      description: "Base para render, documentação e orçamento.",
    },
    {
      label: "Render",
      done: Boolean(project?.totalRenders || project?.renders?.length),
      description: "Visual principal para aprovações e especificações.",
    },
    {
      label: "Documentação",
      done: false,
      description: "Memoriais, plantas, vistas e quantitativos.",
    },
    {
      label: "Produção",
      done: false,
      description: "Fornecedores, compatibilização e execução.",
    },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function StatusBadge({ project }: { project?: ArqProject | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${projectStatusClass(project)}`}>
      {projectStatus(project)}
    </span>
  );
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const safe = clamp(Math.round(value), 0, 100);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-600">{label}</span>
        <span className="text-slate-400">{safe}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description: string }) {
  return (
    <div className="rounded-[24px] border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function WorkflowCard({ stage, onNavigate }: { stage: Stage; onNavigate?: (module: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(stage.module)}
      className={[
        "rounded-[24px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        stage.active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-100 bg-white text-slate-950",
      ].join(" ")}
    >
      <p className={["text-sm font-semibold", stage.active ? "text-white" : "text-slate-950"].join(" ")}>{stage.label}</p>
      <p className={["mt-1 text-xs", stage.active ? "text-slate-300" : "text-slate-500"].join(" ")}>Progresso {stage.value}%</p>
      <div className={["mt-3 h-2 overflow-hidden rounded-full", stage.active ? "bg-white/15" : "bg-slate-100"].join(" ")}>
        <div className={["h-full rounded-full", stage.active ? "bg-white" : "bg-violet-600"].join(" ")} style={{ width: `${stage.value}%` }} />
      </div>
    </button>
  );
}

function AIArchitectPanel({ project }: { project?: ArqProject | null }) {
  const insights = buildInsights(project);

  return (
    <section className="rounded-[32px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Architect</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Radar inteligente</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ativo</span>
      </div>

      <div className="space-y-3">
        {insights.map((insight) => (
          <div key={insight.id} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{insight.title}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {insight.impact}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{insight.description}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Aplicar recomendações
      </button>
    </section>
  );
}

function ScorePanel({ project }: { project?: ArqProject | null }) {
  const stages = buildStages(project);
  const total = project ? Math.round(stages.reduce((sum, stage) => sum + stage.value, 0) / stages.length) : 0;

  return (
    <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Score</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Saúde do projeto</h3>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-xl font-semibold text-white">{total}%</div>
      </div>

      <div className="space-y-4">
        {stages.map((stage) => (
          <ProgressBar key={stage.label} label={stage.label} value={stage.value} />
        ))}
      </div>
    </section>
  );
}

function StoryPanel({ project }: { project?: ArqProject | null }) {
  const story = buildStory(project);

  return (
    <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">História do projeto</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Evolução das decisões</h3>

      <div className="mt-5 space-y-4">
        {story.map((item, index) => (
          <div key={item.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={["h-3 w-3 rounded-full", item.done ? "bg-violet-600" : "bg-slate-200"].join(" ")} />
              {index < story.length - 1 ? <span className="mt-2 h-full min-h-[34px] w-px bg-slate-200" /> : null}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({ project, onOpen }: { project: ArqProject; onOpen: () => void }) {
  const progress = baseProgress(project);

  return (
    <button type="button" onClick={onOpen} className="text-left">
      <article className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative h-44 bg-slate-950">
          {projectCover(project) ? (
            <img src={projectCover(project)} alt={projectTitle(project)} className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-white/10">ARQDOR</div>
          )}
          <div className="absolute left-4 top-4">
            <StatusBadge project={project} />
          </div>
        </div>

        <div className="p-5">
          <h3 className="truncate text-base font-semibold text-slate-950">{projectTitle(project)}</h3>
          <p className="mt-1 truncate text-sm text-slate-500">{clientName(project)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Área</p>
              <p className="mt-1 font-semibold text-slate-800">{projectArea(project)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Atualizado</p>
              <p className="mt-1 font-semibold text-slate-800">{formatDate(project.updatedAt || project.updated_at)}</p>
            </div>
          </div>

          <div className="mt-5">
            <ProgressBar label="AI Score" value={progress} />
          </div>

          <div className="mt-5 rounded-2xl bg-violet-50 p-3">
            <p className="text-xs font-semibold text-violet-600">Próxima ação</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{nextAction(project)}</p>
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
  const stages = buildStages(activeProject);
  const progress = baseProgress(activeProject);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;

    return projects.filter((project) => {
      return (
        projectTitle(project).toLowerCase().includes(q) ||
        clientName(project).toLowerCase().includes(q) ||
        String(project.status || "").toLowerCase().includes(q)
      );
    });
  }, [projects, search]);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-6 py-6 lg:px-10">
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

        <section className="grid gap-6 xl:grid-cols-[1fr_410px]">
          <main className="space-y-6">
            <section className="overflow-hidden rounded-[38px] bg-slate-950 shadow-sm">
              <div className="grid min-h-[460px] lg:grid-cols-[1fr_0.76fr]">
                <div className="flex flex-col justify-between p-8 text-white">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium text-violet-300">Projeto atual</p>
                      <StatusBadge project={activeProject} />
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                        AI Score {progress}%
                      </span>
                    </div>

                    <h2 className="mt-5 text-4xl font-semibold tracking-tight">{projectTitle(activeProject)}</h2>
                    <p className="mt-2 text-lg text-slate-300">{clientName(activeProject)}</p>

                    <div className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      {stages.map((stage) => (
                        <button
                          key={stage.label}
                          type="button"
                          onClick={() => onNavigate?.(stage.module)}
                          className={[
                            "rounded-2xl px-4 py-3 text-left transition",
                            stage.active ? "bg-white text-slate-950" : "bg-white/10 text-white hover:bg-white/15",
                          ].join(" ")}
                        >
                          <p className="text-sm font-semibold">{stage.label}</p>
                          <p className={["mt-1 text-xs", stage.active ? "text-slate-500" : "text-slate-300"].join(" ")}>{stage.value}%</p>
                        </button>
                      ))}
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
                      <button
                        type="button"
                        onClick={() => onNavigate?.("office")}
                        className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                      >
                        Produção
                      </button>
                    </div>
                  </div>
                </div>

                <div className="hidden bg-slate-900 lg:block">
                  {projectCover(activeProject) ? (
                    <img src={projectCover(activeProject)} alt={projectTitle(activeProject)} className="h-full w-full object-cover opacity-90" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <p className="text-7xl font-semibold text-white/10">ARQDOR</p>
                        <p className="mt-3 text-sm text-slate-500">Último render aparecerá aqui</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Projetos" value={String(projects.length)} description="Projetos disponíveis no workspace." />
              <MetricCard label="Área" value={projectArea(activeProject)} description="Área estimada do projeto ativo." />
              <MetricCard label="Ambientes" value={String(activeProject?.totalAmbientes || activeProject?.ambientes?.length || 0)} description="Ambientes cadastrados." />
              <MetricCard label="Renders" value={String(activeProject?.totalRenders || activeProject?.renders?.length || 0)} description="Versões visuais geradas." />
            </section>

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Fluxo do Projeto</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">Design → Documentação → Produção → Orçamento → Cliente</h2>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {stages.map((stage) => (
                  <WorkflowCard key={stage.label} stage={stage} onNavigate={onNavigate} />
                ))}
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Projetos recentes</p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">Continue ou acompanhe a evolução</h2>
                </div>
              </div>

              {filteredProjects.length ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredProjects.slice(0, 6).map((project) => (
                    <ProjectCard key={String(project.id || projectTitle(project))} project={project} onOpen={() => onNavigate?.("projeto")} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
                  <h3 className="text-xl font-semibold text-slate-950">Comece seu primeiro projeto no ARQDOR.</h3>
                  <p className="mt-2 text-sm text-slate-500">Crie um projeto para ativar IA, renders, documentação, produção e orçamento.</p>
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
            <AIArchitectPanel project={activeProject} />
            <ScorePanel project={activeProject} />
            <StoryPanel project={activeProject} />
          </aside>
        </section>
      </div>
    </div>
  );
}
