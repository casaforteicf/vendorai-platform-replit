export type RealEnvironmentKind = "auto" | "terreno" | "cozinha" | "banheiro" | "sala" | "quarto" | "fachada" | "area_externa" | "piscina" | "escritorio" | "outro";
export type RealEnvironmentUseMode = "existing" | "reference" | "modify";
export type RealEnvironmentAction = "preserve" | "remove" | "replace" | "relocate" | "review";

type RealEnvironmentElement = {
  id: string;
  label: string;
  category: string;
  confidence: number;
  action: RealEnvironmentAction;
  source: "ai" | "user";
};

type RealEnvironmentAnalysis = {
  kind: Exclude<RealEnvironmentKind, "auto">;
  useMode: RealEnvironmentUseMode;
  summary: string;
  confidence: number;
  elements: RealEnvironmentElement[];
  warnings: string[];
};

type Props = {
  kind: RealEnvironmentKind;
  useMode: RealEnvironmentUseMode;
  onKindChange: (kind: RealEnvironmentKind) => void;
  onUseModeChange: (mode: RealEnvironmentUseMode) => void;
  hasImage: boolean;
  state: "idle" | "analyzing" | "ready" | "error";
  message: string | null;
  analysis: RealEnvironmentAnalysis | null;
  onReanalyze: () => void;
  onAction: (elementId: string, action: RealEnvironmentAction) => void;
};

export default function ConceptRealEnvironmentPanel({
  kind,
  useMode,
  onKindChange,
  onUseModeChange,
  hasImage,
  state,
  message,
  analysis,
  onReanalyze,
  onAction,
}: Props) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <div className="font-semibold text-emerald-950">Base real do projeto</div>
          <div className="mt-0.5 text-emerald-900/75">
            O Arqdor preserva o local existente e só altera elementos confirmados para a intervenção.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2 py-1">
            <span className="text-[10px] font-semibold text-emerald-800">O que é</span>
            <select value={kind} onChange={(event) => onKindChange(event.currentTarget.value as RealEnvironmentKind)} className="bg-transparent text-[11px] font-semibold outline-none">
              <option value="auto">Detectar automaticamente</option>
              <option value="terreno">Terreno</option>
              <option value="cozinha">Cozinha</option>
              <option value="banheiro">Banheiro</option>
              <option value="sala">Sala</option>
              <option value="quarto">Quarto</option>
              <option value="fachada">Fachada</option>
              <option value="area_externa">Área externa</option>
              <option value="piscina">Piscina</option>
              <option value="escritorio">Escritório</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2 py-1">
            <span className="text-[10px] font-semibold text-emerald-800">Uso</span>
            <select value={useMode} onChange={(event) => onUseModeChange(event.currentTarget.value as RealEnvironmentUseMode)} className="bg-transparent text-[11px] font-semibold outline-none">
              <option value="existing">Projetar sobre o existente</option>
              <option value="modify">Reformar / modificar existente</option>
              <option value="reference">Somente referência visual</option>
            </select>
          </label>
          {hasImage && (
            <button type="button" onClick={onReanalyze} disabled={state === "analyzing"} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-900 disabled:opacity-50">
              {state === "analyzing" ? "Analisando..." : "Reanalisar foto"}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[11px] ${state === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-white text-emerald-900"}`}>
          {message}
        </div>
      )}

      {analysis && (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-emerald-950">
            <span className="rounded-full bg-emerald-700 px-2 py-1 font-bold text-white">{analysis.kind.replaceAll("_", " ")}</span>
            <span>confiança {Math.round(analysis.confidence * 100)}%</span><span>·</span>
            <span>{analysis.elements.length} elemento(s) reconhecido(s)</span>
          </div>
          <div className="mt-2 text-[11px] leading-relaxed text-emerald-900/80">{analysis.summary}</div>
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900">
            A foto não cria medidas reais sozinha. Medidas confirmadas e geometria do projeto têm prioridade sobre qualquer inferência visual.
          </div>
          {analysis.elements.length > 0 && (
            <div className="mt-3 max-h-64 space-y-1.5 overflow-auto pr-1">
              {analysis.elements.slice(0, 30).map((element) => (
                <div key={element.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-white px-2.5 py-2">
                  <div className="min-w-[170px] flex-1">
                    <div className="font-semibold text-slate-900">{element.label}</div>
                    <div className="text-[10px] text-slate-500">
                      {element.category.replaceAll("_", " ")} · confiança {Math.round(element.confidence * 100)}%
                      {element.source === "user" ? " · confirmado pelo usuário" : ""}
                    </div>
                  </div>
                  <select value={element.action} onChange={(event) => onAction(element.id, event.currentTarget.value as RealEnvironmentAction)} className="rounded-md border bg-background px-2 py-1 text-[10px] font-semibold" aria-label={`Intervenção para ${element.label}`}>
                    <option value="preserve">Preservar</option><option value="remove">Remover</option><option value="replace">Substituir</option><option value="relocate">Realocar</option><option value="review">Revisar</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          {analysis.warnings.length > 0 && <div className="mt-2 text-[10px] text-amber-800">{analysis.warnings.slice(0, 4).join(" · ")}</div>}
        </div>
      )}
    </div>
  );
}
