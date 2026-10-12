import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { SmartSpecModule } from "./SmartSpecModule";
const RealBudgetEngineStudio = lazy(() => import("../real-budget-engine/RealBudgetEngineStudio"));

type ProjectLike = {
  id?: string;
  titulo?: string;
  title?: string;
  name?: string;
  clienteNome?: string | null;
  clientName?: string | null;
  clienteEmail?: string;
  clienteTelefone?: string;
  descricao?: string;
  status?: string | null;
  tipoObra?: string | null;
  areaM2?: number | string | null;
  orcamentoTotal?: number | string | null;
  prazoEstimado?: string | null;
  arquitetoResponsavel?: string | null;
  totalAmbientes?: number;
  totalRenders?: number;
  ambientes?: EnvironmentLike[];
  renders?: unknown[];
  dossieProjeto?: { arquivos?: Array<{ id:string; nome:string; url:string; tipo:string; ambienteId?:string|null; createdAt?:string; size?:number }> };
  updatedAt?: string;
  updated_at?: string;
  createdAt?: string;
  created_at?: string;
};

type EnvironmentLike = {
  id?: string;
  nome?: string;
  name?: string;
  titulo?: string;
  tipo?: string;
  status?: string;
  totalRenders?: number;
  renders?: unknown[];
  updatedAt?: string;
  updated_at?: string;
};

type ArqStateLike = {
  currentProject?: ProjectLike | null;
  selectedProject?: ProjectLike | null;
  project?: ProjectLike | null;
  projects?: ProjectLike[];
  projetos?: ProjectLike[];
  allProjects?: ProjectLike[];
};

type SmartProjectModuleProps = {
  arqState: ArqStateLike;
  onNavigate?: (module: string) => void;
  projectId?: string | null;
};

