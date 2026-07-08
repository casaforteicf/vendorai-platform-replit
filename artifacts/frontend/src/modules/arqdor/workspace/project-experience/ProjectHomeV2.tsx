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

type Stage = {
  label: string;
  module: string;
  value: number;
  active?: boolean;
  description: string;
};

type Insight = {
  title: string;
  description: string;
  label: string;
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

function title(project?: ArqProject | null): string {
  return String(project?.titulo || project?.title || project?.name || "Comece seu primeiro projeto");
}

function client(project?: ArqProject | null): string {
  return String(project?.clienteNome || project?.clientName || "ARQDOR Studio");
}

function status(project?: ArqProject | null): string {
  const value = String(project?.status || "briefing");
  return statusLabel[value] || value;
}

function statusBadge(project?: ArqProject | null): string {
  const value = String(project?.status || "briefing");
  return statusClass[value] || "bg-slate-100 text-slate-700";
}

function cover(project?: ArqProject | null): string | undefined {
  return project?.coverImageUrl || project?.capaUrl || project?.imageUrl;
}

function area(project?: ArqProject | null): string {
  if (!project?.areaM2) return "—";
  const number = Number(project.areaM2);
  return Number.isNaN(number) ? String(project.areaM2) : `${number.toLocaleString("pt-BR")} m²`;
}

function date(value?: string): string {
  if (!value) return "Sem atualização";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem atualização";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function progress(project?: ArqProject | null): number {
  if (!project) return 0;

  const raw = project.project_progress ?? project.progress;
  if (raw !== undefined && raw !== null && !Number.isNaN(Number(raw))) {
    return clamp(Number(raw), 0, 100);
  }

  const map: Record<string, number> = {
    briefing: 18,
    orcamento: 46,
    aprovado: 62,
    em_execucao: 80,
    entregue: 100,
    cancelado: 0,
  };

  let value = map[String(project.status || "briefing")] ?? 26;
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
  if (project.status === "em_execucao") return "Acompanhar produção";
  return "Continuar desenvolvimento";
}

function stages(project?: ArqProject | null): Stage[] {
  const base = progress(project);
  const hasProject = Boolean(project);

  return [
    { label: "Design", module: "renders", value: hasProject ? Math.max(32, base) : 0, active: true, description: "Render, conceito e versões." },
    { label: "Documentação", module: "especificacao", value: hasProject ? Math.max(14, Math.round(base * 0.58)) : 0, description: "Memorial, plantas e vistas." },
    { label: "Produção", module: "office", value: hasProject ? Math.max(8, Math.round(base * 0.36)) : 0, description: "Fornecedores e execução." },
    { label: "Orçamento", module: "orcamento", value: hasProject ? Math.max(10, Math.round(base * 0.42)) : 0, description: "Custos e proposta." },
    { label: "Cliente", module: "cliente", value: hasProject ? Math.max(4, Math.round(base * 0.24)) : 0, description: "Aprovações e entrega." },
  ];
}

function insights(project?: ArqProject | null): Insight[] {
  if (!project) {
    return [
      {
        title: "Projeto Inteligente não iniciado",
        description: "Crie o primeiro projeto para ativar render, documentação, produção, orçamento e portal do cliente.",
        label: "Iniciar",
      },
      {
        title: "AI Architect preparado",
        description: "A IA ficará ativa durante o fluxo para orientar decisões de design, custo e execução.",
        label: "IA pronta",
      },
      {
        title: "Fluxo operacional completo",
        description: "O ARQDOR conecta as etapas de projeto em uma jornada única e rastreável.",
        label: "Enterprise",
      },
    ];
  }

  const hasRooms = Boolean(project.totalAmbientes || project.ambientes?.length);
  const hasRenders = Boolean(project.totalRenders || project.renders?.length);

  return [
    {
      title: hasRooms ? "Ambientes localizados" : "Ambiente pendente",
      description: hasRooms
        ? "A base do projeto está pronta para render, documentação e orçamento."
        : "Adicione ambientes para ativar o fluxo completo de design e especificação.",
      label: hasRooms ? "Base pronta" : "Prioridade",
    },
    {
      title: hasRenders ? "Render disponível para análise" : "Primeiro render recomendado",
      description: hasRenders
        ? "Use o Studio para comparar versões, ajustar materiais e iniciar especificações."
        : "Sem render, a IA ainda não consegue avaliar composição, iluminação e materiais.",
      label: hasRenders ? "Analisar" : "Ativar Studio",
    },
    {
      title: "Orçamento conectado",
      description: "Ao avançar para produção, o sistema poderá comparar fornecedores, custos e prazos.",
      label: "Economia",
    },
  ];
}

function story(project?: ArqProject | null) {
  return [
    { label: "Briefing", done: Boolean(project), description: project ? "Projeto ativo e cliente identificado." : "Aguardando criação do projeto." },
    { label: "Ambientes", done: Boolean(project?.totalAmbientes || project?.ambientes?.length), description: "Base para render e documentação." },
    { label: "Render", done: Boolean(project?.totalRenders || project?.renders?.length), description: "Versão visual para aprovação." },
    { label: "Documentação", done: false, description: "Memorial, plantas e quantitativos." },
    { label: "Produção", done: false, description: "Fornecedores, cotações e execução." },
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function StatusBadge({ project }: { project?: ArqProject | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadge(project)}`}>{status(project)}</span>;
}

function MiniProgress({ label, value }: { label: string; value: number }) {
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
    <div className="rounded-[26px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function PipelineStage({ stage, onNavigate }: { stage: Stage; onNavigate?: (module: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate?.(stage.module)}
      className={[
        "group rounded-[26px] border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        stage.active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-100 bg-white text-slate-950",
      ].join(" ")}
    >
      <p className={["text-sm font-semibold", stage.active ? "text-white" : "text-slate-950"].join(" ")}>{stage.label}</p>
      <p className={["mt-1 text-xs leading-5", stage.active ? "text-slate-300" : "text-slate-500"].join(" ")}>{stage.description}</p>
      <div className={["mt-4 h-2 overflow-hidden rounded-full", stage.active ? "bg-white/15" : "bg-slate-100"].join(" ")}>
        <div className={["h-full rounded-full", stage.active ? "bg-white" : "bg-violet-600"].join(" ")} style={{ width: `${stage.value}%` }} />
      </div>
      <p className={["mt-2 text-xs", stage.active ? "text-slate-300" : "text-slate-400"].join(" ")}>{stage.value}% concluído</p>
    </button>
  );
}

function Hero({ project, onNavigate }: { project?: ArqProject | null; onNavigate?: (module: string) => void }) {
  const currentProgress = progress(project);
  const projectStages = stages(project);

  return (
    <section className="overflow-hidden rounded-[42px] bg-slate-950 shadow-sm">
      <div className="grid min-h-[540px] xl:grid-cols-[1fr_0.92fr]">
        <div className="flex flex-col justify-between p-8 text-white lg:p-10">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-violet-300">Projeto atual</p>
              <StatusBadge project={project} />
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">AI Score {currentProgress}%</span>
            </div>

            <h2 className="mt-6 max-w-3xl text-5xl font-semibold tracking-tight">{title(project)}</h2>
            <p className="mt-3 text-lg text-slate-300">{client(project)}</p>

            <div className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {projectStages.map((stage) => (
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

          <div className="mt-10">
            <p className="mb-4 text-sm text-slate-300">
              Próxima ação: <span className="font-semibold text-white">{nextAction(project)}</span>
            </p>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate?.(project ? "renders" : "projeto")}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100"
              >
                {project ? "Abrir Design Studio" : "Criar Projeto Inteligente"}
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

        <div className="relative min-h-[420px] bg-slate-900">
          {cover(project) ? (
            <img src={cover(project)} alt={title(project)} className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-8xl font-semibold text-white/10">ARQDOR</p>
                <p className="mt-3 text-sm text-slate-500">Último render aparecerá aqui</p>
              </div>
            </div>
          )}

          <div className="absolute bottom-6 left-6 right-6 rounded-[26px] bg-black/40 p-5 text-white backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-200">Painel executivo</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-slate-300">Área</p>
                <p className="mt-1 font-semibold">{area(project)}</p>
              </div>
              <div>
                <p className="text-slate-300">Ambientes</p>
                <p className="mt-1 font-semibold">{project?.totalAmbientes || project?.ambientes?.length || 0}</p>
              </div>
              <div>
                <p className="text-slate-300">Atualizado</p>
                <p className="mt-1 font-semibold">{date(project?.updatedAt || project?.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AIArchitect({ project }: { project?: ArqProject | null }) {
  return (
    <section className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Architect</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Radar inteligente</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ativo</span>
      </div>

      <div className="space-y-3">
        {insights(project).map((item) => (
          <div key={item.title} className="rounded-3xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{item.title}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">{item.label}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
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
  const allStages = stages(project);
  const total = project ? Math.round(allStages.reduce((sum, item) => sum + item.value, 0) / allStages.length) : 0;

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Score</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Saúde do projeto</h3>
        </div>
        <div className="rounded-2xl bg-slate-950 px-4 py-2 text-xl font-semibold text-white">{total}%</div>
      </div>

      <div className="space-y-4">
        {allStages.map((stage) => (
          <MiniProgress key={stage.label} label={stage.label} value={stage.value} />
        ))}
      </div>
    </section>
  );
}

function StoryPanel({ project }: { project?: ArqProject | null }) {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">História do projeto</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Evolução das decisões</h3>

      <div className="mt-5 space-y-4">
        {story(project).map((item, index) => (
          <div key={item.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={["h-3 w-3 rounded-full", item.done ? "bg-violet-600" : "bg-slate-200"].join(" ")} />
              {index < 4 ? <span className="mt-2 h-full min-h-[36px] w-px bg-slate-200" /> : null}
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
  const currentProgress = progress(project);

  return (
    <button type="button" onClick={onOpen} className="text-left">
      <article className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="relative h-48 bg-slate-950">
          {cover(project) ? (
            <img src={cover(project)} alt={title(project)} className="h-full w-full object-cover opacity-90" />
          ) : (
            <div className="flex h-full items-center justify-center text-3xl font-semibold text-white/10">ARQDOR</div>
          )}
          <div className="absolute left-4 top-4">
            <StatusBadge project={project} />
          </div>
          <div className="absolute bottom-4 right-4 rounded-2xl bg-black/45 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
            {currentProgress}% AI Score
          </div>
        </div>

        <div className="p-5">
          <h3 className="truncate text-base font-semibold text-slate-950">{title(project)}</h3>
          <p className="mt-1 truncate text-sm text-slate-500">{client(project)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Área</p>
              <p className="mt-1 font-semibold text-slate-800">{area(project)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs text-slate-400">Atualizado</p>
              <p className="mt-1 font-semibold text-slate-800">{date(project.updatedAt || project.updated_at)}</p>
            </div>
          </div>

          <div className="mt-5">
            <MiniProgress label="Progresso" value={currentProgress} />
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
  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;

    return projects.filter((project) => {
      return title(project).toLowerCase().includes(q) || client(project).toLowerCase().includes(q) || String(project.status || "").toLowerCase().includes(q);
    });
  }, [projects, search]);

  const activeStages = stages(activeProject);

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-6 px-6 py-6 lg:px-10">
        <header className="flex flex-col gap-4 rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
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

        <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <main className="space-y-6">
            <Hero project={activeProject} onNavigate={onNavigate} />

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Projetos" value={String(projects.length)} description="Projetos disponíveis no workspace." />
              <MetricCard label="Área" value={area(activeProject)} description="Área estimada do projeto ativo." />
              <MetricCard label="Ambientes" value={String(activeProject?.totalAmbientes || activeProject?.ambientes?.length || 0)} description="Ambientes cadastrados." />
              <MetricCard label="Renders" value={String(activeProject?.totalRenders || activeProject?.renders?.length || 0)} description="Versões visuais geradas." />
            </section>

            <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pipeline do projeto</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Acompanhe a jornada completa</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {activeStages.map((stage) => (
                  <PipelineStage key={stage.label} stage={stage} onNavigate={onNavigate} />
                ))}
              </div>
            </section>

            <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Projetos recentes</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">Continue ou acompanhe a evolução</h2>
              </div>

              {filteredProjects.length ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredProjects.slice(0, 6).map((project) => (
                    <ProjectCard key={String(project.id || title(project))} project={project} onOpen={() => onNavigate?.("projeto")} />
                  ))}
                </div>
              ) : (
                <div className="rounded-[30px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
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
            <AIArchitect project={activeProject} />
            <ScorePanel project={activeProject} />
            <StoryPanel project={activeProject} />
          </aside>
        </section>
      </div>
    </div>
  );
}
