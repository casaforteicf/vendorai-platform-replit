import React, { useMemo, useState } from "react";

type SmartRenderEngineProps = {
  arqState: any;
};

type RenderVersion = {
  id: string;
  label: string;
  imageUrl?: string;
  prompt?: string;
  createdAt?: string;
};

function getProject(arqState: any) {
  const projects = arqState?.projects || arqState?.projetos || arqState?.allProjects || [];
  return arqState?.currentProject || arqState?.selectedProject || arqState?.project || (Array.isArray(projects) ? projects[0] : null);
}

function getTitle(project: any): string {
  return project?.titulo || project?.title || project?.name || "Ambiente Inteligente";
}

function getEnvironment(project: any): string {
  const env = project?.ambientes?.[0];
  return env?.nome || env?.name || env?.titulo || "Design Studio";
}

function getVersions(arqState: any): RenderVersion[] {
  const project = getProject(arqState);
  const raw = project?.renderVersions || project?.versoes || project?.renders || arqState?.renderVersions || arqState?.renders || [];
  if (!Array.isArray(raw)) return [];

  return raw.map((item: any, index: number) => ({
    id: String(item.id || item.renderId || `render-${index + 1}`),
    label: item.label || item.nome || item.title || `V${String(index + 1).padStart(2, "0")}`,
    imageUrl: item.imageUrl || item.url || item.renderUrl || item.outputUrl,
    prompt: item.prompt || item.description || item.descricao,
    createdAt: item.createdAt || item.created_at || item.updatedAt || item.updated_at,
  }));
}