const projectStatusLabel: Record<string, string> = {
  briefing: "Briefing",
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  em_execucao: "Em execução",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

const projectStatusClass: Record<string, string> = {
  briefing: "bg-slate-100 text-slate-700",
  orcamento: "bg-amber-50 text-amber-700",
  aprovado: "bg-emerald-50 text-emerald-700",
  em_execucao: "bg-blue-50 text-blue-700",
  entregue: "bg-emerald-100 text-emerald-800",
  cancelado: "bg-rose-50 text-rose-700",
};

function getProjects(arqState: ArqStateLike): ProjectLike[] {
  const list = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return Array.isArray(list) ? list : [];
}

function getCurrentProject(arqState: ArqStateLike, requestedId?: string | null): ProjectLike | null {
  const projects = getProjects(arqState);
  const candidates = [arqState?.currentProject, arqState?.selectedProject, arqState?.project, ...projects].filter(
    (project): project is ProjectLike => Boolean(project)
  );
  if (requestedId) return candidates.find(project => project.id === requestedId) ?? null;
  return candidates[0] ?? null;
}

function getTitle(project?: ProjectLike | null): string {
  return String(project?.titulo || project?.title || project?.name || "Projeto sem título");
}

function getClient(project?: ProjectLike | null): string {
  return String(project?.clienteNome || project?.clientName || "Cliente não informado");
}

function getStatus(project?: ProjectLike | null): string {
  const status = String(project?.status || "briefing");
  return projectStatusLabel[status] || status;
}

function getStatusClass(project?: ProjectLike | null): string {
  const status = String(project?.status || "briefing");
  return projectStatusClass[status] || "bg-slate-100 text-slate-700";
}

function getArea(project?: ProjectLike | null): string {
  if (!project?.areaM2) return "—";
  return `${Number(project.areaM2).toLocaleString("pt-BR")} m²`;
}

function getBudget(project?: ProjectLike | null): string {
  if (!project?.orcamentoTotal) return "—";
  return Number(project.orcamentoTotal).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getDate(value?: string): string {
  if (!value) return "Sem registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getEnvironmentName(environment: EnvironmentLike): string {
  return String(environment.nome || environment.name || environment.titulo || "Ambiente sem nome");
}

function getEnvironmentStatus(environment: EnvironmentLike): string {
  return String(environment.status || "Em desenvolvimento");
}

function getProjectProgress(project?: ProjectLike | null): number {
  if (!project) return 0;

  const environments = project.ambientes || [];
  const totalEnvironments = project.totalAmbientes || environments.length || 0;
  const totalRenders = project.totalRenders || project.renders?.length || 0;

  const status = String(project.status || "briefing");
  const base: Record<string, number> = {
    briefing: 12,
    orcamento: 25,
    aprovado: 42,
    em_execucao: 68,
    entregue: 100,
    cancelado: 0,
  };

  let score = base[status] ?? 20;
  if (totalEnvironments > 0) score += 12;
  if (totalRenders > 0) score += 16;
  if (totalEnvironments >= 3) score += 8;

  return Math.max(0, Math.min(100, score));
}

function buildTimeline(project?: ProjectLike | null) {
  if (!project) {
    return [
      {
        title: "Nenhum projeto ativo",
        description: "Selecione ou crie um projeto para iniciar.",
        date: "",
      },
    ];
  }

  const items = [
    {
      title: "Projeto criado",
      description: "Base do Projeto Inteligente iniciada.",
      date: getDate(project.createdAt || project.created_at),
    },
  ];

  if (project.totalAmbientes || project.ambientes?.length) {
    items.push({
      title: "Ambientes cadastrados",
      description: `${project.totalAmbientes || project.ambientes?.length || 0} ambiente(s) vinculados ao projeto.`,
      date: getDate(project.updatedAt || project.updated_at),
    });
  }

  if (project.totalRenders || project.renders?.length) {
    items.push({
      title: "Renders gerados",
      description: `${project.totalRenders || project.renders?.length || 0} render(es) disponíveis.`,
      date: getDate(project.updatedAt || project.updated_at),
    });
  }

  items.push({
    title: "Próxima ação",
    description: getNextAction(project),
    date: "Agora",
  });

  return items;
}

function getNextAction(project?: ProjectLike | null): string {
  if (!project) return "Criar ou selecionar projeto";
  if (!project.totalAmbientes && !project.ambientes?.length) return "Adicionar primeiro ambiente";
  if (!project.totalRenders && !project.renders?.length) return "Gerar primeiro render";
  if (project.status === "orcamento") return "Finalizar proposta comercial";
  if (project.status === "aprovado") return "Iniciar desenvolvimento do projeto";
  if (project.status === "entregue") return "Revisar entrega e pós-venda";
  return "Continuar desenvolvimento";
}

function buildRadar(project?: ProjectLike | null) {
  if (!project) {
    return [
      {
        id: "select-project",
        title: "Selecione um projeto",
        description: "O Projeto Inteligente precisa de um projeto ativo.",
        severity: "info",
      },
    ];
  }

  const items = [];

  if (!project.totalAmbientes && !project.ambientes?.length) {
    items.push({
      id: "env",
      title: "Ambientes pendentes",
      description: "Adicione pelo menos um ambiente para iniciar o Studio.",
      severity: "warning",
    });
  }

  if (!project.totalRenders && !project.renders?.length) {
    items.push({
      id: "render",
      title: "Render inicial pendente",
      description: "Gere o primeiro render para criar storyboard e versões.",
      severity: "warning",
    });
  }

  if (!project.descricao) {
    items.push({
      id: "briefing",
      title: "Briefing incompleto",
      description: "Inclua informações principais para melhorar as sugestões da IA.",
      severity: "info",
    });
  }

  if (!items.length) {
    items.push({
      id: "ready",
      title: "Projeto pronto para avançar",
      description: "A próxima etapa pode ser iniciada com segurança.",
      severity: "success",
    });
  }

  return items;
}

function StatusBadge({ project }: { project?: ProjectLike | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusClass(project)}`}>
      {getStatus(project)}
    </span>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Progresso inteligente</span>
        <span>{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
    </div>
  );
}

function EmptyProject({ onNavigate }: { onNavigate?: (module: string) => void }) {
  return (
    <div className="min-h-screen bg-[#f7f7f8] p-8 text-slate-950">
      <div className="mx-auto flex min-h-[520px] max-w-4xl items-center justify-center">
        <div className="rounded-[32px] border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-violet-600">Projeto Inteligente</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Nenhum projeto ativo</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
            Selecione um projeto existente ou crie um novo projeto para acessar briefing, ambientes, timeline,
            radar e próximas etapas.
          </p>
          <button
            type="button"
            onClick={() => onNavigate?.("home")}
            className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
          >
            Voltar para projetos
          </button>
        </div>
      </div>
    </div>
  );
}


type TechnicalMeasurement = {
  id: string; name?: string | null; ambiente_id?: string | null; status?: string | null;
  width_mm?: string | number | null; height_mm?: string | number | null;
  depth_mm?: string | number | null; length_mm?: string | number | null;
  measurement_source?: string | null; measurement_revision?: string | null;
};
function ProjectMeasurements({ projectId }: { projectId: string | null }) {
  const [items, setItems] = useState<TechnicalMeasurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItems([]);
    setError(null);
    if (!projectId) return;
    const ctrl = new AbortController();
    setLoading(true);
    const token = localStorage.getItem("vendorai_token");
    fetch(`/api/arch/spec-objects?projectId=${encodeURIComponent(projectId)}`, {
      signal: ctrl.signal, headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      if (!response.ok) throw new Error(`Não foi possível consultar as medidas (HTTP ${response.status}).`);
      return response.json();
    }).then(data => {
      if (!ctrl.signal.aborted) setItems(Array.isArray(data.items) ? data.items : []);
    }).catch(reason => {
      if (!ctrl.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao carregar as medidas.");
    }).finally(() => {
      if (!ctrl.signal.aborted) setLoading(false);
    });
    return () => ctrl.abort();
  }, [projectId]);
  const measured = items.filter(item => [item.width_mm,item.height_mm,item.depth_mm,item.length_mm].some(v => v != null));
  const format = (value: number | string | null | undefined) => value == null ? "—" : `${Number(value).toLocaleString("pt-BR")} mm`;
  return <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5" aria-label="Medições técnicas do projeto">
    <h3 className="text-lg font-semibold text-slate-900">Medidas técnicas do projeto</h3>
    <p className="mt-2 text-sm text-slate-600">Dimensões registradas nos objetos de especificação deste projeto. Medidas estimadas ou não verificadas não são tratadas como conferência em campo.</p>
    {!projectId && <p className="mt-4 text-sm text-amber-700">Selecione um projeto para consultar os registros.</p>}
    {loading && <p className="mt-4 text-sm text-slate-600">Carregando medidas…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {!loading && !error && projectId && <p className="mt-4 text-sm font-medium text-slate-700">{measured.length} objeto(s) com alguma dimensão registrada · {items.length} objeto(s) no projeto</p>}
    <div className="mt-3 grid gap-3">
      {measured.map(item => <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
        <h4 className="break-words text-sm font-semibold text-slate-900">{item.name || "Componente sem nome"}</h4>
        <p className="mt-1 text-xs text-slate-500">Ambiente: {item.ambiente_id || "não informado"} · Origem: {item.measurement_source || "não informada"} · Revisão: {item.measurement_revision || "—"}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
          <span>Largura: {format(item.width_mm)}</span><span>Altura: {format(item.height_mm)}</span>
          <span>Profundidade: {format(item.depth_mm)}</span><span>Comprimento: {format(item.length_mm)}</span>
        </div>
      </article>)}
    </div>
    {!loading && !error && projectId && measured.length === 0 && <p className="mt-3 text-sm text-slate-500">Nenhuma dimensão registrada. A integração de captura e conferência do Arqdor Measure continua pendente.</p>}
  </section>;
}


type QuantityObject = {
  id:string; name?:string|null; category?:string|null; ambiente_id?:string|null;
  quantity?:string|number|null; unit?:string|null; quantity_source?:string|null;
  area_m2?:string|number|null; volume_m3?:string|number|null;
  material_name?:string|null; product_name?:string|null;
  measurement_source?:string|null; status?:string|null;
};
function ProjectQuantities({projectId}:{projectId:string|null}) {
  const [items,setItems] = useState<QuantityObject[]>([]);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState<string|null>(null);
  useEffect(()=>{
    setItems([]); setError(null);
    if(!projectId){setLoading(false);return;}
    const controller=new AbortController();
    setLoading(true);
    const token=localStorage.getItem("vendorai_token");
    fetch(`/api/arch/spec-objects?projectId=${encodeURIComponent(projectId)}`,{
      signal:controller.signal,headers:token?{Authorization:`Bearer ${token}`}:{},
    }).then(async response=>{
      if(!response.ok)throw new Error(`Falha na consulta (HTTP ${response.status}).`);
      return response.json();
    }).then(data=>{if(!controller.signal.aborted)setItems(Array.isArray(data.items)?data.items:[]);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Não foi possível carregar quantitativos.");})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[projectId]);
  const fmt=(x:string|number|null|undefined)=>x==null?"Não informado":Number.isFinite(Number(x))?Number(x).toLocaleString("pt-BR",{maximumFractionDigits:3}):"Valor inválido";
  const withQuantity=items.filter(x=>x.quantity!=null && Number.isFinite(Number(x.quantity)));
  return <section aria-label="Quantitativos e materiais do projeto" className="min-w-0 rounded-2xl bg-slate-50 p-4 md:p-5">
    <h3 className="text-lg font-semibold text-slate-900">Quantitativos e materiais</h3>
    <p className="mt-2 text-sm text-slate-600">Dados registrados nos objetos técnicos do projeto. Quantidades e áreas não são calculadas automaticamente a partir de um render.</p>
    {!projectId&&<p className="mt-3 text-sm text-amber-700">Selecione um projeto para consultar os quantitativos.</p>}
    {loading&&<p className="mt-3 text-sm text-slate-600">Carregando quantitativos…</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {!loading&&!error&&projectId&&<p className="mt-3 text-sm font-medium text-slate-800">{items.length} componente(s) · {withQuantity.length} com quantidade registrada</p>}
    <div className="mt-4 grid gap-3">
    {items.map(item=><article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="break-words text-sm font-semibold text-slate-900">{item.name||"Componente"}</h4><span className="text-xs text-slate-500">{item.status||"Sem status"}</span></div>
      <p className="mt-1 break-words text-xs text-slate-600">{item.category||"Categoria não definida"} · Ambiente {item.ambiente_id||"não informado"}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
        <span>Quantidade: {fmt(item.quantity)} {item.unit||""}</span>
        <span>Área: {fmt(item.area_m2)} m²</span>
        <span>Volume: {fmt(item.volume_m3)} m³</span>
        <span>Origem: {item.quantity_source||"não informada"}</span>
      </div>
      <p className="mt-2 break-words text-xs text-slate-600">Material: {item.material_name||"não definido"} · Produto: {item.product_name||"não definido"} · Medida: {item.measurement_source||"não informada"}</p>
    </article>)}
    </div>
    {!loading&&!error&&projectId&&items.length===0&&<p className="mt-3 text-sm text-slate-500">Nenhum objeto técnico registrado para este projeto.</p>}
  </section>;
}
export default function SmartProjectModule({ arqState, onNavigate, projectId }: SmartProjectModuleProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "ambientes" | "timeline" | "briefing" | "especificacoes" | "medicoes" | "quantitativos" | "orcamento" | "documentacao">(() =>
    typeof window !== "undefined" && (["especificacoes", "medicoes", "quantitativos", "orcamento", "documentacao"] as const).includes(
      new URLSearchParams(window.location.search).get("tab") as "especificacoes"
    ) ? (new URLSearchParams(window.location.search).get("tab") as "especificacoes" | "medicoes" | "quantitativos" | "orcamento" | "documentacao") : "overview"
  );

  const contextProject = useMemo(() => getCurrentProject(arqState, projectId), [arqState, projectId]);
  const [loadedProject, setLoadedProject] = useState<ProjectLike | null>(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  useEffect(() => {
    setLoadedProject(null);
    setProjectError(null);
    if (!projectId) { setProjectLoading(false); return; }
    const controller = new AbortController();
    setProjectLoading(true);
    const token = localStorage.getItem("vendorai_token");
    fetch(`/api/arch/projetos/${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async response => {
      if (!response.ok) throw new Error(`Não foi possível abrir o projeto (HTTP ${response.status}).`);
      return response.json();
    }).then(data => {
      if (!controller.signal.aborted) {
        const record = data.projeto;
        if (!record || String(record.id) !== projectId) throw new Error("A API retornou um projeto diferente do solicitado.");
        setLoadedProject({ ...record, ambientes: Array.isArray(data.ambientes) ? data.ambientes : record.ambientes });
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setProjectError(cause instanceof Error ? cause.message : "Falha ao carregar projeto.");
    }).finally(() => {
      if (!controller.signal.aborted) setProjectLoading(false);
    });
    return () => controller.abort();
  }, [projectId]);
  const project = projectId ? (loadedProject?.id === projectId ? loadedProject : null) : contextProject;
  const progress = useMemo(() => getProjectProgress(project), [project]);
  const timeline = useMemo(() => buildTimeline(project), [project]);
  const radar = useMemo(() => buildRadar(project), [project]);
  const environments = project?.ambientes || [];

  if (!project) {
    if (projectId) return <section className="p-6 text-sm text-slate-700" role="status">{projectLoading ? "Carregando projeto solicitado…" : projectError ?? "Projeto não encontrado ou indisponível. Verifique o acesso e selecione-o novamente."}</section>;
    return <EmptyProject onNavigate={onNavigate} />;
  }

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-6 lg:px-10">
        <header className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium text-violet-600">Projeto Inteligente</p>
                <StatusBadge project={project} />
              </div>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
                {getTitle(project)}
              </h1>

              <p className="mt-2 text-base text-slate-500">{getClient(project)}</p>

              {project.descricao ? (
                <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">{String(project.descricao)}</p>
              ) : (
                <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
                  Briefing ainda não detalhado. Complete as informações para melhorar recomendações, renders e especificações.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate?.("home")}
                className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
              >
                Projetos
              </button>

              <button
                type="button"
                onClick={() => onNavigate?.("render")}
                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
              >
                Abrir Studio
              </button>
            </div>
          </div>

          <div className="mt-6">
            <Progress value={progress} />
          </div>
        </header>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Tipo" value={String(project.tipoObra || "Projeto")} />
          <MetricCard label="Área" value={getArea(project)} />
          <MetricCard label="Ambientes" value={String(project.totalAmbientes || environments.length || 0)} />
          <MetricCard label="Orçamento" value={getBudget(project)} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.8fr]">
          <div className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <nav className="mb-6 flex flex-wrap gap-2">
              {[
                ["overview", "Visão geral"],
                ["ambientes", "Ambientes"],
                ["especificacoes", "Especificações"],
                ["medicoes", "Medições"],
                ["quantitativos", "Quantitativos"],
                ["orcamento", "Orçamento"],
                ["documentacao", "Documentação"],
                ["timeline", "Timeline"],
                ["briefing", "Briefing"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key as typeof activeTab)}
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    activeTab === key
                      ? "bg-slate-950 text-white"
                      : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </nav>

            {activeTab === "documentacao" ? (
              <section className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5" aria-label="Documentação do projeto">
                <h3 className="text-lg font-semibold text-slate-900">Documentação e anexos</h3>
                <p className="mt-2 text-sm text-slate-600">Arquivos do dossiê existente do projeto. Para enviar ou editar anexos, utilize a página de detalhes do projeto; esta aba apenas consulta os registros disponíveis.</p>
                <div className="mt-4 grid gap-3">
                  {(project.dossieProjeto?.arquivos ?? []).map(arquivo => (
                    <div key={arquivo.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="break-words text-sm font-semibold text-slate-900">{arquivo.nome}</p>
                      <p className="mt-1 text-xs text-slate-500">{arquivo.tipo} · {arquivo.ambienteId ? `Ambiente: ${arquivo.ambienteId}` : "Documento geral"} · {arquivo.createdAt ? new Date(arquivo.createdAt).toLocaleDateString("pt-BR") : "Data não informada"}</p>
                      {arquivo.url && (/^https?:\/\//i.test(arquivo.url) || arquivo.url.startsWith("/")) && (
                        <a className="mt-2 inline-block break-all text-sm font-medium text-violet-700 underline" href={arquivo.url} target="_blank" rel="noopener noreferrer">Abrir arquivo</a>
                      )}
                    </div>
                  ))}
                </div>
                {(project.dossieProjeto?.arquivos ?? []).length === 0 && <p className="mt-4 text-sm text-slate-500">Nenhum anexo disponível no contexto atual. O dossiê completo pode ser consultado nos detalhes do projeto.</p>}
                <p className="mt-4 text-xs text-amber-700">Controle de revisões e histórico imutável de documentos ainda não integrados nesta aba.</p>
              </section>
            ) : null}

            {activeTab === "orcamento" ? (
              <section className="min-w-0 overflow-hidden rounded-2xl bg-white" aria-label="Orçamento técnico do projeto">
                <p className="px-4 pt-4 text-xs text-slate-600">Orçamento integrado ao projeto, utilizando o motor comercial existente. Confira medidas, composições e valores antes de aprovar ou enviar à execução.</p>
                <Suspense fallback={<p className="p-5 text-sm text-slate-600">Carregando orçamento…</p>}>
                  <RealBudgetEngineStudio arqState={{ ...arqState, currentProject: project, projectId: project.id }} onNavigate={onNavigate} />
                </Suspense>
              </section>
            ) : null}

            {activeTab === "quantitativos" ? <ProjectQuantities projectId={project.id ?? null} /> : null}

            {activeTab === "medicoes" ? <ProjectMeasurements projectId={project.id ?? null} /> : null}

            {activeTab === "especificacoes" ? (
              <div className="min-w-0 overflow-hidden rounded-2xl bg-slate-950" style={{ minHeight: 540 }}>
                <SmartSpecModule projectId={project.id ?? null} onOpenRender={() => onNavigate?.("renders")} />
              </div>
            ) : null}

            {activeTab === "overview" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-950">Próxima ação</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{getNextAction(project)}</p>
                  <button
                    type="button"
                    onClick={() => onNavigate?.("render")}
                    className="mt-5 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700"
                  >
                    Executar próxima etapa
                  </button>
                </div>

                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="text-sm font-semibold text-slate-950">Memória do projeto</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    A memória será alimentada por briefing, renders, aprovações, especificações e decisões registradas.
                  </p>
                </div>
              </div>
            ) : null}

            {activeTab === "ambientes" ? (
              <div className="space-y-3">
                {environments.length ? (
                  environments.map((environment) => (
                    <div
                      key={String(environment.id || getEnvironmentName(environment))}
                      className="flex flex-col gap-3 rounded-3xl border border-slate-100 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-slate-950">{getEnvironmentName(environment)}</p>
                        <p className="mt-1 text-sm text-slate-500">{getEnvironmentStatus(environment)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          try {
                            sessionStorage.setItem("arq_studio_ambiente", getEnvironmentName(environment));
                            sessionStorage.setItem("arq_studio_step", "imagem");
                          } catch {}
                          onNavigate?.("render");
                        }}
                        className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:text-violet-700"
                      >
                        Abrir ambiente
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-sm font-semibold text-slate-950">Nenhum ambiente cadastrado.</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Adicione uma cozinha, sala, suíte, banheiro ou qualquer outro ambiente do projeto.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {activeTab === "timeline" ? (
              <div className="space-y-4">
                {timeline.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="h-3 w-3 rounded-full bg-violet-600" />
                      {index < timeline.length - 1 ? <span className="mt-2 h-full min-h-[48px] w-px bg-slate-200" /> : null}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                      <p className="mt-1 text-xs text-slate-400">{item.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {activeTab === "briefing" ? (
              <div className="rounded-3xl bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-950">Briefing Vivo</p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {project.descricao
                    ? String(project.descricao)
                    : "O briefing ainda está vazio. Ele será construído ao longo do projeto e servirá como fonte de verdade para a IA."}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-950">Radar</h2>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">IA</span>
            </div>

            <div className="space-y-3">
              {radar.map((item) => (
                <div key={item.id} className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex gap-3">
                    <span
                      className={[
                        "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                        item.severity === "warning"
                          ? "bg-amber-500"
                          : item.severity === "success"
                            ? "bg-emerald-500"
                            : "bg-blue-500",
                      ].join(" ")}
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
