import React from "react";
import { useRenderEngine } from "./RenderEngineContext";

export function RenderVersionTimeline() {
  const { versions, activeVersionId, setActiveVersionId, setCompareVersionId } = useRenderEngine();

  if (!versions.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Nenhuma versão gerada ainda.
      </div>
    );
  }

  return (
    <div className="flex h-36 items-center gap-3 overflow-x-auto rounded-[28px] border border-slate-100 bg-white p-4 shadow-sm">
      {versions.map((version) => (
        <button
          key={version.id}
          type="button"
          onClick={() => setActiveVersionId(version.id)}
          onDoubleClick={() => setCompareVersionId(version.id)}
          className={[
            "flex h-24 min-w-[170px] flex-col justify-between rounded-2xl border p-3 text-left transition",
            activeVersionId === version.id ? "border-violet-300 bg-violet-50" : "border-slate-100 bg-slate-50 hover:border-violet-200",
          ].join(" ")}
        >
          <div>
            <p className="line-clamp-1 text-sm font-semibold text-slate-900">{version.label}</p>
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{version.prompt || "Sem prompt registrado"}</p>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            {version.favorite ? <span>★ Favorito</span> : null}
            {version.approved ? <span>✓ Aprovado</span> : null}
          </div>
        </button>
      ))}
    </div>
  );
}
