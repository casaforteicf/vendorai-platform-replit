import React, { useMemo, useState } from "react";
import { RenderQualityPanel } from "./RenderQualityPanel";

type SmartRenderEngineProps = {
  arqState: any;
  onNavigate?: (module: string) => void;
};

type RenderVersion = {
  id: string;
  label: string;
  imageUrl?: string;
  prompt?: string;
  createdAt?: string;
  approved?: boolean;
};

type ObjectInsight = {
  label: string;
  value: string;
};

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

function environmentName(project: any): string {
  const environment = project?.ambientes?.[0];
  return environment?.nome || environment?.name || environment?.titulo || "Ambiente principal";
}

function extractVersions(arqState: any): RenderVersion[] {
  const project = getProject(arqState);
  const raw = project?.renderVersions || project?.versoes || project?.renders || arqState?.renderVersions || arqState?.renders || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item: any, index: number) => ({
    id: String(item.id || item.renderId || `version-${index + 1}`),
    label: item.label || item.nome || item.title || `V${String(index + 1).padStart(2, "0")}`,
    imageUrl: item.imageUrl || item.url || item.renderUrl || item.outputUrl,
    prompt: item.prompt || item.description || item.descricao,
    createdAt: item.createdAt || item.created_at || item.updatedAt || item.updated_at,
    approved: Boolean(item.approved || item.aprovado),
  }));
}

