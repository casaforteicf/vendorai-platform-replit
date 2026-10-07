type ReferencePhotoAnalysis = {
  kind: "plan" | "terrain" | "room" | "facade" | "inspiration" | "unknown";
  confidence: number;
  summary: string;
  perspective: "top_down" | "frontal" | "oblique" | "interior" | "unknown";
  needsScaleAnchor: boolean;
  suggestedAnchor?: string;
  detectedElements: string[];
  preserveElements: string[];
  removableElements: string[];
  projectHints: string[];
  sourceModel: string;
};

function photoKindLabel(kind: ReferencePhotoAnalysis["kind"]) {
  if (kind === "terrain") return "Terreno";
  if (kind === "room") return "Ambiente";
  if (kind === "facade") return "Fachada";
  return "Referência visual";
}

export default function ConceptReferenceSceneCard({ analysis }: { analysis: ReferencePhotoAnalysis }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs">
      <div className="font-semibold text-emerald-950">
        Foto usada como cena-base · {photoKindLabel(analysis.kind)}
      </div>
      <div className="mt-1 text-emerald-900/80">{analysis.summary}</div>
      {analysis.needsScaleAnchor && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
          Escala real ainda precisa de uma medida conhecida.
          {analysis.suggestedAnchor ? <> Sugestão: {analysis.suggestedAnchor}.</> : null}
        </div>
      )}
      {analysis.detectedElements.length > 0 && (
        <div className="mt-2 text-[10px] text-emerald-900/80">
          Detectado: {analysis.detectedElements.slice(0, 8).join(" · ")}
        </div>
      )}
      {analysis.removableElements.length > 0 && (
        <div className="mt-1 text-[10px] text-emerald-900/80">
          Podem sair somente quando a nova intervenção ocupar a mesma área: {analysis.removableElements.slice(0, 8).join(" · ")}.
        </div>
      )}
      <div className="mt-2 text-[10px] font-semibold text-emerald-800">
        A foto não será deformada como planta 2D e permanece vinculada ao pré-projeto para orientar implantação, ambiente e render.
      </div>
    </div>
  );
}
