import React, { useState } from "react";
import ArqdorConstructionWorkspace from "./ArqdorConstructionWorkspace";
import AdvancedSchedulePanel from "./AdvancedSchedulePanel";
import CompleteSiteDiaryPanel from "./CompleteSiteDiaryPanel";
import RealConstructionFinancePanel from "./RealConstructionFinancePanel";
import RealConstructionQualityPanel from "./RealConstructionQualityPanel";
import RealProjectDecisionsPanel from "./RealProjectDecisionsPanel";

type Props = {
  arqState?: any;
  onNavigate?: (module: string) => void;
};

type Mode = "planning" | "diary" | "finance" | "quality" | "decisions" | "operation";

export default function ConstructionHub({ arqState, onNavigate }: Props) {
  const [mode, setMode] = useState<Mode>("planning");

  return (
    <div className="min-h-screen bg-[#f7f7f8]">
      <div className="mx-auto w-full max-w-[1760px] px-5 pt-5 lg:px-8">
        <div className="inline-flex flex-wrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("planning")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "planning" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Planejamento físico-financeiro
          </button>
          <button
            type="button"
            onClick={() => setMode("diary")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "diary" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Diário de Obra
          </button>
          <button
            type="button"
            onClick={() => setMode("finance")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "finance" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Financeiro da Obra
          </button>
          <button
            type="button"
            onClick={() => setMode("quality")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "quality" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Qualidade
          </button>
          <button
            type="button"
            onClick={() => setMode("decisions")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "decisions" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Decisões
          </button>
          <button
            type="button"
            onClick={() => setMode("operation")}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${mode === "operation" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}
          >
            Operação da obra
          </button>
        </div>
      </div>

      {mode === "planning" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <AdvancedSchedulePanel arqState={arqState} />
        </div>
      ) : mode === "diary" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <CompleteSiteDiaryPanel arqState={arqState} />
        </div>
      ) : mode === "finance" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <RealConstructionFinancePanel arqState={arqState} />
        </div>
      ) : mode === "quality" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <RealConstructionQualityPanel arqState={arqState} />
        </div>
      ) : mode === "decisions" ? (
        <div className="mx-auto w-full max-w-[1760px] px-5 py-5 lg:px-8">
          <RealProjectDecisionsPanel arqState={arqState} onNavigate={onNavigate} />
        </div>
      ) : (
        <ArqdorConstructionWorkspace arqState={arqState} onNavigate={onNavigate} />
      )}
    </div>
  );
}