function formatDate(value?: string): string {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const defaultObject = {
  name: "Objeto selecionado",
  type: "Mobiliário",
  supplier: "Fornecedor a definir",
  code: "ARQ-OBJ-001",
  price: "A cotar",
  deadline: "A definir",
  compatibility: "92%",
  material: "Material em análise",
  recommendation: "Selecione um objeto no render para ativar custos, fornecedores, materiais e produção.",
};

const aiSuggestions = [
  {
    title: "Iluminação",
    description: "Adicionar luz indireta pode melhorar a leitura noturna do ambiente.",
    impact: "Qualidade +12%",
  },
  {
    title: "Materiais",
    description: "Revisar tecido e madeira pode reduzir custo sem comprometer o conceito.",
    impact: "Economia potencial",
  },
  {
    title: "Produção",
    description: "Marcenaria e marmoraria ainda precisam ser vinculadas ao pacote técnico.",
    impact: "Pendência executiva",
  },
];

function InfoCard({ label, value }: ObjectInsight) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function TopNav({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  const tabs = ["Visão", "Planta", "Cortes", "Elevações", "Storyboard", "Comparar", "Versões"];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={[
            "rounded-2xl px-4 py-2 text-sm font-semibold transition",
            active === tab ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function RenderCanvas({
  activeVersion,
  onGenerate,
}: {
  activeVersion?: RenderVersion;
  onGenerate: (prompt: string) => void;
}) {
  const [overlay, setOverlay] = useState("IA");

  return (
    <div className="relative overflow-hidden rounded-[38px] border border-slate-100 bg-slate-950 p-4 shadow-sm">
      <div className="absolute left-8 top-8 z-10 rounded-2xl bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
        Render protagonista • AI Score 86%
      </div>

      <div className="absolute right-8 top-8 z-10 flex gap-2 rounded-2xl bg-white/95 p-2 shadow-sm backdrop-blur">
        {["IA", "Medidas", "Camadas", "Custos"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setOverlay(item)}
            className={[
              "rounded-xl px-3 py-2 text-xs font-semibold transition",
              overlay === item ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
            ].join(" ")}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="flex min-h-[680px] items-center justify-center rounded-[32px] bg-slate-900">
        {activeVersion?.imageUrl ? (
          <img
            src={activeVersion.imageUrl}
            alt={activeVersion.label}
            className="max-h-[680px] w-full rounded-[32px] object-contain"
          />
        ) : (
          <div className="max-w-lg text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[32px] bg-white/10 text-3xl font-semibold text-white/60">
              ARQ
            </div>
            <h2 className="mt-6 text-3xl font-semibold text-white">Design Studio Inteligente</h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              O render principal aparecerá aqui com seleção de objetos, IA contextual, versões, custos e produção.
            </p>
            <button
              type="button"
              onClick={() => onGenerate("Gerar primeira versão do ambiente mantendo briefing, estilo e proporções do projeto.")}
              className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-violet-100"
            >
              Gerar primeira versão
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-2xl bg-white/95 p-2 shadow-sm backdrop-blur">
        {["Selecionar", "Material", "Iluminação", "Máscara", "Comparar"].map((item) => (
          <button
            key={item}
            type="button"
            className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-violet-50 hover:text-violet-700"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="absolute bottom-8 right-8 z-10 rounded-2xl bg-black/45 px-4 py-3 text-xs text-white backdrop-blur">
        Overlay ativo: <span className="font-semibold">{overlay}</span>
      </div>
    </div>
  );
}

function AIPanel({
  prompt,
  setPrompt,
  onGenerate,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  onGenerate: () => void;
}) {
  return (
    <section className="rounded-[34px] border border-violet-100 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Architect</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">Comando contextual</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">Ativo</span>
      </div>

      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Ex: deixe esse ambiente mais sofisticado, com iluminação indireta e mantendo o layout aprovado..."
        className="min-h-[130px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
      />

      <button
        type="button"
        onClick={onGenerate}
        disabled={!prompt.trim()}
        className="mt-3 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Gerar nova versão
      </button>

      <div className="mt-5 space-y-3">
        {aiSuggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => setPrompt(suggestion.description)}
            className="w-full rounded-3xl bg-slate-50 p-4 text-left transition hover:bg-violet-50"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">{suggestion.title}</p>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                {suggestion.impact}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{suggestion.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ObjectPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objeto inteligente</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">{defaultObject.name}</h3>
      <p className="mt-1 text-sm text-slate-500">{defaultObject.type} • {defaultObject.code}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <InfoCard label="Fornecedor" value={defaultObject.supplier} />
        <InfoCard label="Preço" value={defaultObject.price} />
        <InfoCard label="Prazo" value={defaultObject.deadline} />
        <InfoCard label="Compatível" value={defaultObject.compatibility} />
      </div>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Material</p>
        <p className="mt-1 text-sm text-slate-500">{defaultObject.material}</p>
      </div>

      <div className="mt-4 rounded-3xl bg-violet-50 p-4">
        <p className="text-sm font-semibold text-violet-950">Recomendação IA</p>
        <p className="mt-1 text-xs leading-5 text-violet-700">{defaultObject.recommendation}</p>
      </div>
    </section>
  );
}

function CostPanel() {
  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Custos conectados</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-950">Impacto financeiro</h3>

      <div className="mt-5 space-y-3">
        <InfoCard label="Objeto selecionado" value="A cotar" />
        <InfoCard label="Economia possível" value="A calcular" />
        <InfoCard label="Impacto no ambiente" value="A validar" />
      </div>

      <button
        type="button"
        className="mt-5 w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
      >
        Abrir orçamento
      </button>
    </section>
  );
}

function VersionTimeline({
  versions,
  activeId,
  setActiveId,
  onAdd,
}: {
  versions: RenderVersion[];
  activeId: string | null;
  setActiveId: (id: string) => void;
  onAdd: () => void;
}) {
  const fallback = ["V01 Conceito", "V02 Layout", "V03 Materiais", "V04 Iluminação"];

  return (
    <section className="rounded-[34px] border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex gap-3 overflow-x-auto">
        <div className="flex min-w-[160px] flex-col justify-center rounded-2xl bg-violet-50 p-4">
          <p className="text-xs font-semibold text-violet-700">Versão atual</p>
          <p className="mt-1 text-3xl font-semibold text-violet-700">
            {versions.find((version) => version.id === activeId)?.label || "V00"}
          </p>
        </div>

        {versions.length ? (
          versions.map((version) => (
            <button
              key={version.id}
              type="button"
              onClick={() => setActiveId(version.id)}
              className={[
                "min-w-[200px] rounded-2xl border p-3 text-left transition",
                activeId === version.id ? "border-violet-300 bg-violet-50" : "border-slate-100 bg-slate-50 hover:border-violet-200",
              ].join(" ")}
            >
              <div className="h-24 rounded-xl bg-slate-200">
                {version.imageUrl ? <img src={version.imageUrl} alt={version.label} className="h-full w-full rounded-xl object-cover" /> : null}
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">{version.label}</p>
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">{version.prompt || "Versão gerada"}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(version.createdAt)}</p>
            </button>
          ))
        ) : (
          fallback.map((item) => (
            <div key={item} className="min-w-[200px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="h-24 rounded-xl bg-slate-200" />
              <p className="mt-2 text-sm font-semibold text-slate-800">{item}</p>
              <p className="mt-1 text-xs text-slate-500">Preparado para histórico real</p>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={onAdd}
          className="flex min-w-[140px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-3xl text-violet-600"
        >
          +
        </button>
      </div>
    </section>
  );
}

export default function SmartRenderEngine({ arqState, onNavigate }: SmartRenderEngineProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const extracted = useMemo(() => extractVersions(arqState), [arqState]);
  const [versions, setVersions] = useState<RenderVersion[]>(extracted);
  const [activeId, setActiveId] = useState<string | null>(extracted[0]?.id || null);
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState("Visão");

  const activeVersion = versions.find((version) => version.id === activeId) || versions[0];

  const createVersion = (value?: string) => {
    const finalPrompt = (value || prompt).trim();
    if (!finalPrompt) return;

    const version: RenderVersion = {
      id: `local-${Date.now()}`,
      label: `V${String(versions.length + 1).padStart(2, "0")}`,
      prompt: finalPrompt,
      createdAt: new Date().toISOString(),
    };

    setVersions((current) => [version, ...current]);
    setActiveId(version.id);
    setPrompt("");
  };

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm text-slate-500">Projetos / {projectTitle(project)} / Studio</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{environmentName(project)}</h1>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">Design Studio</span>
              </div>
            </div>

            <TopNav active={tab} onChange={setTab} />
          </div>
        </header>

        <main className="grid gap-5 xl:grid-cols-[1fr_410px]">
          <section className="space-y-5">
            <RenderCanvas activeVersion={activeVersion} onGenerate={createVersion} />
            <VersionTimeline versions={versions} activeId={activeId} setActiveId={setActiveId} onAdd={() => createVersion("Criar nova versão do ambiente.")} />
          </section>

          <aside className="space-y-5">
            <RenderQualityPanel />
            <AIPanel prompt={prompt} setPrompt={setPrompt} onGenerate={() => createVersion()} />
            <ObjectPanel />
            <CostPanel />

            <section className="rounded-[34px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próximas etapas</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Especificar", "especificacao"],
                  ["Produção", "office"],
                  ["Orçamento", "orcamento"],
                  ["Cliente", "cliente"],
                ].map(([label, module]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onNavigate?.(module)}
                    className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}