function formatDate(value?: string): string {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

const defaultObject = {
  name: "Poltrona Lisboa",
  supplier: "Estofados Casa",
  code: "EST-001-LIS",
  price: "R$ 3.850",
  deadline: "18 dias",
  compatibility: 92,
  material: "Tecido Linho Bege",
};

export default function SmartRenderEngine({ arqState }: SmartRenderEngineProps) {
  const project = useMemo(() => getProject(arqState), [arqState]);
  const detectedVersions = useMemo(() => getVersions(arqState), [arqState]);
  const [versions, setVersions] = useState<RenderVersion[]>(detectedVersions);
  const [activeId, setActiveId] = useState<string | null>(detectedVersions[0]?.id || null);
  const [prompt, setPrompt] = useState("");
  const [rightTab, setRightTab] = useState<"ia" | "objeto" | "custos">("ia");

  const active = versions.find((version) => version.id === activeId) || versions[0];
  const hasImage = Boolean(active?.imageUrl);

  const createVersion = (value?: string) => {
    const finalPrompt = (value || prompt).trim();
    if (!finalPrompt) return;

    const newVersion: RenderVersion = {
      id: `local-${Date.now()}`,
      label: `V${String(versions.length + 1).padStart(2, "0")}`,
      prompt: finalPrompt,
      createdAt: new Date().toISOString(),
    };

    setVersions((current) => [newVersion, ...current]);
    setActiveId(newVersion.id);
    setPrompt("");
  };

  return (
    <div className="min-h-screen bg-[#f7f7f8] text-slate-950">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-5 px-6 py-6">
        <header className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm text-slate-500">Projetos / {getTitle(project)} / Studio</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{getEnvironment(project)}</h1>
                <span className="rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">Em desenvolvimento</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {["Visão", "Planta", "Cortes", "Elevações", "Storyboard", "Comparar", "Versões"].map((item, index) => (
                <button
                  key={item}
                  type="button"
                  className={[
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    index === 0 ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700",
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="grid gap-5 xl:grid-cols-[1fr_390px]">
          <section className="space-y-5">
            <div className="relative overflow-hidden rounded-[34px] border border-slate-100 bg-slate-950 p-4 shadow-sm">
              <div className="absolute left-8 top-8 z-10 rounded-2xl bg-black/45 px-4 py-2 text-xs font-semibold text-white backdrop-blur">
                Render protagonista • AI Score 86%
              </div>

              <div className="absolute right-8 top-8 z-10 flex gap-2 rounded-2xl bg-white/95 p-2 shadow-sm backdrop-blur">
                {["Selecionar", "Medidas", "Camadas", "Comparar"].map((item) => (
                  <button key={item} type="button" className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-700">
                    {item}
                  </button>
                ))}
              </div>

              <div className="flex min-h-[620px] items-center justify-center rounded-[28px] bg-slate-900">
                {hasImage ? (
                  <img src={active?.imageUrl} alt={active?.label || "Render"} className="max-h-[620px] w-full rounded-[28px] object-contain" />
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
                      onClick={() => createVersion("Gerar primeira versão do ambiente mantendo briefing e estilo do cliente.")}
                      className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-violet-100"
                    >
                      Gerar primeira versão
                    </button>
                  </div>
                )}
              </div>

              <div className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2 rounded-2xl bg-white/95 p-2 shadow-sm backdrop-blur">
                {["Mover", "Trocar material", "Duplicar", "Excluir", "Mais"].map((item) => (
                  <button key={item} type="button" className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-violet-50 hover:text-violet-700">
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <section className="rounded-[30px] border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex gap-3 overflow-x-auto">
                <div className="flex min-w-[150px] flex-col justify-center rounded-2xl bg-violet-50 p-4">
                  <p className="text-xs font-semibold text-violet-700">Versão atual</p>
                  <p className="mt-1 text-3xl font-semibold text-violet-700">{active?.label || "V00"}</p>
                </div>

                {versions.length ? (
                  versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      onClick={() => setActiveId(version.id)}
                      className={[
                        "min-w-[180px] rounded-2xl border p-3 text-left transition",
                        active?.id === version.id ? "border-violet-300 bg-violet-50" : "border-slate-100 bg-slate-50 hover:border-violet-200",
                      ].join(" ")}
                    >
                      <div className="h-20 rounded-xl bg-slate-200">
                        {version.imageUrl ? <img src={version.imageUrl} alt={version.label} className="h-full w-full rounded-xl object-cover" /> : null}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{version.label}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{version.prompt || "Versão gerada"}</p>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(version.createdAt)}</p>
                    </button>
                  ))
                ) : (
                  ["V01 Conceito", "V02 Layout", "V03 Materiais", "V04 Iluminação"].map((item) => (
                    <div key={item} className="min-w-[180px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      <div className="h-20 rounded-xl bg-slate-200" />
                      <p className="mt-2 text-sm font-semibold text-slate-800">{item}</p>
                      <p className="mt-1 text-xs text-slate-500">Preparado para histórico real</p>
                    </div>
                  ))
                )}

                <button
                  type="button"
                  onClick={() => createVersion("Criar nova versão do ambiente.")}
                  className="flex min-w-[140px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-3xl text-violet-600"
                >
                  +
                </button>
              </div>
            </section>
          </section>

          <aside className="space-y-5">
            <section className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-sm">
              <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-1">
                {[
                  ["ia", "IA"],
                  ["objeto", "Objeto"],
                  ["custos", "Custos"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRightTab(key as "ia" | "objeto" | "custos")}
                    className={[
                      "rounded-xl px-3 py-2 text-xs font-semibold transition",
                      rightTab === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-violet-700",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {rightTab === "ia" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">AI Architect</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">Comando contextual</h3>

                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Ex: deixe essa sala mais sofisticada, com iluminação indireta e menos elementos decorativos..."
                    className="mt-4 min-h-[130px] w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                  />

                  <button
                    type="button"
                    onClick={() => createVersion()}
                    disabled={!prompt.trim()}
                    className="mt-3 w-full rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Gerar nova versão
                  </button>

                  <div className="mt-5 space-y-3">
                    {[
                      ["Iluminação", "Falta luz indireta para cena noturna."],
                      ["Custo", "Existe alternativa de tecido com menor custo."],
                      ["Produção", "Marcenaria ainda precisa de fornecedor."],
                    ].map(([title, desc]) => (
                      <button
                        key={title}
                        type="button"
                        onClick={() => setPrompt(desc)}
                        className="w-full rounded-2xl bg-slate-50 p-4 text-left hover:bg-violet-50"
                      >
                        <p className="text-sm font-semibold text-slate-900">{title}</p>
                        <p className="mt-1 text-xs text-slate-500">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {rightTab === "objeto" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Objeto inteligente</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">{defaultObject.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{defaultObject.supplier} • {defaultObject.code}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <Info label="Preço" value={defaultObject.price} />
                    <Info label="Prazo" value={defaultObject.deadline} />
                    <Info label="Compatível" value={`${defaultObject.compatibility}%`} />
                    <Info label="Material" value={defaultObject.material} />
                  </div>

                  <div className="mt-5 rounded-3xl bg-violet-50 p-4">
                    <p className="text-sm font-semibold text-violet-950">Recomendação IA</p>
                    <p className="mt-1 text-xs leading-5 text-violet-700">Manter modelo, revisar tecido para reduzir custo e melhorar durabilidade.</p>
                  </div>
                </div>
              ) : null}

              {rightTab === "custos" ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Orçamento conectado</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">Impacto financeiro</h3>
                  <div className="mt-5 space-y-3">
                    <Info label="Objeto selecionado" value="R$ 3.850" />
                    <Info label="Economia possível" value="R$ 1.850" />
                    <Info label="Impacto no ambiente" value="+4,2%" />
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[30px] border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Próximas etapas</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["Especificar", "especificacao"],
                  ["Produção", "office"],
                  ["Orçamento", "orcamento"],
                  ["Apresentar", "cliente"],
                ].map(([label]) => (
                  <button key={label} type="button" className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-violet-50 hover:text-violet-700">
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold text-slate-800">{value}</p>
    </div>
  );
}
