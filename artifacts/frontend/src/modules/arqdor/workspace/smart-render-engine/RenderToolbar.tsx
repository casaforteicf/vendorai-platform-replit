import React from "react";
import { useRenderEngine, type RenderEngineMode } from "./RenderEngineContext";

const actions: Array<{ id: RenderEngineMode; label: string }> = [
  { id: "view", label: "Visualizar" },
  { id: "compare", label: "Comparar" },
  { id: "prompt", label: "Prompt" },
  { id: "versions", label: "Versões" },
  { id: "export", label: "Exportar" },
];

export function RenderToolbar() {
  const { mode, setMode } = useRenderEngine();

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-2 shadow-sm">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => setMode(action.id)}
          className={[
            "rounded-xl px-3 py-2 text-xs font-semibold transition",
            mode === action.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-violet-50 hover:text-violet-700",
          ].join(" ")}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
